from diag import arch, seq, B, L

D = {}

D['ul-arch'] = arch('ul-arch', 860, 480, [
    B('cl', 10, 200, 110, 60, 'Clients', 'web · mobile', 'client'),
    B('gw', 160, 200, 120, 60, 'Edge / gateway', 'WAF · TLS\nIP rate limit', 'edge'),
    B('kms', 340, 40, 160, 56, 'KMS / HSM', 'private signing key', 'ext'),
    B('au', 340, 180, 160, 100, 'Auth service', 'stateless pods\nlogin · refresh · logout\nsigns JWT (RS256)'),
    B('pg', 580, 40, 150, 70, 'Postgres', 'users · sessions\nprimary + sync replica', 'store'),
    B('rd', 580, 170, 150, 70, 'Redis', 'fail counters (TTL)\nrevoked sids (TTL)', 'cache'),
    B('rs', 160, 330, 120, 70, 'Other services', 'verify JWT locally\nJWKS + deny set', 'svc'),
    B('kf', 340, 380, 160, 56, 'Kafka', 'auth events', 'queue'),
    B('co', 580, 380, 220, 56, 'Consumers', 'email verify / reset · audit\nfraud signals', 'svc'),
], [
    L('cl', 'gw', ''),
    L('gw', 'au', '/v1/auth/*'),
    L('au', 'kms', 'sign / rotate keys', sides=('t', 'b')),
    L('au', 'pg', 'users, sessions', oa=-35, mx=540, lp=(600, 140)),
    L('au', 'rd', 'counters, deny', oa=-25, ob=0, lp=(540, 222)),
    L('au', 'kf', 'UserRegistered\nSessionRevoked', k='async', sides=('b', 't'), lp=(472, 348)),
    L('kf', 'co', '', k='async', ob=-5),
    L('gw', 'rs', 'Bearer JWT', sides=('b', 't'), ob=-30, oa=-30),
    L('rs', 'au', 'GET JWKS (cached)', sides=('r', 'l'), oa=-10, ob=25, mx=312, lp=(350, 291)),
    L('rd', 'rs', 'revoked sids (pub/sub)', k='async', sides=('b', 't'), my=306, ob=30, lp=(600, 306)),
], title='User login: high-level architecture')

D['ul-seq'] = seq('ul-seq', [
    ('c', 'Client'), ('g', 'Gateway'), ('a', 'Auth service'), ('r', 'Redis'), ('p', 'Postgres'),
], [
    ('m', 'c', 'g', 'POST /v1/auth/login'),
    ('m', 'g', 'a', 'forward (IP limit ok)'),
    ('m', 'a', 'r', 'GET fails:{email}'),
    ('r', 'r', 'a', '3 (< 5)'),
    ('m', 'a', 'p', 'SELECT user by email'),
    ('self', 'a', 'scrypt verify (~50 ms CPU)'),
    ('m', 'a', 'p', 'INSERT session (hash R1)'),
    ('r', 'a', 'c', '200 access A1 (15 min) + refresh R1'),
    ('sep', '15 MINUTES LATER: REFRESH'),
    ('m', 'c', 'a', 'POST /v1/auth/refresh R1'),
    ('m', 'a', 'p', 'CAS hash h(R1) → h(R2)'),
    ('r', 'p', 'a', '1 row updated'),
    ('r', 'a', 'c', '200 A2 + R2'),
    ('sep', 'A STOLEN COPY OF R1 IS REPLAYED'),
    ('m', 'c', 'a', 'POST /v1/auth/refresh R1'),
    ('m', 'a', 'p', 'CAS: 0 rows · R1 in history'),
    ('m', 'a', 'p', 'revoke session'),
    ('m', 'a', 'r', 'SET revoked:{sid} PX 15m'),
    ('r', 'a', 'c', '401 refresh token reuse'),
], title='Login, refresh and reuse detection')
