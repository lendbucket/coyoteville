#!/usr/bin/env node
/**
 * Every booking kind and spot type, driven through the real submit route.
 *
 * This exists because vendor_applications.event_slug was NOT NULL in
 * production while the code correctly sent null for day and monthly bookings.
 * Every one of those signups died at the insert with Postgres 23502, after the
 * vendor had filled in the whole form and uploaded their files. It shipped that
 * way for a week and the only visible symptom was that no day or monthly row
 * had ever existed, which reads as "nobody wanted one".
 *
 * A build that typechecks proves nothing about the shape of a row. So this
 * compiles app/api/vendor-application/route.ts, swaps every dependency for a
 * fake, posts a real multipart body for each of the six combinations that
 * matter, and asserts on the object handed to .insert():
 *
 *   event   -> event_slug set,  booking_date null
 *   day     -> event_slug null, booking_date set
 *   monthly -> both null, plus the subscription fields
 *
 * The fake Supabase also refuses a null in a NOT NULL column, so the original
 * production failure is reproducible here by flipping one flag.
 *
 * Nothing reaches a real database, Square, or Resend.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');

/* ------------------------------------------------------------- fixtures */

const EVENT_SLUG = 'home-game-2026-09-11';
const EVENT_DATE = '2026-09-11';
const OPEN_DAY = '2026-09-18'; // an ordinary Friday, not an event date

/** Columns the live table refuses a null in. event_slug is deliberately not here. */
const NOT_NULL = new Set([
  'business_name',
  'contact_name',
  'phone',
  'email',
  'spot_type',
  'booking_kind',
  'sells',
  'signature_name',
  'amount_cents',
  'payment_status',
  'approval_status',
]);

const inserted = [];

/* ------------------------------------------------------- the module graph */

function supabaseFake() {
  return {
    from() {
      const chain = {
        insert(payload) {
          /* Stand in for the table's own constraints, so a shape the real
             database would reject fails here instead of in production. */
          for (const col of NOT_NULL) {
            if (payload[col] === null || payload[col] === undefined) {
              chain.__error = {
                code: '23502',
                message: `null value in column "${col}" violates not-null constraint`,
              };
            }
          }
          inserted.push(payload);
          return chain;
        },
        update() {
          return chain;
        },
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        async single() {
          if (chain.__error) return { data: null, error: chain.__error };
          return { data: { id: '11111111-2222-4333-8444-555555555555' }, error: null };
        },
        async maybeSingle() {
          return chain.single();
        },
      };
      return chain;
    },
    /* The real lib/uploads validator runs, because a food truck's DSHS permit
       is exactly the path that has never been exercised for a day or a monthly
       booking. Only the write is faked. */
    storage: {
      from() {
        return {
          async upload() {
            return { data: { path: 'fake/path' }, error: null };
          },
          async createSignedUrl() {
            return { data: { signedUrl: 'https://example.test/signed' }, error: null };
          },
        };
      },
    },
  };
}

