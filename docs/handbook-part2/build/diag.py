"""Tiny SVG generator for architecture and sequence diagrams.

Every colour comes from CSS classes (svg.hd …) that use the page's CSS variables,
so diagrams follow the light/dark theme and print in the light theme.
"""
import html

E = 7  # cylinder ellipse height


def esc(s):
    return html.escape(str(s), quote=True)


def _defs(did):
    return (
        f'<defs>'
        f'<marker id="{did}-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker>'
        f'<marker id="{did}-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ah2"/></marker>'
        f'</defs>'
    )


def _text_block(cx, cy, title, sub):
    lines = [(title, 't')]
    if sub:
        lines += [(s, 's') for s in sub.split('\n')]
    total = 15 + 13 * (len(lines) - 1)
    y = cy - total / 2 + 11
    out = []
    for i, (txt, cls) in enumerate(lines):
        out.append(f'<text class="{cls}" x="{cx:.1f}" y="{y:.1f}" text-anchor="middle">{esc(txt)}</text>')
        y += 15 if i == 0 else 13
    return ''.join(out)


def _node(n):
    x, y, w, h = n['x'], n['y'], n['w'], n['h']
    k = n.get('k', 'svc')
    cx, cy = x + w / 2, y + h / 2
    if k in ('store', 'cache'):
        body = (f'<path class="n {k}" d="M{x},{y+E} a{w/2},{E} 0 0,0 {w},0 v{h-2*E} a{w/2},{E} 0 0,1 {-w},0 z"/>'
                f'<path class="n {k} rim" d="M{x},{y+E} a{w/2},{E} 0 0,0 {w},0 a{w/2},{E} 0 0,0 {-w},0"/>')
        cy += E / 2
    else:
        body = f'<rect class="n {k}" x="{x}" y="{y}" width="{w}" height="{h}" rx="7"/>'
    return body + _text_block(cx, cy, n['t'], n.get('s'))


def _anchor(n, side, off=0):
    x, y, w, h = n['x'], n['y'], n['w'], n['h']
    if side == 'r':
        return x + w, y + h / 2 + off
    if side == 'l':
        return x, y + h / 2 + off
    if side == 't':
        return x + w / 2 + off, y
    return x + w / 2 + off, y + h


def _auto_sides(a, b):
    ax0, ax1, bx0, bx1 = a['x'], a['x'] + a['w'], b['x'], b['x'] + b['w']
    ay0, ay1, by0, by1 = a['y'], a['y'] + a['h'], b['y'], b['y'] + b['h']
    if ax1 <= bx0:
        return 'r', 'l'
    if bx1 <= ax0:
        return 'l', 'r'
    if ay1 <= by0:
        return 'b', 't'
    return 't', 'b'


def _label(x, y, text, n=None):
    if not text and n is None:
        return ''
    lines = text.split('\n') if text else []
    wmax = max((len(t) for t in lines), default=0) * 6.15
    bw = wmax + (18 if n is not None else 0) + 8
    bh = 14 * max(len(lines), 1) + 4
    out = [f'<rect class="lbg" x="{x-bw/2:.1f}" y="{y-bh/2:.1f}" width="{bw:.1f}" height="{bh:.1f}" rx="3"/>']
    tx = x - bw / 2 + 4
    if n is not None:
        out.append(f'<circle class="badge" cx="{tx+7:.1f}" cy="{y:.1f}" r="7.5"/><text class="badge-t" x="{tx+7:.1f}" y="{y+3.5:.1f}" text-anchor="middle">{n}</text>')
        tx += 18
    ty = y - 14 * (len(lines) - 1) / 2 + 4
    for t in lines:
        out.append(f'<text class="el" x="{tx:.1f}" y="{ty:.1f}">{esc(t)}</text>')
        ty += 14
    return ''.join(out)


def arch(did, w, h, nodes, edges, groups=(), title='', legend=True):
    N = {n['id']: n for n in nodes}
    out = [f'<svg class="hd" viewBox="0 0 {w} {h}" role="img" aria-label="{esc(title)}">', _defs(did)]
    for g in groups:
        x, y, gw, gh, label = g
        out.append(f'<rect class="grp" x="{x}" y="{y}" width="{gw}" height="{gh}" rx="10"/>')
        out.append(f'<text class="gl" x="{x+10}" y="{y+16}">{esc(label)}</text>')
    labels = []
    for e in edges:
        a, b = N[e['a']], N[e['b']]
        sa, sb = e.get('sides') or _auto_sides(a, b)
        sx, sy = _anchor(a, sa, e.get('oa', 0))
        ex, ey = _anchor(b, sb, e.get('ob', 0))
        horiz = sa in 'lr'
        vert_b = sb in 'tb'
        if horiz and not vert_b:
            if abs(sy - ey) < 1:
                d = f'M{sx},{sy} H{ex}'
                lx, ly = (sx + ex) / 2, sy - 9
            else:
                mx = e.get('mx', (sx + ex) / 2)
                d = f'M{sx},{sy} H{mx} V{ey} H{ex}'
                lx, ly = mx, (sy + ey) / 2
        elif not horiz and vert_b:
            if abs(sx - ex) < 1:
                d = f'M{sx},{sy} V{ey}'
                lx, ly = sx, (sy + ey) / 2
            else:
                my = e.get('my', (sy + ey) / 2)
                d = f'M{sx},{sy} V{my} H{ex} V{ey}'
                lx, ly = (sx + ex) / 2, my
        elif horiz and vert_b:
            d = f'M{sx},{sy} H{ex} V{ey}'
            lx, ly = (sx + ex) / 2, sy - 9
        else:
            d = f'M{sx},{sy} V{ey} H{ex}'
            lx, ly = sx, (sy + ey) / 2
        k = e.get('k', 'sync')
        m = f'{did}-b' if k == 'async' else f'{did}-a'
        start = f' marker-start="url(#{m})"' if e.get('both') else ''
        out.append(f'<path class="e {k}" d="{d}" marker-end="url(#{m})"{start}/>')
        if 'lp' in e:
            lx, ly = e['lp']
        else:
            lx += e.get('dx', 0)
            ly += e.get('dy', 0)
        labels.append(_label(lx, ly, e.get('l', ''), e.get('n')))
    out += [_node(n) for n in nodes]
    out += labels
    if legend:
        y = h - 14
        out.append(f'<line class="e sync" x1="12" y1="{y}" x2="44" y2="{y}" marker-end="url(#{did}-a)"/><text class="s" x="50" y="{y+4}">sync request</text>')
        out.append(f'<line class="e async" x1="140" y1="{y}" x2="172" y2="{y}" marker-end="url(#{did}-b)"/><text class="s" x="178" y="{y+4}">async event / job</text>')
        sw = [('svc', 'service'), ('store', 'database'), ('cache', 'cache'), ('queue', 'log / queue'), ('ext', 'external')]
        x = 300
        for k, t in sw:
            out.append(f'<rect class="n {k}" x="{x}" y="{y-6}" width="14" height="12" rx="3"/><text class="s" x="{x+19}" y="{y+4}">{t}</text>')
            x += 30 + len(t) * 6.2
    out.append('</svg>')
    return ''.join(out)


