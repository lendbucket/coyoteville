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

function reset() {
  writes = [];
  emails = [];
  invalidated = [];
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
            return { data: seen ? { id: seen.id } : null, error: null };
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
}

(async () => {
  await vendorCase();
  await parkingCase();

  fs.rmSync(outDir, { recursive: true, force: true });

  if (failures.length) {
    console.error('check-webhook-settles: FAILED');
    for (const f of failures) console.error('  ' + f);
    process.exit(1);
  }

  console.log(
    'check-webhook-settles: an admin-requested link settles identically to a signup ' +
      '(paid, paid_at, square_payment_id, payment_method online, approval untouched), ' +
      'and a parking referenceId books one parking_payments row as source qr, ' +
      'touches no vendor row, and is a no-op on redelivery.'
  );
})().catch((err) => {
  console.error('check-webhook-settles: threw');
  console.error(err);
  process.exit(1);
});
