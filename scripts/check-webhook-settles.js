#!/usr/bin/env node
/**
 * Does a payment made on an admin-requested link settle the same as a signup?
 *
 * The tracker's "Request payment" action creates a Square payment link for a
 * vendor who never had one. Nothing about that is visible to the webhook: it
 * maps a completed payment back to an application through the order's
 * referenceId and nothing else. This asserts that claim by running the real
 * handler rather than by reading it.
 *
 * The route is compiled with the TypeScript compiler API and loaded with a
 * require hook that swaps every dependency for a fake, so the code under test
 * is the actual source of app/api/square-webhook/route.ts. The Square client
 * returns the order our own lib/payment-link.ts would have produced, and the
 * Supabase fake records what the handler tried to write.
 *
 * Two cases run through the same handler.
 *
 * The vendor case is deliberately the awkward one: a row that came in through
 * the retired prepaid path, so payment_method is 'offline' and approval_status
 * is already 'approved'. That is the row the feature was built for.
 *
 * The parking case is the branch added for game night. Its order carries a
 * referenceId of "parking:<event slug>" rather than an application UUID, and it
 * must land in parking_payments and never touch vendor_applications. Both
 * halves of that matter: parking money in the vendor table would settle a spot
 * nobody bought, and a vendor payment in parking_payments would be paid out at
 * 50 percent to an organization.
 *
 * The redelivery is exercised too, because Square redelivers until it gets a
 * 2xx and the same ten dollars must not be booked twice.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { createHmac } = require('crypto');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const SITE_URL = 'https://coyoteville.test';

/* --------------------------------------------------------------- fixtures */

const APPLICATION_ID = '11111111-2222-4333-8444-555555555555';
const ORDER_ID = 'ORDER_FROM_REQUEST_PAYMENT';
const PAYMENT_ID = 'PAYMENT_ABC';
const AMOUNT_CENTS = 2500;

const PARKING_EVENT = 'home-game-2026-09-11';
const PARKING_ORDER_ID = 'ORDER_PARKING';
const PARKING_PAYMENT_ID = 'PAYMENT_PARKING';
const PARKING_CENTS = 1000;
/* What Square actually charged on that ten dollars. Not a percentage of it:
   the point of the column is that it is Square's own number. */
const PARKING_FEE_CENTS = 59;

const GIFT_ORDER_ID = 'ORDER_GIFT';
const GIFT_PAYMENT_ID = 'PAYMENT_GIFT';
const GIFT_CENTS = 2000;

/** The row as production has it: prepaid signup, corrected back to unpaid. */
const ROW = {
  id: APPLICATION_ID,
  business_name: "Sassy's slime & more",
  contact_name: 'Kristi Turner',
  phone: '361 555 0142',
  email: 'vendor@example.test',
  spot_type: 'booth',
  event_slug: 'home-game-2026-09-11',
  sells: 'slime',
  notes: null,
  serves_food: false,
  permit_path: null,
  signature_name: 'Kristi Turner',
  signed_at: '2026-08-20T15:00:00.000Z',
  agreement_version: 'v3.2-2026',
  amount_cents: AMOUNT_CENTS,
  payment_status: 'unpaid',
  payment_method: 'offline',
  approval_status: 'approved',
};

/* ----------------------------------------------------------- the recorder */

let writes = [];
let emails = [];
let invalidated = [];
/* Stands in for the parking_payments table, including its unique index on
   square_payment_id, which is what makes a redelivery a no-op. */
let parkingRows = [];

/* The alert sent after a payment is recorded, and how it is made to misbehave.

   "sync" throws before it ever returns a promise; "reject" returns one that
   rejects. Those fail in different places, and only one of them is caught by a
   try/catch around the call, which is why both are driven. */
let alerts = [];
let alertMode = 'ok';

/* The calendar the amount fallback reads. Empty by default, so every case
   that predates the fallback runs with no event in progress. */
let calendar = [];
const NOREF_ORDER_ID = 'ord_no_reference';

