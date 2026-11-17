from diag import arch, seq, B, L

D = {}

D['lf-arch'] = arch('lf-arch', 860, 540, [
    B('app', 25, 60, 140, 70, 'Service pod', 'logging library\nasync appender'),
    B('ag', 25, 190, 140, 70, 'Node agent', 'Fluent Bit / Vector\ndisk buffer'),
    B('ig', 215, 190, 130, 70, 'Ingest gateway', 'auth · quotas\nvalidate · batch', 'edge'),
    B('kf', 385, 190, 120, 70, 'Kafka', 'by tenant +\nservice', 'queue'),
    B('al', 385, 50, 120, 64, 'Alert engine', 'streaming rules'),
    B('pg', 555, 50, 130, 56, 'Pager / Slack', '', 'ext'),
    B('pr', 555, 190, 130, 70, 'Processors', 'parse · redact\nsample · enrich'),
    B('hot', 555, 330, 130, 76, 'Hot store', '7 days, indexed\nLoki / OpenSearch', 'store'),
    B('ob', 720, 330, 130, 76, 'Object storage', 'chunks · archive\nS3 → Glacier', 'store'),
    B('q', 385, 440, 120, 64, 'Query service', 'fan-out · merge\nlimits · cache'),
    B('ui', 215, 440, 130, 64, 'UI / CLI', 'search · live tail', 'client'),
], [
    L('app', 'ag', 'stdout / file', sides=('b', 't')),
    L('ag', 'ig', ''),
    L('ig', 'kf', ''),
    L('kf', 'pr', ''),
    L('kf', 'al', '', k='async', sides=('t', 'b')),
    L('al', 'pg', 'page', ob=-6),
    L('pr', 'hot', 'bulk write', sides=('b', 't')),
    L('hot', 'ob', 'roll over'),
    L('ui', 'q', ''),
    L('q', 'hot', 'recent', sides=('r', 'l'), oa=-14, ob=10, mx=525),
    L('q', 'ob', 'older ranges', sides=('r', 'b'), oa=16, lp=(640, 488)),
    L('kf', 'q', 'live tail', k='async', sides=('b', 't')),
], groups=[(10, 30, 170, 250, 'EACH NODE')], title='Centralised logging: high-level architecture')

D['lf-seq'] = seq('lf-seq', [
    ('a', 'App + library'), ('g', 'Node agent'), ('i', 'Ingest'), ('k', 'Kafka'), ('p', 'Processor'), ('s', 'Store'),
], [
    ('self', 'a', 'level check · MDC · format'),
    ('m', 'a', 'g', 'stdout (buffered)'),
    ('self', 'g', 'tail · parse · k8s labels'),
    ('m', 'g', 'i', 'POST batch (1 MB / 1 s)'),
    ('m', 'i', 'k', 'produce, acks=all'),
    ('r', 'i', 'g', '200 → agent advances checkpoint'),
    ('a', 'k', 'p', 'consume batch'),
    ('self', 'p', 'redact PII · drop by rule'),
    ('m', 'p', 's', 'bulk write'),
    ('self', 'p', 'commit offset after write'),
    ('sep', 'INGEST IS SLOW OR DOWN'),
    ('r', 'i', 'g', '429 / 503'),
    ('self', 'g', 'spill to disk, retry with backoff'),
    ('note', 'a', 'g', 'Disk buffer full → drop DEBUG/INFO first and count the drops.\nThe app never blocks: its own bounded buffer drops before it waits.'),
], title='The journey of one log line')
