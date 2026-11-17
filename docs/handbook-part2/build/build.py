"""Assemble Part 2: LLD chapters (base) + HLD fragments with generated diagrams."""
import importlib, pathlib, re, shutil, sys

HERE = pathlib.Path(__file__).parent  # sources live next to this script
sys.path.insert(0, str(HERE))
OUT = pathlib.Path('/Users/deepankersingh/Projects/lld-practice/docs/handbook-part2/index.html')
BASE = HERE / 'index.base.html'
if not BASE.exists():
    shutil.copy(OUT, BASE)
html = BASE.read_text()

TOPICS = [  # chapter id, fragment, diagram module
    ('user-login', '01-user-login.html', 'd_ul'),
    ('cart-checkout', '02-cart-checkout.html', 'd_cc'),
    ('movie-booking', '03-movie-booking.html', 'd_mb'),
    ('wallet', '04-wallet.html', 'd_wl'),
    ('splitwise', '05-splitwise.html', 'd_sw'),
    ('food-delivery', '06-food-delivery.html', 'd_fd'),
    ('logging-framework', '07-logging.html', 'd_lf'),
]


def sub(old, new, count=1):
    global html
    if old not in html:
        raise SystemExit(f'pattern not found: {old[:80]!r}')
    html = html.replace(old, new, count)


CSS = r'''
/* HLD additions: part banner, two-row TOC, calc tables, SVG diagrams. */
:root { --hd-cache: #b42357; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --hd-cache: #f27aa6; } }
:root[data-theme="dark"] { --hd-cache: #f27aa6; }
.part-banner { margin: 72px 0 0; padding: 20px 22px; border-radius: 12px; background: var(--accent-soft); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); }
.part-banner .eyebrow { margin: 0 0 8px; }
.part-banner .part-title { font: 700 28px/1.15 var(--font-display); margin: 0 0 8px; }
.part-banner p:last-child { margin: 0; color: var(--muted); }
.part-banner + h2 { border-top: 0; margin-top: 28px; }
.toc .toc-label { font: 600 11px/1 var(--font-body); text-transform: uppercase; letter-spacing: .09em; color: var(--muted); align-self: center; min-width: 34px; }
.toc .toc-break { flex-basis: 100%; height: 2px; }
.toc button.hld { background: var(--accent-soft); border-color: color-mix(in srgb, var(--accent) 30%, var(--rule)); }
table.calc td:last-child { font-weight: 600; white-space: nowrap; }
svg.hd { width: 100%; height: auto; display: block; font-family: var(--font-body); }
.diagram svg.hd { min-width: 680px; }
.hd text { fill: var(--ink); font-size: 12px; }
.hd .t { font-weight: 600; font-size: 12.5px; }
.hd .s { fill: var(--muted); font-size: 11px; }
.hd .n { fill: var(--surface); stroke: var(--ink); stroke-width: 1.3; }
.hd .n.svc { stroke: var(--accent); stroke-width: 1.6; }
.hd .n.edge { fill: var(--accent-soft); stroke: var(--accent); }
.hd .n.client { stroke: var(--muted); stroke-dasharray: 4 3; }
.hd .n.store { fill: color-mix(in srgb, var(--good) 9%, var(--surface)); stroke: var(--good); }
.hd .n.cache { fill: color-mix(in srgb, var(--hd-cache) 8%, var(--surface)); stroke: var(--hd-cache); }
.hd .n.rim { fill: none; }
.hd .n.queue { fill: var(--senior-soft); stroke: var(--senior); }
.hd .qline { stroke: var(--senior); stroke-width: 1; opacity: .55; }
.hd .n.ext { fill: var(--paper); stroke: var(--muted); stroke-dasharray: 5 3; }
.hd .grp { fill: none; stroke: var(--muted); stroke-opacity: .5; stroke-dasharray: 6 4; stroke-width: 1.2; }
.hd .gl { fill: var(--muted); font-size: 10.5px; font-weight: 600; letter-spacing: .07em; }
.hd .e { fill: none; stroke: var(--muted); stroke-width: 1.4; }
.hd .e.async { stroke: var(--senior); stroke-dasharray: 5 4; }
.hd .e.reply { stroke-dasharray: 3 3; }
.hd .ah { fill: var(--muted); }
.hd .ah2 { fill: var(--senior); }
.hd .lbg { fill: var(--surface); opacity: .94; }
.hd .el { font-size: 11px; }
.hd .sn { font-weight: 700; fill: var(--accent); }
.hd .badge { fill: var(--accent); }
.hd .badge-t { fill: var(--surface); font-size: 10px; font-weight: 700; }
.hd .life { stroke: var(--rule); stroke-width: 1.2; stroke-dasharray: 4 4; }
.hd .note { fill: var(--senior-soft); stroke: var(--senior); stroke-opacity: .5; }
.hd .sep { stroke: var(--muted); stroke-opacity: .45; stroke-dasharray: 2 4; }
.hd .sepbg { fill: var(--paper); }
@media print { .diagram svg.hd { min-width: 0; } .diagram { break-inside: avoid-page; } .part-banner { break-before: page; } }
'''
sub('@media (max-width: 860px) {', CSS + '\n@media (max-width: 860px) {')