function reset() {
  calendar = [];
  writes = [];
  emails = [];
  invalidated = [];
  alerts = [];
  alertMode = 'ok';
}

function supabaseFake() {
  return {
    from(table) {
      const state = { table, filters: {}, payload: null, inserted: null };

      const chain = {
        select() {
          return chain;
        },
        update(payload) {
          state.payload = payload;
          return chain;
        },
        insert(payload) {
          state.inserted = payload;
          return chain;
        },
        eq(column, value) {
          state.filters[column] = value;
          return chain;
        },
        /* supabase-js returns a thenable builder: awaiting it without calling
           maybeSingle or single runs the statement. The fee backfill does
           exactly that, so the fake has to be awaitable too. */
        then(resolve) {
          if (table === 'parking_payments' && state.payload) {
            const row = parkingRows.find((x) => x.id === state.filters.id);
            if (row) Object.assign(row, state.payload);
            resolve({ data: null, error: null });
            return;
          }
          resolve({ data: null, error: null });
        },
        async single() {
          if (table === 'parking_payments' && state.inserted) {
            const row = { id: 'parking-row-' + (parkingRows.length + 1), ...state.inserted };
            parkingRows.push(row);
            return { data: { id: row.id }, error: null };
          }
          return { data: null, error: { message: 'unexpected single() on ' + table } };
        },
        async maybeSingle() {
          if (table === 'parking_payments') {
            /* The dedupe read. Answer from what has been inserted, so the
               second delivery of one payment finds the first. */
            const seen = parkingRows.find(
              (x) => x.square_payment_id === state.filters.square_payment_id
            );
            /* Both columns the handler selects. Returning only the id made the
               handler see an undefined fee and rewrite one it already had. */
            return {
              data: seen ? { id: seen.id, square_fee_cents: seen.square_fee_cents } : null,
              error: null,
            };
          }

          if (state.payload) {
            writes.push({ ...state });
            /* The real guard is .eq('payment_status','unpaid') on the update.
               Honour it: return no row when the guard would not match. */
            if (
              state.filters.payment_status !== undefined &&
              state.filters.payment_status !== ROW.payment_status
            ) {
              return { data: null, error: null };
            }
            return { data: { ...ROW, ...state.payload }, error: null };
          }
          return { data: { ...ROW }, error: null };
        },
      };

      return chain;
    },
  };
}

/* ------------------------------------------------------- the module graph */