const FAKES = {
  'server-only': {},
  'next/server': {
    NextResponse: {
      json(body, init) {
        return { __json: body, status: (init && init.status) || 200 };
      },
    },
  },
  '@/lib/supabase': { isSupabaseConfigured: () => true, getSupabaseAdmin: supabaseFake },
  '@/lib/square': { isSquareConfigured: () => true },
  '@/lib/payment-link': {
    createVendorPaymentLink: async () => ({
      checkoutUrl: 'https://square.link/u/FAKE',
      paymentLinkId: 'PL_FAKE',
      orderId: 'ORDER_FAKE',
    }),
    spotLabelFor: (s) => s,
  },
  '@/lib/subscriptions': {
    isSubscriptionsConfigured: () => true,
    storeCardOnFile: async () => ({
      ok: true,
      value: { customerId: 'CUST_FAKE', cardId: 'CARD_FAKE' },
    }),
    MONTHLY_PRICING: {
      booth: { label: 'Permanent booth', cents: 15000 },
      truck: { label: 'Permanent truck', cents: 30000 },
    },
  },
  '@/lib/notify': {
    notifyRegistrationStarted: async () => {},
    notifyPaymentReceived: async () => {},
    notifyRegistration: async () => {},
  },
  '@/lib/spots': {
    invalidateSpots: () => {},
    getSpots: async () => ({ booth: { capacity: 20 }, truck: { capacity: 8 } }),
    reviewSlotFor: () => ({ open: true }),
  },
  '@/lib/days': {
    getDayStatus: async (day) => ({
      day,
      bookable: day !== EVENT_DATE,
      reason: day === EVENT_DATE ? 'event' : null,
      eventName: day === EVENT_DATE ? 'Alice Home Game' : null,
      eventSlug: day === EVENT_DATE ? EVENT_SLUG : null,
    }),
    canBook: () => true,
    monthlyRoomFor: async () => ({ available: true }),
  },
  '@/lib/event-schedule': {
    getScheduledEvent: async (slug) =>
      slug === EVENT_SLUG
        ? {
            slug,
            name: 'Alice Home Game',
            isPublished: true,
            deadlinePassed: false,
            isFull: false,
            displayDate: 'Friday, September 11, 2026',
            signupClosesDisplay: 'Wednesday, September 9, 2026 at 11:59 PM',
          }
        : null,
  },
  '@/lib/rate-limit': {
    getClientIp: () => '203.0.113.7',
    rateLimit: () => ({ ok: true }),
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

/* --------------------------------------------------------- compile route */

/**
 * Compile one repo TS file to CommonJS, mirroring its path under outDir.
 *
 * The tree is mirrored rather than flattened so that a relative import inside
 * a compiled file, lib/agreement/current.ts reaching ./versions/v5-0-2026,
 * resolves the same way it does in the real build. Flattening broke exactly
 * that, which is its own small lesson about assuming a shape.
 */
function load(rel, outDir) {
  const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: path.basename(rel),
  }).outputText;

  const file = path.join(outDir, rel.replace(/.tsx?$/, '.js'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
  return file;
}
const outDir = fs.mkdtempSync(path.join(ROOT, '.check-booking-'));

/* Anything the route imports as @/... that is not faked is compiled from the
   real source on demand, so validation, pricing, the booking helpers and the
   agreement version are the code that actually ships rather than a stand in.
   Only the edges are faked: the database, Square, email, and the two
   availability lookups. */
const compiled = new Map();

/** Compile ROOT-relative source `rel` if it exists, and return its .js path. */
function compileRel(rel) {
  if (compiled.has(rel)) return compiled.get(rel);
  let src = null;
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    if (fs.existsSync(path.join(ROOT, rel + ext))) { src = rel + ext; break; }
  }
  if (!src) return null;
  const file = load(src, outDir);
  compiled.set(rel, file);
  return file;
}

/**
 * Resolve one import the way the real build would.
 *
 * Two kinds get compiled on demand: the @/ alias, and a relative import from a
 * file we already compiled. The second matters because the agreement registry
 * reaches its frozen versions relatively, and nothing else would pull those in.
 */
/**
 * The repo-relative module id an import refers to, or null if it is external.
 *
 * Both the @/ alias and a relative import from an already compiled file are
 * normalised to the same form, "lib/supabase", so that a fake registered under
 * "@/lib/supabase" is honoured either way. That matters: lib/uploads reaches
 * the database through a relative ./supabase, and without this it got the real
 * client and tried to talk to a project that does not exist.
 */
function repoIdFor(request, parent) {
  if (request.startsWith('@/')) return request.slice(2);
  if (request.startsWith('.') && parent && parent.filename && parent.filename.startsWith(outDir)) {
    const parentRel = path.relative(outDir, path.dirname(parent.filename));
    return path.join(parentRel, request).split(path.sep).join('/');
  }
  return null;
}

Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(FAKES, request)) return FAKES[request];
  const id = repoIdFor(request, parent);
  if (id) {
    const key = '@/' + id;
    if (Object.prototype.hasOwnProperty.call(FAKES, key)) return FAKES[key];
    const file = compileRel(id);
    if (file) return originalLoad.call(this, file, parent, isMain);
  }
  return originalLoad.call(this, request, parent, isMain);
};

Module._resolveFilename = function (request, parent, ...rest) {
  if (Object.prototype.hasOwnProperty.call(FAKES, request)) return request;
  const id = repoIdFor(request, parent);
  if (id) {
    const key = '@/' + id;
    if (Object.prototype.hasOwnProperty.call(FAKES, key)) return key;
    const file = compileRel(id);
    if (file) return file;
  }
  return originalResolve.call(this, request, parent, ...rest);
};

process.env.NEXT_PUBLIC_SITE_URL = 'https://coyoteville.test';
process.env.SQUARE_ACCESS_TOKEN = 'test';
process.env.SQUARE_LOCATION_ID = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
process.env.RESEND_API_KEY = 'test';
process.env.FROM_EMAIL = 'test@coyoteville.test';

const routeFile = load('app/api/vendor-application/route.ts', outDir);
const route = require(routeFile);

/* ------------------------------------------------------------ the cases */