def seq(did, parts, msgs, w=860, title=''):
    n = len(parts)
    margin = 72
    xs = [margin + i * (w - 2 * margin) / (n - 1) for i in range(n)]
    X = {k: xs[i] for i, (k, _) in enumerate(parts)}
    body = []
    y = 64
    num = 0
    for m in msgs:
        kind = m[0]
        if kind in ('m', 'r', 'a'):
            _, a, b, text = m
            num += 1
            y += 30
            x1, x2 = X[a], X[b]
            cls = {'m': 'sync', 'r': 'reply', 'a': 'async'}[kind]
            mk = f'{did}-b' if kind == 'a' else f'{did}-a'
            dirn = 1 if x2 > x1 else -1
            body.append(f'<line class="e {cls}" x1="{x1+3*dirn}" y1="{y}" x2="{x2-3*dirn}" y2="{y}" marker-end="url(#{mk})"/>')
            body.append(f'<text class="el" x="{(x1+x2)/2:.1f}" y="{y-6}" text-anchor="middle"><tspan class="sn">{num}</tspan> {esc(text)}</text>')
        elif kind == 'self':
            _, a, text = m
            num += 1
            y += 30
            x = X[a]
            body.append(f'<path class="e sync" d="M{x+3},{y-8} H{x+28} V{y+6} H{x+6}" marker-end="url(#{did}-a)"/>')
            body.append(f'<text class="el" x="{x+34}" y="{y+2}"><tspan class="sn">{num}</tspan> {esc(text)}</text>')
            y += 6
        elif kind == 'note':
            _, a, b, text = m
            lines = text.split('\n')
            x1, x2 = min(X[a], X[b]) - 56, max(X[a], X[b]) + 56
            need = max(len(t) for t in lines) * 6.3 + 24
            if x2 - x1 < need:
                c = (x1 + x2) / 2
                c = min(max(c, 8 + need / 2), w - 8 - need / 2)
                x1, x2 = c - need / 2, c + need / 2
            hh = 14 * len(lines) + 10
            y += 14
            body.append(f'<rect class="note" x="{x1:.1f}" y="{y}" width="{x2-x1:.1f}" height="{hh}" rx="4"/>')
            ty = y + 16
            for t in lines:
                body.append(f'<text class="el" x="{(x1+x2)/2:.1f}" y="{ty}" text-anchor="middle">{esc(t)}</text>')
                ty += 14
            y += hh - 8
        elif kind == 'sep':
            _, text = m
            y += 26
            body.append(f'<line class="sep" x1="8" y1="{y}" x2="{w-8}" y2="{y}"/>')
            tw = len(text) * 6.3 + 14
            body.append(f'<rect class="sepbg" x="12" y="{y-9}" width="{tw:.1f}" height="18" rx="3"/><text class="gl" x="19" y="{y+4}">{esc(text)}</text>')
    h = y + 30
    out = [f'<svg class="hd" viewBox="0 0 {w} {h}" role="img" aria-label="{esc(title)}">', _defs(did)]
    for k, label in parts:
        x = X[k]
        out.append(f'<line class="life" x1="{x}" y1="44" x2="{x}" y2="{h-8}"/>')
        bw = max(96, len(label) * 7.4 + 16)
        out.append(f'<rect class="n svc" x="{x-bw/2:.1f}" y="10" width="{bw:.1f}" height="34" rx="6"/><text class="t" x="{x}" y="31" text-anchor="middle">{esc(label)}</text>')
    out += body
    out.append('</svg>')
    return ''.join(out)


def B(id, x, y, w, h, t, s=None, k='svc'):
    return dict(id=id, x=x, y=y, w=w, h=h, t=t, s=s, k=k)


def L(a, b, l='', **kw):
    d = dict(a=a, b=b, l=l)
    d.update(kw)
    return d