const FAKES = {
  'server-only': {},
  'next/server': {
    NextResponse: {
      json(body, init) {
        return { __json: body, status: (init && init.status) || 200 };
      },
    },
  },
  '@/lib/square': {
    isSquareConfigured: () => true,
    getSquare: () => ({
      orders: {
        async get({ orderId }) {
          /* Exactly the orders this codebase asks Square to create. The vendor
             one carries the application id as referenceId; the parking one
             carries the prefix and the event slug, from parkingReferenceId. */
          if (orderId === ORDER_ID) {
            return {
              order: {
                id: ORDER_ID,
                referenceId: APPLICATION_ID,
                totalMoney: { amount: AMOUNT_CENTS },
                netAmountDueMoney: { amount: 0 },
              },
            };
          }
          if (orderId === PARKING_ORDER_ID) {
            return {
              order: {
                id: PARKING_ORDER_ID,
                referenceId: 'parking:' + PARKING_EVENT,
                totalMoney: { amount: PARKING_CENTS },
                netAmountDueMoney: { amount: 0 },
              },
            };
          }
          if (orderId === GIFT_ORDER_ID) {
            return {
              order: {
                id: GIFT_ORDER_ID,
                referenceId: 'donation:' + PARKING_EVENT + ':' + GIFT_CENTS,
                totalMoney: { amount: GIFT_CENTS },
                netAmountDueMoney: { amount: 0 },
              },
            };
          }
          if (orderId === NOREF_ORDER_ID) {
            /* What the Square dashboard payment link produces: a real order
               with nothing on it that says what it was for. */
            return { order: { id: NOREF_ORDER_ID, totalMoney: { amount: 0 } } };
          }
          throw new Error('unexpected order ' + orderId);
        },
      },
    }),
  },
  '@/lib/supabase': {
    isSupabaseConfigured: () => true,
    getSupabaseAdmin: supabaseFake,
  },
  /* The events table is the calendar now, so the webhook's event name lookup
     goes through here. Faked like every other edge. */
  '@/lib/events-source': {
    eventNameFor: async (slug) =>
      slug === 'home-game-2026-09-11' ? 'Alice Home Game' : slug || 'Coyoteville',
    getEvents: async () => calendar,
    getNextEvent: async () => null,
    getEventBySlug: async () => null,
    isKnownEventSlug: async () => false,
  },
  '@/lib/seo': {
    SITE_URL,
    EVENTS: [{ slug: 'home-game-2026-09-11', name: 'Home Game, September 11' }],
  },
  /* The alert after a payment lands. Never awaited by the route and never
     allowed to reach it, which is what the sabotage below proves. */
  '@/lib/parking-alert': {
    sendParkingAlert: (input) => {
      alerts.push(input);
      if (alertMode === 'sync') throw new Error('Resend is down');
      if (alertMode === 'reject') return Promise.reject(new Error('Resend refused it'));
      return Promise.resolve(true);
    },
  },
  '@/lib/spots': {
    invalidateSpots: (slug) => invalidated.push(slug),
  },
  '@/lib/notify': {
    notifyPaymentReceived: async (r) => {
      emails.push(r);
    },
  },
  /* lib/parking is compiled and run for real below rather than faked, because
     the shape of the row it inserts is exactly what this gate exists to pin
     down. These are its own relative imports, pointed at the same fakes the
     route uses. The two constants are the real values; neither is on the
     webhook path, which takes its amount off the payment. */
  './square': null,
  './supabase': null,
  './events-source': null,
  './seo': null,
  './parking-fundraiser': { PARKING_PRICE_CENTS: 1000, PAYOUT_RATE: 0.5 },
  '@/lib/subscription-events': {
    handleInvoiceFailed: async () => {},
    handleInvoicePaid: async () => {},
    handleSubscriptionUpdated: async () => {},
  },
};

/* The relative specifiers above share the fakes their @/lib twins use. */
FAKES['./square'] = FAKES['@/lib/square'];
FAKES['./supabase'] = FAKES['@/lib/supabase'];
FAKES['./events-source'] = FAKES['@/lib/events-source'];
FAKES['./seo'] = FAKES['@/lib/seo'];

const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(FAKES, request)) return FAKES[request];
  return originalLoad.call(this, request, parent, isMain);
};
Module._resolveFilename = function (request, ...rest) {
  if (Object.prototype.hasOwnProperty.call(FAKES, request)) return request;
  return originalResolve.call(this, request, ...rest);
};

/* ------------------------------------------------------------- compile it */

const source = fs.readFileSync(path.join(ROOT, 'app/api/square-webhook/route.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
  fileName: 'route.ts',
}).outputText;

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coyoteville-webhook-'));
const outFile = path.join(outDir, 'route.js');
fs.writeFileSync(outFile, compiled);

process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = 'test-signature-key';
process.env.NEXT_PUBLIC_SITE_URL = SITE_URL;

/* The real lib/parking, compiled the same way as the route, so the insert the
   gate inspects is the one the handler actually performs. */
const parkingSource = fs.readFileSync(path.join(ROOT, 'lib/parking.ts'), 'utf8');
const parkingFile = path.join(outDir, 'parking.js');
fs.writeFileSync(
  parkingFile,
  ts.transpileModule(parkingSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: 'parking.ts',
  }).outputText
);
FAKES['@/lib/parking'] = require(parkingFile);

const route = require(outFile);

/* ----------------------------------------------------------------- drive */

function deliver(payment) {
  const payload = JSON.stringify({
    type: 'payment.updated',
    data: { object: { payment } },
  });

  const signature = createHmac('sha256', process.env.SQUARE_WEBHOOK_SIGNATURE_KEY)
    .update(`${SITE_URL}/api/square-webhook` + payload, 'utf8')
    .digest('base64');

  return route.POST({
    headers: { get: (h) => (h === 'x-square-hmacsha256-signature' ? signature : null) },
    text: async () => payload,
  });
}

