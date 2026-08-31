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
 * The case exercised is deliberately the awkward one: a row that came in
 * through the retired prepaid path, so payment_method is 'offline' and
 * approval_status is already 'approved'. That is the row this feature was
 * built for.
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

const writes = [];
const emails = [];
const invalidated = [];

function supabaseFake() {
  return {
    from(table) {
      const state = { table, filters: {}, payload: null };

      const chain = {
        select() {
          return chain;
        },
        update(payload) {
          state.payload = payload;
          return chain;
        },
        eq(column, value) {
          state.filters[column] = value;
          return chain;
        },
        async maybeSingle() {
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
          if (orderId !== ORDER_ID) throw new Error('unexpected order ' + orderId);
          /* Exactly the order lib/payment-link.ts asks Square to create: the
             application id as referenceId, and the fee as the total. */
          return {
            order: {
              id: ORDER_ID,
              referenceId: APPLICATION_ID,
              totalMoney: { amount: AMOUNT_CENTS },
              netAmountDueMoney: { amount: 0 },
            },
          };
        },
      },
    }),
  },
  '@/lib/supabase': {
    isSupabaseConfigured: () => true,
    getSupabaseAdmin: supabaseFake,
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
  '@/lib/subscription-events': {
    handleInvoiceFailed: async () => {},
    handleInvoicePaid: async () => {},
    handleSubscriptionUpdated: async () => {},
  },
};

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

const route = require(outFile);

/* ----------------------------------------------------------------- drive */

const payload = JSON.stringify({
  type: 'payment.updated',
  data: {
    object: {
      payment: {
        id: PAYMENT_ID,
        status: 'COMPLETED',
        order_id: ORDER_ID,
        amount_money: { amount: AMOUNT_CENTS, currency: 'USD' },
      },
    },
  },
});

const signature = createHmac('sha256', process.env.SQUARE_WEBHOOK_SIGNATURE_KEY)
  .update(`${SITE_URL}/api/square-webhook` + payload, 'utf8')
  .digest('base64');

const request = {
  headers: { get: (h) => (h === 'x-square-hmacsha256-signature' ? signature : null) },
  text: async () => payload,
};

const failures = [];
function check(label, condition, detail) {
  if (!condition) failures.push(`${label}${detail ? ': ' + detail : ''}`);
}

route
  .POST(request)
  .then((response) => {
    const body = response.__json || {};

    check('handler returned 200', response.status === 200, `got ${response.status}`);
    check('mapped to the application', body.applicationId === APPLICATION_ID, JSON.stringify(body));
    check('not ignored', !body.ignored, String(body.ignored));

    const settle = writes.find((w) => w.payload && w.payload.payment_status === 'paid');
    check('the row was marked paid', Boolean(settle));

    if (settle) {
      check('paid_at was stamped', Boolean(settle.payload.paid_at));
      check(
        'square_payment_id was captured',
        settle.payload.square_payment_id === PAYMENT_ID,
        String(settle.payload.square_payment_id)
      );
      check(
        'square_order_id was captured',
        settle.payload.square_order_id === ORDER_ID,
        String(settle.payload.square_order_id)
      );
      check(
        'payment_method moved to online',
        settle.payload.payment_method === 'online',
        String(settle.payload.payment_method)
      );
      check(
        'approval_status was left alone',
        !('approval_status' in settle.payload),
        'handler wrote approval_status'
      );
      check(
        'the unpaid guard was applied',
        settle.filters.payment_status === 'unpaid',
        String(settle.filters.payment_status)
      );
    }

    check('the spot cache was invalidated', invalidated.includes(ROW.event_slug));
    check('the vendor was emailed once', emails.length === 1, `${emails.length} emails`);

    fs.rmSync(outDir, { recursive: true, force: true });

    if (failures.length) {
      console.error('check-webhook-settles: FAILED');
      for (const f of failures) console.error('  ' + f);
      process.exit(1);
    }

    console.log(
      'check-webhook-settles: an admin-requested link settles identically to a signup ' +
        '(paid, paid_at, square_payment_id, payment_method online, approval untouched).'
    );
  })
  .catch((err) => {
    console.error('check-webhook-settles: threw');
    console.error(err);
    process.exit(1);
  });
