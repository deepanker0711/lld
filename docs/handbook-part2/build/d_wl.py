from diag import arch, seq, B, L

D = {}

D['wl-arch'] = arch('wl-arch', 860, 540, [
    B('cl', 10, 200, 100, 60, 'Clients', 'app · merchants', 'client'),
    B('gw', 140, 200, 120, 60, 'Gateway', 'auth · rate limit\nmTLS for partners', 'edge'),
    B('rk', 310, 50, 150, 64, 'Risk + limits', 'velocity · fraud score'),
    B('api', 310, 190, 150, 80, 'Wallet API', 'idempotency keys\ntop-up · transfer\npayout'),
    B('mm', 310, 330, 150, 70, 'Money movement', 'top-up / payout\nstate machines'),
    B('rc', 310, 450, 150, 56, 'Reconciliation', 'daily, per rail'),
    B('rr', 530, 50, 140, 64, 'Redis', 'velocity counters', 'cache'),
    B('lg', 530, 190, 140, 80, 'Ledger service', 'posting engine\nonly writer of\nbalances'),
    B('ps', 530, 320, 140, 56, 'PSP', 'UPI collect · cards', 'ext'),
    B('bk', 530, 400, 140, 56, 'Bank rails', 'IMPS · NEFT · UPI', 'ext'),
    B('ld', 713, 190, 144, 80, 'Ledger DB', 'Postgres by account\naccounts · entries\noutbox', 'store'),
    B('kf', 720, 330, 130, 60, 'Kafka', 'TxnPosted', 'queue'),
    B('co', 720, 440, 130, 66, 'Consumers', 'statements (read DB)\nnotifications\nanalytics'),
], [
    L('cl', 'gw', ''),
    L('gw', 'api', ''),
    L('api', 'rk', 'check limits', sides=('t', 'b')),
    L('rk', 'rr', ''),
    L('api', 'lg', 'post(txn)'),
    L('lg', 'ld', '1 txn'),
    L('api', 'mm', 'external legs', sides=('b', 't')),
    L('mm', 'ps', 'collect', both=True, oa=-17, ob=0),
    L('mm', 'bk', 'payout · status', oa=15, ob=0, mx=495),
    L('ld', 'kf', 'outbox', k='async', sides=('b', 't')),
    L('kf', 'co', '', k='async', sides=('b', 't')),
    L('bk', 'rc', 'settlement files', k='async', sides=('b', 'r'), lp=(540, 492)),
], title='Wallet: high-level architecture')

D['wl-seq'] = seq('wl-seq', [
    ('c', 'Client'), ('a', 'Wallet API'), ('r', 'Risk'), ('l', 'Ledger'), ('b', 'Bank'),
], [
    ('m', 'c', 'a', 'POST /transfers + key'),
    ('m', 'a', 'l', 'claim key (unique insert)'),
    ('m', 'a', 'r', 'limits + fraud score'),
    ('r', 'r', 'a', 'allow'),
    ('m', 'a', 'l', 'post A → B ₹500'),
    ('self', 'l', 'lock A, B by id · 2 entries · outbox'),
    ('r', 'l', 'a', 'SUCCEEDED'),
    ('r', 'a', 'c', '201 (saved as the key\'s response)'),
    ('sep', 'WITHDRAWAL WHOSE BANK CALL TIMES OUT'),
    ('m', 'c', 'a', 'POST /withdrawals + key'),
    ('m', 'a', 'l', 'debit user → payout clearing'),
    ('m', 'a', 'b', 'IMPS payout (ref = txnId)'),
    ('r', 'b', 'a', 'timeout: outcome unknown'),
    ('self', 'a', 'stay PENDING, no reversal'),
    ('m', 'a', 'b', 'status enquiry (backoff)'),
    ('r', 'b', 'a', 'SUCCESS → settle · FAILED → reverse'),
    ('note', 'l', 'b', 'Only a definite FAILED posts the reversal.\nUnknown stays PENDING until a status check or the settlement file decides.'),
], title='Transfer and an uncertain payout')