const failures = [];
function check(label, condition, detail) {
  if (!condition) failures.push(`${label}${detail ? ': ' + detail : ''}`);
}

async function vendorCase() {
  reset();

  const response = await deliver({
    id: PAYMENT_ID,
    status: 'COMPLETED',
    order_id: ORDER_ID,
    amount_money: { amount: AMOUNT_CENTS, currency: 'USD' },
  });
  const body = response.__json || {};

  check('vendor: handler returned 200', response.status === 200, `got ${response.status}`);
  check('vendor: mapped to the application', body.applicationId === APPLICATION_ID, JSON.stringify(body));
  check('vendor: not ignored', !body.ignored, String(body.ignored));

  const settle = writes.find((w) => w.payload && w.payload.payment_status === 'paid');
  check('vendor: the row was marked paid', Boolean(settle));

  if (settle) {
    check('vendor: paid_at was stamped', Boolean(settle.payload.paid_at));
    check(
      'vendor: square_payment_id was captured',
      settle.payload.square_payment_id === PAYMENT_ID,
      String(settle.payload.square_payment_id)
    );
    check(
      'vendor: square_order_id was captured',
      settle.payload.square_order_id === ORDER_ID,
      String(settle.payload.square_order_id)
    );
    check(
      'vendor: payment_method moved to online',
      settle.payload.payment_method === 'online',
      String(settle.payload.payment_method)
    );
    check(
      'vendor: approval_status was left alone',
      !('approval_status' in settle.payload),
      'handler wrote approval_status'
    );
    check(
      'vendor: the unpaid guard was applied',
      settle.filters.payment_status === 'unpaid',
      String(settle.filters.payment_status)
    );
  }

  check('vendor: the spot cache was invalidated', invalidated.includes(ROW.event_slug));
  check('vendor: the vendor was emailed once', emails.length === 1, `${emails.length} emails`);
  check(
    'vendor: nothing was written to parking_payments',
    parkingRows.length === 0,
    `${parkingRows.length} parking rows`
  );
}