const BASE = {
  business_name: "Sassy's Slime and More",
  contact_name: 'Kristi Turner',
  phone: '361 555 0142',
  email: 'vendor@example.test',
  sells: 'slime and small toys',
  notes: '',
  signature_name: 'Kristi Turner',
  signed_date: '2026-09-04',
  waiver_accepted: 'true',
  permits_confirmed: 'true',
};

const CASES = [
  {
    label: 'Event date + Vendor Booth',
    fields: { ...BASE, booking_kind: 'event', event_slug: EVENT_SLUG, spot_type: 'booth', serves_food: 'false' },
    expect: { booking_kind: 'event', event_slug: EVENT_SLUG, booking_date: null },
  },
  {
    label: 'Event date + Food Truck',
    fields: { ...BASE, booking_kind: 'event', event_slug: EVENT_SLUG, spot_type: 'truck', serves_food: 'true' },
    expect: { booking_kind: 'event', event_slug: EVENT_SLUG, booking_date: null },
    permit: true,
  },
  {
    label: 'Single day + Vendor Booth',
    fields: { ...BASE, booking_kind: 'day', booking_date: OPEN_DAY, spot_type: 'booth', serves_food: 'false' },
    expect: { booking_kind: 'day', event_slug: null, booking_date: OPEN_DAY },
  },
  {
    label: 'Single day + Food Truck',
    fields: { ...BASE, booking_kind: 'day', booking_date: OPEN_DAY, spot_type: 'truck', serves_food: 'true' },
    expect: { booking_kind: 'day', event_slug: null, booking_date: OPEN_DAY },
    permit: true,
  },
  {
    label: 'Permanent monthly + Vendor Booth',
    fields: {
      ...BASE,
      booking_kind: 'monthly',
      spot_type: 'booth',
      serves_food: 'false',
      recurring_acknowledged: 'true',
      card_source_id: 'cnon:card-nonce-ok',
    },
    expect: { booking_kind: 'monthly', event_slug: null, booking_date: null, subscription_status: 'pending' },
  },
  {
    label: 'Permanent monthly + Food Truck',
    fields: {
      ...BASE,
      booking_kind: 'monthly',
      spot_type: 'truck',
      serves_food: 'true',
      recurring_acknowledged: 'true',
      card_source_id: 'cnon:card-nonce-ok',
    },
    expect: { booking_kind: 'monthly', event_slug: null, booking_date: null, subscription_status: 'pending' },
    permit: true,
  },
];

function buildRequest(fields, permit) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  if (permit) {
    form.append('permit', new Blob([Buffer.from('%PDF-1.4 fake permit')], { type: 'application/pdf' }), 'permit.pdf');
  }
  return new Request('https://coyoteville.test/api/vendor-application', {
    method: 'POST',
    body: form,
    headers: { 'x-forwarded-for': '203.0.113.7' },
  });
}

/* ---------------------------------------------------------------- run it */

const failures = [];

