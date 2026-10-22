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
let applicationAlerts = [];

/* The race tables, and the order the Square fake answers with. */
let raceRows = { race_registrations: [], race_groups: [], race_sponsors: [] };
let raceUpdates = [];
let raceOrder = null;
/** Ids the fake answers null for, so a reference can point at nothing. */
let raceMissingIds = new Set();
const RACE_TABLES = ['race_registrations', 'race_groups', 'race_sponsors'];
let alertMode = 'ok';
/** How long the deliberately slow sender is held open. */
const SLOW_ALERT_MS = 2000;

function reset() {
  writes = [];
  emails = [];
  invalidated = [];
  alerts = [];
  applicationAlerts = [];
  alertMode = 'ok';
  /* Every table the handler can write, cleared together. These were being
     reset by hand at each call site, which is how a case ends up asserting
     against a row the previous case wrote. */
  parkingRows = [];
  raceRows = { race_registrations: [], race_groups: [], race_sponsors: [] };
  raceUpdates = [];
  raceOrder = null;
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
          /* A race settle awaits the builder rather than calling maybeSingle,
             so the update lands here. Recorded, not applied: this gate asserts
             what the handler tried to write. */
          if (RACE_TABLES.includes(table) && state.payload) {
            raceUpdates.push({ table, payload: state.payload, filters: { ...state.filters } });
            resolve({ data: null, error: null });
            return;
          }
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
          if (RACE_TABLES.includes(table)) {
            /* The idempotency read: has this payment already been recorded?
               Answered from what the handler has written in this run. */
            if (state.filters.square_payment_id !== undefined) {
              const seen = raceUpdates.find(
                (u) => u.payload.square_payment_id === state.filters.square_payment_id
              );
              return { data: seen ? { id: seen.filters.id } : null, error: null };
            }

            /* A reference pointing at nothing, for the unknown reference
               case. Checked before the synthesis below, which otherwise
               answers every id with a row. */
            if (raceMissingIds.has(state.filters.id)) {
              return { data: null, error: null };
            }

            /* The row being settled. Priced, so the underpaid case has
               something to be short of. */
            const amounts = {
              race_registrations: RACE_ENTRY_CENTS,
              race_groups: RACE_GROUP_CENTS,
              race_sponsors: RACE_SPONSOR_CENTS,
            };

            return {
              data: {
                id: state.filters.id,
                amount_cents: amounts[table],
                payment_status: raceUpdates.some((u) => u.table === table) ? 'paid' : 'unpaid',
              },
              error: null,
            };
          }

          if (table === 'parking_payments') {
            /* The dedupe read. Answer from what has been inserted, so the
               second delivery of one payment finds the first. */
            /* Matched on whichever column was actually filtered rather than on
               square_payment_id by name. The handler falls back to the order id
               when a delivery carries no payment id, and a fake that only ever
               compared one column reported no match every time, which made a
               fixed duplicate still look like a duplicate. */
            const seen = parkingRows.find((x) =>
              Object.entries(state.filters).every(([col, want]) => x[col] === want)
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
          if (raceOrder && orderId === raceOrder.orderId) {
            return {
              order: {
                id: orderId,
                referenceId: raceOrder.reference,
                totalMoney: { amount: raceOrder.amount },
                netAmountDueMoney: { amount: 0 },
              },
            };
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
    getEvents: async () => [],
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
  /* The owner alert when a vendor payment settles. Faked for the same reason
     as the parking one: this gate is about the row and the 200, and a mailer
     has no business in either. Its absence is what broke the build at
     ba75d68, which is the failure this gate exists to catch and did catch. */
  '@/lib/application-alert': {
    spotLabelFor: (spot) => (spot === 'truck' ? 'Food Truck Spot' : 'Vendor Booth'),
    sendApplicationAlert: async (input) => {
      applicationAlerts.push(input);
      return true;
    },
  },
  /* Reads a row back and mails it. Faked: this gate is about the row and the
     200, and a mailer has no business in either. */
  '@/lib/race-alert': {
    sendRaceSettledAlert: async () => true,
    sendRaceAlert: async () => true,
    sendRaceConfirmation: async () => true,
  },
  '@/lib/parking-alert': {
    sendParkingAlert: (input) => {
      alerts.push(input);
      if (alertMode === 'sync') throw new Error('Resend is down');
      if (alertMode === 'reject') return Promise.reject(new Error('Resend refused it'));
      /* A mailer that takes its time. Square gives the webhook a few seconds
         and retries a slow one, and a retry is a second delivery of the same
         ten dollars: the response must not wait on this. */
      if (alertMode === 'slow') return new Promise((r) => setTimeout(() => r(true), SLOW_ALERT_MS));
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

/* The race halves, compiled for real for the same reason parking is: the
   reference parser and the settle rules are the thing under test, and a fake
   of either would be the gate reading its own answer back. Their edges, the
   Square client and the Supabase client, are already in FAKES above. */
for (const [name, specifier] of [
  ['race-payment-link', '@/lib/race-payment-link'],
  ['race-settle', '@/lib/race-settle'],
]) {
  const file = path.join(outDir, name + '.js');
  fs.writeFileSync(
    file,
    ts.transpileModule(fs.readFileSync(path.join(ROOT, 'lib/' + name + '.ts'), 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: name + '.ts',
    }).outputText
  );
  FAKES[specifier] = require(file);
}

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
 * A delivery with no payment id, redelivered.
 *
 * square_payment_id is nullable and Postgres does not constrain NULLs in a
 * unique index, so a row written with a null id was deduped by nothing: the
 * read that finds a previous delivery was skipped outright, and Square
 * redelivers until it gets a 2xx. That is not one duplicate, it is as many as
 * it takes, each one ten dollars added to an organization's payout that nobody
 * took at the gate.
 *
 * Square has always set payment.id, so this never fired. It is driven here
 * because "it has not happened" is not a property of our code.
 */
async function noPaymentIdCase() {
  reset();
  parkingRows = [];

  const delivery = {
    status: 'COMPLETED',
    order_id: PARKING_ORDER_ID,
    amount_money: { amount: PARKING_CENTS, currency: 'USD' },
  };

  const first = await deliver(delivery);
  const second = await deliver(delivery);
  const third = await deliver(delivery);

  check('no payment id: first delivery returned 200', first.status === 200, `got ${first.status}`);
  check(
    'no payment id: the money was still recorded',
    (first.__json || {}).inserted === true,
    JSON.stringify(first.__json)
  );
  check(
    'no payment id: three deliveries wrote one row',
    parkingRows.length === 1,
    `${parkingRows.length} rows`
  );
  check('no payment id: redelivery returned 200', second.status === 200 && third.status === 200);
  check(
    'no payment id: redelivery reported no insert',
    (second.__json || {}).inserted === false && (third.__json || {}).inserted === false,
    JSON.stringify([second.__json, third.__json])
  );

  const row = parkingRows[0] || {};
  check('no payment id: the order id was kept', row.square_order_id === PARKING_ORDER_ID, String(row.square_order_id));
  check('no payment id: the amount is intact', row.amount_cents === PARKING_CENTS, String(row.amount_cents));
}

/**
 * A mailer that is slow, and a webhook that answers anyway.
 *
 * Square allows a webhook a few seconds and retries one that takes longer, and
 * a retry is a second delivery of the same ten dollars. The row's unique index
 * stops that becoming a duplicate, but a response that waits on Resend turns a
 * slow mail provider into a retry storm on the busiest night of the year.
 *
 * So the response time is measured against a sender deliberately held open for
 * two seconds. Not awaited means not awaited, and the only way to state that is
 * with a clock.
 */
async function slowAlertCase() {
  reset();
  parkingRows = [];
  alertMode = 'slow';

  const started = Date.now();

  const response = await deliver({
    id: 'sqpay_slow_alert',
    status: 'COMPLETED',
    order_id: PARKING_ORDER_ID,
    amount_money: { amount: PARKING_CENTS, currency: 'USD' },
  });

  const elapsed = Date.now() - started;
  alertMode = 'ok';

  check('slow alert: the alert was reached', alerts.length === 1, `${alerts.length} calls`);
  check('slow alert: Square still got a 200', response.status === 200, `got ${response.status}`);
  check('slow alert: the row was written', parkingRows.length === 1, `${parkingRows.length} rows`);

  /* The whole point. The sender is held for SLOW_ALERT_MS; the response has to
     come back in a fraction of that or it is being awaited somewhere. */
  check(
    'slow alert: the response did not wait for the mailer',
    elapsed < SLOW_ALERT_MS / 2,
    `${elapsed}ms elapsed against a ${SLOW_ALERT_MS}ms sender`
  );

  console.log(`  ok  ${'slow alert, response time'.padEnd(32)} ${elapsed}ms vs a ${SLOW_ALERT_MS}ms mailer`);
}

/* ------------------------------------------------------------- the race */

/**
 * Three reference shapes, three tables, one branch each.
 *
 * race:, racegroup: and sponsor: each settle a different row, and the webhook
 * decides which from the referenceId alone. A branch quietly removed would not
 * break a build or a type: the payment would fall through to the parking check,
 * fail that, fall through to the vendor path, be looked up as an application
 * UUID, miss, and be answered with a cheerful 200. Somebody's entry fee taken
 * and nothing recorded, which is exactly what happened to a night of parking in
 * September.
 *
 * So each one is driven, and each case fails if its branch goes.
 */
const RACE_SLUG_FIXTURE = 'turkey-trot-2026';
const RACE_REG_ID = '33333333-4444-4555-8666-777777777777';
const RACE_GROUP_ID = '44444444-5555-4666-8777-888888888888';
const RACE_SPONSOR_ID = '55555555-6666-4777-8888-999999999999';
const RACE_ENTRY_CENTS = 2500;
const RACE_GROUP_CENTS = 7500;
const RACE_SPONSOR_CENTS = 50000;

async function raceCase(label, orderId, reference, amount, expect) {
  reset();
  raceRows = { race_registrations: [], race_groups: [], race_sponsors: [] };
  raceOrder = { orderId, reference, amount };

  const response = await deliver({
    id: 'sqpay_' + label.replace(/\W/g, '_'),
    status: 'COMPLETED',
    order_id: orderId,
    amount_money: { amount, currency: 'USD' },
  });

  const body = response.__json || {};

  check(label + ': handler returned 200', response.status === 200, 'got ' + response.status);
  check(label + ': took the race branch', body.race === true, JSON.stringify(body));
  check(label + ': named the right kind', body.kind === expect.kind, String(body.kind));
  check(
    label + ': named the race',
    body.raceSlug === RACE_SLUG_FIXTURE,
    String(body.raceSlug)
  );
  check(label + ': settled', body.settled === expect.settled, String(body.settled));
  check(
    label + ': vendor_applications was never written',
    writes.length === 0,
    writes.length + ' writes'
  );
  check(
    label + ': parking_payments was never written',
    parkingRows.length === 0,
    parkingRows.length + ' parking rows'
  );

  /* The row itself, so this is about what was recorded rather than about what
     the response said. */
  const updated = raceUpdates.find((u) => u.table === expect.table);
  check(label + ': the right table was updated', Boolean(updated), expect.table);
  if (updated) {
    check(label + ': marked paid', updated.payload.payment_status === 'paid', String(updated.payload.payment_status));
    check(
      label + ': captured the payment id',
      typeof updated.payload.square_payment_id === 'string',
      String(updated.payload.square_payment_id)
    );
  }
}

async function raceCases() {
  await raceCase(
    'race registration',
    'ORDER_RACE_REG',
    'race:' + RACE_SLUG_FIXTURE + ':' + RACE_REG_ID,
    RACE_ENTRY_CENTS,
    { kind: 'registration', table: 'race_registrations', settled: true }
  );

  await raceCase(
    'race group',
    'ORDER_RACE_GROUP',
    'racegroup:' + RACE_SLUG_FIXTURE + ':' + RACE_GROUP_ID,
    RACE_GROUP_CENTS,
    { kind: 'group', table: 'race_groups', settled: true }
  );

  await raceCase(
    'race sponsor',
    'ORDER_RACE_SPONSOR',
    'sponsor:' + RACE_SLUG_FIXTURE + ':' + RACE_SPONSOR_ID,
    RACE_SPONSOR_CENTS,
    { kind: 'sponsor', table: 'race_sponsors', settled: true }
  );

  /* A redelivery of a settled payment is a no op. Square redelivers until it
     gets a 2xx, so this is the ordinary case rather than the rare one. */
  reset();
  raceRows = { race_registrations: [], race_groups: [], race_sponsors: [] };
  raceOrder = {
    orderId: 'ORDER_RACE_REG',
    reference: 'race:' + RACE_SLUG_FIXTURE + ':' + RACE_REG_ID,
    amount: RACE_ENTRY_CENTS,
  };

  const payment = {
    id: 'sqpay_race_redeliver',
    status: 'COMPLETED',
    order_id: 'ORDER_RACE_REG',
    amount_money: { amount: RACE_ENTRY_CENTS, currency: 'USD' },
  };

  const first = await deliver(payment);
  const second = await deliver(payment);

  check('race redelivery: first settled', (first.__json || {}).settled === true);
  check(
    'race redelivery: second did not',
    (second.__json || {}).settled === false,
    JSON.stringify(second.__json)
  );
  check('race redelivery: one update', raceUpdates.length === 1, raceUpdates.length + ' updates');

  /* An entry fee that does not cover the entry is not a place in the field. */
  reset();
  raceRows = { race_registrations: [], race_groups: [], race_sponsors: [] };
  raceOrder = {
    orderId: 'ORDER_RACE_REG',
    reference: 'race:' + RACE_SLUG_FIXTURE + ':' + RACE_REG_ID,
    amount: 500,
  };

  const short = await deliver({
    id: 'sqpay_race_underpaid',
    status: 'COMPLETED',
    order_id: 'ORDER_RACE_REG',
    amount_money: { amount: 500, currency: 'USD' },
  });

  check('race underpaid: still a 200', short.status === 200, 'got ' + short.status);
  check(
    'race underpaid: not settled',
    (short.__json || {}).settled === false,
    JSON.stringify(short.__json)
  );
  check('race underpaid: nothing was written', raceUpdates.length === 0, raceUpdates.length + ' updates');
}

/**
 * A referenceId that names a row which does not exist.
 *
 * Two things must both be true. It must not throw, because Square retries a
 * 500 and a retry loop on a payment is worse than the lost reference. And it
 * must not answer a bare success either, because a 200 that means "settled
 * nothing" is indistinguishable from a 200 that means "settled the payment",
 * and the difference is whether somebody has been charged for a registration
 * that is not marked paid. It has to say it ignored it, and say why.
 */
async function unknownReferenceCase() {
  reset();

  /* An order whose referenceId names a race registration that does not
     exist. Resolved through the order the same way every real delivery is. */
  const missingId = '00000000-0000-4000-8000-000000000000';
  raceMissingIds.add(missingId);

  raceOrder = {
    orderId: 'order-unknown-ref',
    reference: 'race:turkey-trot-2026:' + missingId,
    amount: 3000,
  };

  let thrown = null;
  let response = null;

  try {
    response = await deliver({
      id: 'pay-unknown-ref',
      status: 'COMPLETED',
      order_id: 'order-unknown-ref',
      amount_money: { amount: 3000, currency: 'USD' },
    });
  } catch (err) {
    thrown = err;
  }

  check(
    'unknown reference: did not throw',
    !thrown,
    thrown ? String(thrown.message || thrown) : ''
  );

  if (thrown) return;

  const status = response.status;
  const body = response.__json || {};

  /* Square has to get a 2xx so it stops retrying a payment it cannot place. */
  check(
    'unknown reference: Square gets a 2xx',
    status >= 200 && status < 300,
    'status ' + status
  );

  /* And the body must name what happened. A bare success is
     indistinguishable from a settled payment, and the difference is whether
     somebody has been charged for a registration nothing marked paid. */
  const said = JSON.stringify(body);
  check(
    'unknown reference: the response says it settled nothing',
    /ignored|unknown|not ?found|no ?row|missing/i.test(said),
    'body ' + said
  );

  const wrote =
    raceRows.race_registrations.length +
    raceRows.race_groups.length +
    raceRows.race_sponsors.length;

  check('unknown reference: wrote no row', wrote === 0, wrote + ' row(s)');
}
async function badSignatureCase() {
  const payload = JSON.stringify({
    type: 'payment.updated',
    data: {
      object: {
        payment: {
          id: 'pay-bad-sig',
          status: 'COMPLETED',
          amount_money: { amount: 3000, currency: 'USD' },
          order_id: 'order-bad-sig',
          reference_id: 'race:turkey-trot-2026:' + RACE_REG_ID,
        },
      },
    },
  });

  const post = (signature) =>
    route.POST({
      headers: { get: (h) => (h === 'x-square-hmacsha256-signature' ? signature : null) },
      text: async () => payload,
    });

  const good = createHmac('sha256', process.env.SQUARE_WEBHOOK_SIGNATURE_KEY)
    .update(`${SITE_URL}/api/square-webhook` + payload, 'utf8')
    .digest('base64');

  for (const [label, signature] of [['tampered', good.replace(/.$/, good.endsWith('A') ? 'B' : 'A')], ['missing', null]]) {
    reset();

    let status = null;
    let thrown = null;
    try {
      const response = await post(signature);
      status = response.status;
    } catch (err) {
      thrown = err;
    }

    check(
      'signature ' + label + ', rejected',
      !thrown && status >= 400,
      thrown ? String(thrown.message || thrown) : 'status ' + status
    );

    const wrote =
      raceRows.race_registrations.length +
      raceRows.race_groups.length +
      raceRows.race_sponsors.length;

    check(
      'signature ' + label + ', wrote no row',
      wrote === 0,
      wrote + ' row(s) written'
    );
  }
}

(async () => {
  await vendorCase();
  await parkingCase();
  await donationCase();
  await alertFailureCase();
  await noPaymentIdCase();
  await slowAlertCase();
  await raceCases();
  await unknownReferenceCase();
  await badSignatureCase();

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
      'A delivery carrying no payment id at all is deduped on the order instead, so ' +
      'three deliveries of it write one row rather than three. A mailer held open ' +
      'for two seconds delays the response by none of them. The three race reference ' +
      'shapes each settle their own table and nothing else, a redelivery settles ' +
      'nothing twice, and an underpaid entry is refused.'
  );
})().catch((err) => {
  console.error('check-webhook-settles: threw');
  console.error(err);
  process.exit(1);
});