async function parkingCase() {
  reset();
  parkingRows = [];

  const payment = {
    id: PARKING_PAYMENT_ID,
    status: 'COMPLETED',
    order_id: PARKING_ORDER_ID,
    amount_money: { amount: PARKING_CENTS, currency: 'USD' },
  };

  const response = await deliver(payment);
  const body = response.__json || {};

  check('parking: handler returned 200', response.status === 200, `got ${response.status}`);
  check('parking: took the parking branch', body.parking === true, JSON.stringify(body));
  check('parking: named the event', body.eventSlug === PARKING_EVENT, String(body.eventSlug));
  check('parking: a row was inserted', body.inserted === true, String(body.inserted));
  check('parking: exactly one row', parkingRows.length === 1, `${parkingRows.length} rows`);

  const row = parkingRows[0] || {};
  check('parking: the event slug was recorded', row.event_slug === PARKING_EVENT, String(row.event_slug));
  check('parking: the amount came off the payment', row.amount_cents === PARKING_CENTS, String(row.amount_cents));
  check('parking: source is qr', row.source === 'qr', String(row.source));
  check('parking: one vehicle', row.vehicle_count === 1, String(row.vehicle_count));
  check(
    'parking: square_payment_id was captured',
    row.square_payment_id === PARKING_PAYMENT_ID,
    String(row.square_payment_id)
  );
  check(
    'parking: square_order_id was captured',
    row.square_order_id === PARKING_ORDER_ID,
    String(row.square_order_id)
  );

  /* The vendor table must not have been touched at all. This is the assertion
     that would have caught parking money settling a vendor spot. */
  check(
    'parking: vendor_applications was never written',
    writes.length === 0,
    `${writes.length} vendor writes`
  );
  check('parking: no vendor email went out', emails.length === 0, `${emails.length} emails`);

  /* The first delivery carries no fee, which is the normal case: Square
     calculates it after settlement. Null, not zero. */
  check(
    'parking: the fee is null before Square has calculated it',
    row.square_fee_cents === null,
    String(row.square_fee_cents)
  );
  check('parking: kind is parking', row.kind === 'parking', String(row.kind));

  /* Square redelivers until it gets a 2xx. The same ten dollars must not be
     booked twice, which is the whole reason square_payment_id is unique. */
  const again = await deliver(payment);
  const againBody = again.__json || {};
  check('parking: a redelivery still returns 200', again.status === 200, `got ${again.status}`);
  check('parking: a redelivery inserts nothing', againBody.inserted === false, String(againBody.inserted));
  check(
    'parking: still exactly one row after redelivery',
    parkingRows.length === 1,
    `${parkingRows.length} rows`
  );

  /* The later delivery that brings the fee. Not a duplicate: it is the only
     time Square ever tells us what it charged, and a handler that treated it as
     one would leave every fee null forever. */
  const withFee = await deliver({
    ...payment,
    processing_fee: [{ amount_money: { amount: PARKING_FEE_CENTS } }],
  });
  const feeBody = withFee.__json || {};

  check('parking: the fee delivery returns 200', withFee.status === 200, `got ${withFee.status}`);
  check('parking: the fee delivery inserts nothing', feeBody.inserted === false, String(feeBody.inserted));
  check('parking: the fee delivery says it recorded one', feeBody.feeRecorded === true, String(feeBody.feeRecorded));
  check(
    'parking: still exactly one row after the fee arrives',
    parkingRows.length === 1,
    `${parkingRows.length} rows`
  );
  check(
    "parking: the fee is Square's own number",
    parkingRows[0].square_fee_cents === PARKING_FEE_CENTS,
    String(parkingRows[0].square_fee_cents)
  );
  check(
    'parking: the amount did not move when the fee landed',
    parkingRows[0].amount_cents === PARKING_CENTS,
    String(parkingRows[0].amount_cents)
  );

  /* A third delivery of the same thing must not touch the fee again. */
  await deliver({
    ...payment,
    processing_fee: [{ amount_money: { amount: 999 } }],
  });
  check(
    'parking: a fee already recorded is not overwritten',
    parkingRows[0].square_fee_cents === PARKING_FEE_CENTS,
    String(parkingRows[0].square_fee_cents)
  );
}

async function donationCase() {
  reset();
  parkingRows = [];

  const response = await deliver({
    id: GIFT_PAYMENT_ID,
    status: 'COMPLETED',
    order_id: GIFT_ORDER_ID,
    amount_money: { amount: GIFT_CENTS, currency: 'USD' },
    processing_fee: [{ amount_money: { amount: 88 } }],
  });
  const body = response.__json || {};

  check('gift: handler returned 200', response.status === 200, `got ${response.status}`);
  check('gift: took the parking branch', body.parking === true, JSON.stringify(body));
  check('gift: kind is donation', body.kind === 'donation', String(body.kind));
  check('gift: named the event', body.eventSlug === PARKING_EVENT, String(body.eventSlug));
  check('gift: exactly one row', parkingRows.length === 1, `${parkingRows.length} rows`);

  const row = parkingRows[0] || {};
  check('gift: the row is a donation', row.kind === 'donation', String(row.kind));
  check('gift: the amount came off the payment', row.amount_cents === GIFT_CENTS, String(row.amount_cents));
  check('gift: source is still qr', row.source === 'qr', String(row.source));
  /* A gift is money, not a car. Counting it as a vehicle would inflate the
     count on the organization's own page. */
  check('gift: no vehicle counted', row.vehicle_count === 0, String(row.vehicle_count));
  check('gift: the fee was taken when present', row.square_fee_cents === 88, String(row.square_fee_cents));

  check('gift: vendor_applications was never written', writes.length === 0, `${writes.length} writes`);
}