(async () => {
  for (const c of CASES) {
    inserted.length = 0;
    let res;
    try {
      res = await route.POST(buildRequest(c.fields, c.permit));
    } catch (err) {
      failures.push(`${c.label}: handler threw: ${err && err.message}`);
      continue;
    }

    const body = res.__json || {};

    if (res.status !== 200 || !body.ok) {
      failures.push(
        `${c.label}: submit refused with ${res.status}: ${body.error || JSON.stringify(body)}`
      );
      continue;
    }

    const row = inserted[0];
    if (!row) {
      failures.push(`${c.label}: nothing was inserted`);
      continue;
    }

    for (const [col, want] of Object.entries(c.expect)) {
      const got = row[col] === undefined ? null : row[col];
      if (got !== want) {
        failures.push(
          `${c.label}: ${col} is ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`
        );
      }
    }

    /* Exactly one of the two booking columns, always. This is the invariant a
       database check constraint would state, and the one whose absence let the
       NOT NULL survive. */
    const hasSlug = row.event_slug != null;
    const hasDate = row.booking_date != null;
    const expectBoth = c.expect.booking_kind === 'monthly' ? 0 : 1;
    if (Number(hasSlug) + Number(hasDate) !== expectBoth) {
      failures.push(
        `${c.label}: expected ${expectBoth} booking column(s) set, got event_slug=${JSON.stringify(row.event_slug)} booking_date=${JSON.stringify(row.booking_date)}`
      );
    }

    if (c.expect.booking_kind === 'monthly') {
      for (const col of ['monthly_amount_cents', 'square_customer_id', 'square_card_id']) {
        if (row[col] == null) failures.push(`${c.label}: ${col} is missing on a monthly row`);
      }
      if (row.recurring_acknowledged !== true) {
        failures.push(`${c.label}: recurring_acknowledged is not true on a monthly row`);
      }
    }

    console.log(
      `  ok  ${c.label.padEnd(32)} kind=${row.booking_kind.padEnd(7)} ` +
        `event_slug=${String(row.event_slug).padEnd(22)} booking_date=${String(row.booking_date)}`
    );
  }

  /* An event date must not be bookable as a single day. Same rule the picker
     draws from, asserted on the server so the two cannot drift. */
  inserted.length = 0;
  const clash = await route.POST(
    buildRequest({ ...BASE, booking_kind: 'day', booking_date: EVENT_DATE, spot_type: 'booth', serves_food: 'false' })
  );
  if (clash.status === 200 && clash.__json && clash.__json.ok) {
    failures.push(
      `Single day on ${EVENT_DATE}, an event date, was accepted. That is a booking at day pricing that does not count against the event's capacity.`
    );
  } else {
    console.log(`  ok  ${'Single day on an event date'.padEnd(32)} refused: ${clash.__json && clash.__json.error}`);
  }

  /* ------------------------------------------------ the card can still load */

  /* A monthly application is refused without a card token, which is correct and
     is exactly what made the CSP failure so quiet: the card field never
     rendered, so no token was ever produced, so the form said "Enter a card"
     and looked like the vendor's fault. Asserted here so the refusal stays
     deliberate rather than becoming the only symptom again. */
  inserted.length = 0;
  const noCard = await route.POST(
    buildRequest({
      ...BASE,
      booking_kind: 'monthly',
      spot_type: 'booth',
      serves_food: 'false',
      recurring_acknowledged: 'true',
      // no card_source_id
    })
  );
  if (noCard.status === 200 && noCard.__json && noCard.__json.ok) {
    failures.push('A monthly application with no card token was accepted. The card is what the subscription bills.');
  } else {
    console.log(`  ok  ${'Monthly with no card token'.padEnd(32)} refused: ${noCard.__json && noCard.__json.error}`);
  }

  /* The Content Security Policy still lets Square's card SDK load.
     
     This is the other half of the same bug and the half nothing could see. The
     SDK is a script from Square's CDN, a cross origin iframe from that same
     CDN, and a tokenise call to Square's PCI host: three separate directives,
     and missing any one of them means no card field, no token, and a monthly
     signup that cannot be completed by anybody. It typechecks, it builds, it
     renders, and it is dead. Checked for both Square environments, because the
     hosts differ and a build pointed at the wrong pair fails the same way. */
  for (const production of [false, true]) {
    const before = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT;
    process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT = production ? 'production' : 'sandbox';
    delete require.cache[require.resolve(path.join(ROOT, 'next.config.js'))];
    const config = require(path.join(ROOT, 'next.config.js'));
    process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT = before;

    const headers = await config.headers();
    const csp = headers
      .flatMap((h) => h.headers)
      .find((h) => h.key === 'Content-Security-Policy');

    if (!csp) {
      failures.push('No Content-Security-Policy header is configured at all.');
      break;
    }

    const directive = (name) => {
      const found = csp.value.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' '));
      return found || '';
    };

    const sdk = production ? 'https://web.squarecdn.com' : 'https://sandbox.web.squarecdn.com';
    const api = production ? 'https://pci-connect.squareup.com' : 'https://pci-connect.squareupsandbox.com';
    const label = production ? 'production' : 'sandbox';

    let missing = 0;
    for (const [name, origin, why] of [
      ['script-src', sdk, 'the SDK bundle cannot load, so window.Square is never defined'],
      ['frame-src', sdk, 'the card input iframe is blocked, so there is nowhere to type a card'],
      ['connect-src', api, 'the SDK cannot reach Square to tokenise, so there is never a token'],
    ]) {
      if (!directive(name).includes(origin)) {
        missing += 1;
        failures.push(
          `CSP ${name} (${label}) does not allow ${origin}: ${why}. Monthly signup would be impossible and nothing else would notice.`
        );
      }
    }
    if (!missing) console.log(`  ok  ${('CSP allows Square, ' + label).padEnd(32)} ${sdk} + ${api}`);
  }

  fs.rmSync(outDir, { recursive: true, force: true });

  if (failures.length) {
    console.error('check-booking-shape: FAILED');
    for (const f of failures) console.error('  ' + f);
    process.exit(1);
  }

  console.log(
    `check-booking-shape: ${CASES.length} booking combinations insert the right shape, an event date is refused as a single day, ` +
      'a monthly without a card is refused, and the CSP still lets Square load in both environments.'
  );
})().catch((err) => {
  console.error('check-booking-shape: threw');
  console.error(err);
  process.exit(1);
});