# TOC: label LLD / HLD rows.
sub('''    toc.closest('.chapter').querySelectorAll('h2[id]').forEach(function (h) {
      const b = document.createElement('button');''', '''    let part = '';
    toc.closest('.chapter').querySelectorAll('h2[id]').forEach(function (h) {
      const hld = /-h\\d$/.test(h.id);
      const want = hld ? 'HLD' : 'LLD';
      if (want !== part) {
        if (part) { const br = document.createElement('span'); br.className = 'toc-break'; toc.appendChild(br); }
        const lab = document.createElement('span'); lab.className = 'toc-label'; lab.textContent = want; toc.appendChild(lab);
        part = want;
      }
      const b = document.createElement('button');
      if (hld) b.className = 'hld';''')

# Start page and chrome.
sub('<title>LLD Handbook · Part 2</title>', '<title>LLD + HLD Handbook · Part 2</title>')
sub('<div class="brand">LLD Handbook · Part 2<small>NestJS · in-memory · built in ~/Projects/lld-practice</small></div>',
    '<div class="brand">LLD + HLD Handbook · Part 2<small>Machine coding + system design · code in ~/Projects/lld-practice</small></div>')
html = html.replace('<span class="chip done">Written</span>', '<span class="chip done">LLD + HLD</span>')
html = re.sub(r'<p class="eyebrow">Topic · Written · ', '<p class="eyebrow">Topic · LLD + HLD · ', html)
sub('<h1>LLD machine-coding handbook · Part 2</h1>', '<h1>LLD + HLD handbook · Part 2</h1>')
sub('<p class="lede">Seven more problems, each built and tested in <code>~/Projects/lld-practice</code>, with one chapter per problem.',
    '<p class="lede">Seven problems for a senior round. Each chapter has two parts. <b>Part A</b> is the machine-coding answer, built and tested in <code>~/Projects/lld-practice</code>. <b>Part B</b> is the system-design answer for the same problem at production scale: requirements, estimates, APIs, architecture diagrams, database design, the components that matter, and the push-back to expect.')
sub('<h2>Every chapter has the same sections</h2>', '<h2>Every chapter has the same sections</h2>\n  <h3>Part A · LLD (machine coding)</h3>')
sub('''      <tr><td>8. Pitfalls + 60-second summary</td><td>Mistakes that cost points; the paragraph to say</td><td>Before you say "done"</td></tr>
    </tbody>
  </table></div>''', '''      <tr><td>8. Pitfalls + 60-second summary</td><td>Mistakes that cost points; the paragraph to say</td><td>Before you say "done"</td></tr>
    </tbody>
  </table></div>
  <h3>Part B · HLD (system design)</h3>
  <div class="table-wrap"><table>
    <thead><tr><th>Section</th><th>What it gives you</th><th>When you use it in the round</th></tr></thead>
    <tbody>
      <tr><td>H1. Functional requirements</td><td>What's in and out of scope, stated out loud</td><td>Minutes 0–5</td></tr>
      <tr><td>H2. Non-functional requirements</td><td>Targets, each tied to the design decision it forces</td><td>Minutes 5–8</td></tr>
      <tr><td>H3. Capacity estimation</td><td>Assumptions, the arithmetic, and what the numbers tell you</td><td>Minutes 8–12</td></tr>
      <tr><td>H4. API design</td><td>The public contract at scale: versioning, idempotency, pagination, webhooks</td><td>Minutes 12–17</td></tr>
      <tr><td>H5. High-level design</td><td>Architecture diagram, request paths, and a sequence diagram for the critical flow</td><td>Minutes 17–30</td></tr>
      <tr><td>H6. Database design</td><td>Store choice and why, schema, keys and indexes, partitioning and sharding</td><td>Minutes 30–37</td></tr>
      <tr><td>H7. Detailed component design</td><td>The 2–5 components the interviewer will dig into</td><td>Minutes 37–52</td></tr>
      <tr><td>H8. Interviewer questions and counters</td><td>"Why X, not Y?", your answer, their push-back, your reply</td><td>Whenever they come up</td></tr>
    </tbody>
  </table></div>''')
sub('The "Implementation change" snippets in section 7 are sketches to talk through. They were not run.</p></div>',
    'The "Implementation change" snippets in section 7 are sketches to talk through. They were not run.</p><p>Part B is design, not code. The capacity numbers come from the assumptions stated at the top of each H3. Change an assumption and redo the arithmetic: interviewers care about the method, not the figure.</p></div>')

for chapter, frag, mod in TOPICS:
    fp = HERE / frag
    if not fp.exists():
        print('skip (not written yet):', frag)
        continue
    body = fp.read_text()
    D = importlib.import_module(mod).D
    for name, svg in D.items():
        body = body.replace('{{' + name + '}}', svg)
    left = re.findall(r'\{\{[a-z0-9-]+\}\}', body)
    if left:
        raise SystemExit(f'{frag}: unresolved diagrams {left}')
    start = html.index(f'<section class="chapter" id="v-{chapter}"')
    end = html.index('</section>', start)
    html = html[:end] + body + html[end:]

OUT.write_text(html)
print('wrote', OUT, len(html), 'bytes')