/**
 * A mailer that is on fire, and a payment that lands anyway.
 *
 * The rule for game night is that nothing added to this route may cost a
 * parking payment. The email is a nicety; the row is ten dollars somebody
 * handed over at a gate. So the alert is driven in both of the ways it can
 * fail and the same three things are checked each time: the row was written,
 * Square got a 200, and the response is the same one a working mailer
 * produces.
 *
 * Driven through the real route and the real lib/parking, so this is the
 * actual insert and the actual response, not a description of them.
 */
async function alertFailureCase() {
  for (const mode of ['sync', 'reject']) {
    reset();
    parkingRows = [];
    alertMode = mode;

    const payment = {
      id: 'sqpay_alert_' + mode,
      status: 'COMPLETED',
      order_id: PARKING_ORDER_ID,
      amount_money: { amount: PARKING_CENTS, currency: 'USD' },
    };

    const response = await deliver(payment);
    const body = response.__json || {};

    const label = 'alert ' + mode;

    check(label + ': the alert was reached', alerts.length === 1, alerts.length + ' calls');
    check(label + ': Square still got a 200', response.status === 200, 'got ' + response.status);
    check(label + ': the row was still written', parkingRows.length === 1, parkingRows.length + ' rows');
    check(label + ': the response still reports the insert', body.inserted === true, String(body.inserted));
    check(label + ': no error was reported to Square', body.error === undefined, String(body.error));

    const row = parkingRows[0] || {};
    check(label + ': the amount is intact', row.amount_cents === PARKING_CENTS, String(row.amount_cents));
    check(label + ': kind is parking', row.kind === 'parking', String(row.kind));
  }

  /* The other half of the rule: a delivery that is not an insert sends
     nothing. The fee arriving later and a plain redelivery are both silent, so
     a night of redeliveries cannot become a night of duplicate mail. */
  reset();
  parkingRows = [];

  const payment = {
    id: 'sqpay_alert_once',
    status: 'COMPLETED',
    order_id: PARKING_ORDER_ID,
    amount_money: { amount: PARKING_CENTS, currency: 'USD' },
  };

  await deliver(payment);
  check('alert: the first delivery sent one', alerts.length === 1, alerts.length + ' calls');

  await deliver(payment);
  check('alert: a redelivery sent nothing', alerts.length === 1, alerts.length + ' calls');

  await deliver({ ...payment, processing_fee: [{ amount_money: { amount: 33 } }] });
  check('alert: the fee update sent nothing', alerts.length === 1, alerts.length + ' calls');
  check('alert: the fee still landed', parkingRows[0].square_fee_cents === 33, String(parkingRows[0].square_fee_cents));
}

/**
 * The amount fallback, added mid event on 2026-09-11 and meant to be reverted.
 *
 * It is the one branch here that decides what a payment was for without being
 * told, so the three conditions are each driven on their own. Two of them are
 * the ones that keep it from doing damage:
 *
 *   2500 is a booth. If a range ever replaces the exact match, that row books
 *   a vendor spot fee into parking_payments and pays half of it to an
 *   organization. This case is what stands between those two.
 *
 *   Outside an event window there is no night to attribute money to, so a
 *   stray ten dollar sale on the same Square account stays ignored.
 */
function eventWindow(inProgress) {
  const now = Date.now();
  return [
    {
      slug: PARKING_EVENT,
      name: 'Alice Home Game',
      startISO: new Date(inProgress ? now - 3600000 : now + 86400000).toISOString(),
      endISO: new Date(inProgress ? now + 3600000 : now + 86400000 + 3600000).toISOString(),
    },
  ];
}

