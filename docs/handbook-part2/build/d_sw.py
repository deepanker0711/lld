from diag import arch, seq, B, L

D = {}

D['sw-arch'] = arch('sw-arch', 860, 480, [
    B('cl', 10, 200, 100, 60, 'Mobile / web', 'offline queue', 'client'),
    B('gw', 140, 200, 120, 60, 'Gateway', 'auth · rate limit', 'edge'),
    B('ex', 310, 120, 150, 90, 'Expense service', 'groups · expenses\nsplit engine\nbalances (same txn)'),
    B('fx', 310, 270, 150, 56, 'FX rates', 'daily reference rates', 'ext'),
    B('s3', 530, 20, 140, 56, 'Object store', 'receipt images', 'store'),
    B('ed', 530, 120, 140, 90, 'Expenses DB', 'Postgres by group_id\nexpenses · shares\nbalances · outbox', 'store'),
    B('ac', 530, 260, 140, 64, 'Activity + notify', 'feed · push · email'),
    B('rc', 530, 362, 140, 66, 'Redis', 'simplified debts\nby group version', 'cache'),
    B('kf', 720, 133, 130, 64, 'Kafka', 'ExpenseAdded …', 'queue'),
    B('su', 720, 260, 130, 64, 'User summary', 'totals per friend\nacross groups'),
    B('sd', 720, 370, 130, 56, 'Summary store', 'KV by user_id', 'store'),
], [
    L('cl', 'gw', ''),
    L('gw', 'ex', '', mx=285),
    L('cl', 's3', 'PUT receipt (presigned URL)', sides=('t', 'l'), lp=(300, 48)),
    L('ex', 'ed', '1 txn'),
    L('ex', 'fx', 'rate on the expense date', sides=('b', 't')),
    L('ex', 'rc', 'cache simplify()', oa=32, mx=495, lp=(495, 330)),
    L('ed', 'kf', 'outbox', k='async', ob=0, oa=0),
    L('kf', 'su', '', k='async', sides=('b', 't')),
    L('su', 'sd', '', sides=('b', 't')),
    L('kf', 'ac', '', k='async', sides=('l', 'r'), oa=22, mx=696),
], title='Splitwise: high-level architecture')

D['sw-seq'] = seq('sw-seq', [
    ('c', 'Client'), ('e', 'Expense service'), ('d', 'Expenses DB'), ('k', 'Kafka'), ('s', 'User summary'),
], [
    ('m', 'c', 'e', 'POST expense (client UUID)'),
    ('m', 'e', 'd', 'lock group row (version)'),
    ('m', 'e', 'd', 'INSERT expense, payers, shares'),
    ('m', 'e', 'd', 'balances += deltas · outbox'),
    ('r', 'e', 'c', '201 · a retry with the same id → 200'),
    ('a', 'd', 'k', 'ExpenseAdded (relay)'),
    ('a', 'k', 's', 'apply deltas, dedupe'),
    ('sep', 'EDIT FROM A STALE SCREEN'),
    ('m', 'c', 'e', 'PATCH expense, If-Match: v3'),
    ('m', 'e', 'd', 'UPDATE … WHERE version = 3'),
    ('r', 'd', 'e', '0 rows (it is v4 now)'),
    ('r', 'e', 'c', '412 + current expense'),
    ('note', 'c', 'e', 'The app shows both versions;\nthe user re-applies the edit.'),
], title='Add an expense, then a conflicting edit')
