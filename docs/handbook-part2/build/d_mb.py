from diag import arch, seq, B, L

D = {}

D['mb-arch'] = arch('mb-arch', 860, 520, [
    B('cl', 10, 210, 100, 60, 'Clients', 'web · app', 'client'),
    B('gw', 140, 210, 120, 60, 'Gateway', 'waiting room\nfor hot shows', 'edge'),
    B('se', 310, 30, 150, 64, 'Catalog / search', 'movies · cinemas · shows'),
    B('si', 310, 140, 150, 84, 'Show inventory', 'seat map · holds\nall-or-nothing\nexpiry sweeper'),
    B('bk', 310, 275, 150, 70, 'Booking service', 'saga · tickets\ncancellation'),
    B('py', 310, 390, 150, 60, 'Payment service', 'intents · webhooks'),
    B('es', 530, 30, 140, 64, 'Search index', 'Elasticsearch\n+ CDN cache', 'store'),
    B('sd', 530, 135, 140, 64, 'Inventory DB', 'Postgres by show_id\nshow_seats', 'store'),
    B('rc', 530, 210, 140, 56, 'Redis', 'seat-map cache · gate', 'cache'),
    B('bd', 530, 280, 140, 64, 'Bookings DB', 'Postgres · outbox', 'store'),
    B('ps', 530, 390, 140, 60, 'PSP', 'UPI · cards', 'ext'),
    B('ws', 720, 140, 130, 70, 'Seat-map push', 'WebSocket / SSE\nper-show channel'),
    B('kf', 720, 280, 130, 64, 'Kafka', 'SeatsChanged\nBookingConfirmed', 'queue'),
    B('nt', 720, 390, 130, 60, 'Notifications', 'ticket QR · SMS'),
], [
    L('cl', 'gw', ''),
    L('gw', 'se', 'browse', oa=-20, mx=284, lp=(284, 120)),
    L('gw', 'si', 'map · hold', oa=-4, ob=0, mx=296, lp=(276, 186)),
    L('gw', 'bk', 'checkout', sides=('b', 'l')),
    L('se', 'es', ''),
    L('si', 'sd', 'conditional\nUPDATE', oa=-15, ob=0),
    L('si', 'rc', '', oa=20, ob=0),
    L('bk', 'si', 'CONFIRMING / BOOKED', sides=('t', 'b')),
    L('bk', 'bd', '', ob=-7),
    L('bk', 'py', '', sides=('b', 't')),
    L('py', 'ps', 'intent · webhook', both=True),
    L('bd', 'kf', 'outbox', k='async'),
    L('kf', 'ws', 'SeatsChanged', k='async', sides=('t', 'b')),
    L('kf', 'nt', '', k='async', sides=('b', 't')),
    L('ws', 'cl', 'live seat deltas to every viewer of the show', k='async', sides=('t', 't'), my=114, lp=(600, 114)),
], title='Movie booking: high-level architecture')

D['mb-seq'] = seq('mb-seq', [
    ('c', 'Client'), ('i', 'Show inventory'), ('b', 'Booking'), ('p', 'Payment'), ('s', 'PSP'),
], [
    ('m', 'c', 'i', 'POST /shows/{id}/holds'),
    ('self', 'i', 'one UPDATE … WHERE free or expired'),
    ('r', 'i', 'c', '201 holdId, expires in 5 min'),
    ('m', 'c', 'b', 'POST /holds/{id}/checkout + key'),
    ('m', 'b', 'i', 'mark CONFIRMING'),
    ('r', 'i', 'b', 'ok (hold not expired)'),
    ('m', 'b', 'p', 'intent (key = bookingId)'),
    ('m', 'p', 's', 'create PSP order'),
    ('r', 'b', 'c', '201 booking PENDING + payment action'),
    ('sep', 'USER PAYS'),
    ('a', 's', 'p', 'webhook: captured'),
    ('a', 'p', 'b', 'PaymentSucceeded'),
    ('m', 'b', 'i', 'seats → BOOKED'),
    ('self', 'b', 'CONFIRMED · QR ticket · outbox'),
    ('sep', 'HOLD ALREADY EXPIRED AT STEP 5'),
    ('note', 'i', 'b', '410 Gone: seats were released, the user picks again.\nOnce CONFIRMING, the sweeper leaves the seats alone until\nthe payment window plus a grace period has passed.'),
], title='Hold, pay, confirm')