async function amountFallbackCase() {
  /* ---- a ten dollar payment with no reference, during the event ---- */

  reset();
  parkingRows = [];
  calendar = eventWindow(true);

  let response = await deliver({
    id: 'sqpay_noref_during',
    status: 'COMPLETED',
    order_id: NOREF_ORDER_ID,
    amount_money: { amount: 1000, currency: 'USD' },
  });
  let body = response.__json || {};

  check('fallback: handler returned 200', response.status === 200, 'got ' + response.status);
  check('fallback: it was treated as parking', body.parking === true, JSON.stringify(body));
  check('fallback: it says how it matched', body.matchedBy === 'amount', String(body.matchedBy));
  check('fallback: the event was named', body.eventSlug === PARKING_EVENT, String(body.eventSlug));
  check('fallback: exactly one row', parkingRows.length === 1, parkingRows.length + ' rows');

  const row = parkingRows[0] || {};
  check('fallback: source is pos', row.source === 'pos', String(row.source));
  check('fallback: kind is parking', row.kind === 'parking', String(row.kind));
  check('fallback: one vehicle', row.vehicle_count === 1, String(row.vehicle_count));
  check('fallback: the amount is 1000', row.amount_cents === 1000, String(row.amount_cents));
  check(
    'fallback: the note identifies it afterwards',
    typeof row.note === 'string' && /fallback/i.test(row.note),
    String(row.note)
  );
  check(
    'fallback: vendor_applications was never written',
    writes.length === 0,
    writes.length + ' writes'
  );

  /* Idempotent on square_payment_id like every other path. */
  await deliver({
    id: 'sqpay_noref_during',
    status: 'COMPLETED',
    order_id: NOREF_ORDER_ID,
    amount_money: { amount: 1000, currency: 'USD' },
  });
  check('fallback: a redelivery adds no row', parkingRows.length === 1, parkingRows.length + ' rows');

  /* ---- 2500 during the event. A booth, and it must never match ---- */

  reset();
  parkingRows = [];
  calendar = eventWindow(true);

  response = await deliver({
    id: 'sqpay_noref_2500',
    status: 'COMPLETED',
    order_id: NOREF_ORDER_ID,
    amount_money: { amount: 2500, currency: 'USD' },
  });
  body = response.__json || {};

  check('fallback 2500: handler returned 200', response.status === 200, 'got ' + response.status);
  check(
    'fallback 2500: it was ignored',
    body.ignored === 'no reference id',
    JSON.stringify(body)
  );
  check('fallback 2500: no row was written', parkingRows.length === 0, parkingRows.length + ' rows');

  /* ---- 1000 with no event in progress ---- */

  reset();
  parkingRows = [];
  calendar = eventWindow(false);

  response = await deliver({
    id: 'sqpay_noref_outside',
    status: 'COMPLETED',
    order_id: NOREF_ORDER_ID,
    amount_money: { amount: 1000, currency: 'USD' },
  });
  body = response.__json || {};

  check('fallback outside: handler returned 200', response.status === 200, 'got ' + response.status);
  check(
    'fallback outside: it was ignored',
    body.ignored === 'no reference id',
    JSON.stringify(body)
  );
  check(
    'fallback outside: no row was written',
    parkingRows.length === 0,
    parkingRows.length + ' rows'
  );
}

(async () => {
  await vendorCase();
  await parkingCase();
  await donationCase();
  await alertFailureCase();
  await amountFallbackCase();

  fs.rmSync(outDir, { recursive: true, force: true });

  if (failures.length) {
    console.error('check-webhook-settles: FAILED');
    for (const f of failures) console.error('  ' + f);
    process.exit(1);
  }

  console.log(
    'check-webhook-settles: an admin-requested link settles identically to a signup ' +
      '(paid, paid_at, square_payment_id, payment_method online, approval untouched), ' +
      'a parking referenceId books one row as source qr and kind parking, ' +
      'a donation referenceId books one as kind donation with no vehicle, ' +
      "neither touches a vendor row, both are no-ops on redelivery, and Square's " +
      'own fee is written when the later delivery brings it and never overwritten. ' +
      'A payment alert that throws, or rejects, changes none of it: the row is ' +
      'still written and Square still gets a 200, and only a real insert sends one. ' +
      'A reference-less payment of exactly 1000 during an event books one parking ' +
      'row as source pos with a note naming the fallback, while 2500 during an ' +
      'event and 1000 outside one are both still ignored.'
  );
})().catch((err) => {
  console.error('check-webhook-settles: threw');
  console.error(err);
  process.exit(1);
});
