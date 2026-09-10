#!/usr/bin/env node
'use strict';

/**
 * Can one recipient of a mass email see another recipient's address?
 *
 * The answer has to be no, and "no" has to be checkable rather than asserted.
 * A vendor list is thirty small businesses who gave us an address to be told
 * about a spot, not to be introduced to each other, and the mistake that
 * exposes them is a one line change: a `to` that takes an array instead of a
 * string, or a well meant `cc`.
 *
 * Two checks, in order of strength:
 *
 *   1. The real compose route is compiled and driven with two recipients in
 *      dry run mode, and every payload it reports is inspected. Each must carry
 *      exactly one address, and no payload may contain the other recipient's
 *      address anywhere in it, including in the rendered HTML.
 *
 *   2. Every sender in lib/notify is read for a cc or bcc field, and for a `to`
 *      built from an array. Neither exists today and neither should appear
 *      without somebody deciding it deliberately.
 *
 * The route is compiled with the TypeScript compiler API and loaded with a
 * require hook that swaps its dependencies for fakes, so the code under test is
 * the actual source of app/api/admin/compose/route.ts.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const outDirForDeps = fs.mkdtempSync(path.join(os.tmpdir(), 'coyoteville-privacy-'));

const ALICE = { id: '11111111-2222-4333-8444-555555555555', email: 'alice@example.test' };
const BOB = { id: '66666666-7777-4888-8999-aaaaaaaaaaaa', email: 'bob@example.test' };

const ROWS = [
  {
    id: ALICE.id,
    business_name: 'Cold Sips',
    contact_name: 'Ada Reyes',
    email: ALICE.email,
    spot_type: 'booth',
    spot_number: 'Booth 3',
    event_slug: 'home-game-2026-09-11',
    admin_notes: null,
  },
  {
    id: BOB.id,
    business_name: 'MuddyWaterz',
    contact_name: 'Bo Vela',
    email: BOB.email,
    spot_type: 'truck',
    spot_number: 'Truck 2',
    event_slug: 'home-game-2026-09-11',
    admin_notes: null,
  },
];

/* ------------------------------------------------------------- the fakes */

const sends = [];

function supabaseFake() {
  return {
    from() {
      const chain = {
        select: () => chain,
        update: () => chain,
        eq: () => chain,
        in: async () => ({ data: ROWS, error: null }),
        async maybeSingle() {
          return { data: null, error: null };
        },
        then(resolve) {
          resolve({ data: null, error: null });
        },
      };
      return chain;
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
  '@/lib/admin-auth': { isAdminRequest: async () => true },
  '@/lib/rate-limit': {
    rateLimit: () => ({ ok: true, retryAfterSeconds: 0 }),
    getClientIp: () => '203.0.113.1',
  },
  '@/lib/supabase': { isSupabaseConfigured: () => true, getSupabaseAdmin: supabaseFake },
  '@/lib/events-source': {
    getEventBySlug: async () => ({ slug: 'home-game-2026-09-11', displayDate: 'September 11' }),
    getNextEvent: async () => ({ slug: 'home-game-2026-09-11', displayDate: 'September 11' }),
  },
  /* Records what would have been sent, so a run with dry_run off can be
     inspected the same way. */
  '@/lib/notify': {
    sendReminderEmail: async (to, message, attachments) => {
      sends.push({ to, message, attachments: (attachments || []).map((a) => a.filename) });
      return true;
    },
  },
};

/**
 * Everything not faked is compiled and run for real.
 *
 * The email renderers above all are the point: the check reads the rendered
 * HTML for an address that should not be in it, and a fake renderer would be
 * reading its own output rather than the site's. Only the edges are stubbed:
 * the database, the mailer, the clock on the calendar, and auth.
 */
const compiledCache = new Map();

function compileModule(absTs) {
  if (compiledCache.has(absTs)) return compiledCache.get(absTs);

  /* The tree is mirrored rather than flattened, so a module's own relative
     imports keep working: lib/email/compose reaches ../seo and ./shared the
     same way it does in the repo. */
  const out = path.join(outDirForDeps, path.relative(ROOT, absTs).replace(/.tsx?$/, '.js'));
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const js = ts.transpileModule(fs.readFileSync(absTs, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: path.basename(absTs),
  }).outputText;

  fs.writeFileSync(out, js);
  compiledCache.set(absTs, out);
  return out;
}

function firstExisting(base) {
  for (const ext of ['.ts', '.tsx']) {
    if (fs.existsSync(base + ext)) return base + ext;
  }
  for (const ext of ['.ts', '.tsx']) {
    const idx = path.join(base, 'index' + ext);
    if (fs.existsSync(idx)) return idx;
  }
  return null;
}

/**
 * Where a specifier points, as a real TypeScript file in the repo.
 *
 * Two shapes. An @/ alias resolves from the repo root. A relative one resolves
 * against whatever compiled module is asking, which lives in the mirror
 * directory: its path there maps one to one back onto the repo, so
 * lib/email/compose asking for ../seo lands on lib/seo.ts and gets compiled in
 * turn. Without that the mirror would only ever be one level deep.
 */
function resolveToSource(request, parent) {
  if (request.startsWith('@/')) return firstExisting(path.join(ROOT, request.slice(2)));

  if (request.startsWith('.') && parent && parent.filename) {
    const from = parent.filename;
    if (!from.startsWith(outDirForDeps)) return null;
    const repoDir = path.join(ROOT, path.dirname(path.relative(outDirForDeps, from)));
    return firstExisting(path.resolve(repoDir, request));
  }

  return null;
}

const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(FAKES, request)) return FAKES[request];

  const source = resolveToSource(request, parent);
  if (source) return originalLoad.call(this, compileModule(source), parent, isMain);

  /* A real package, asked for by a module living in the mirror directory,
     which has no node_modules of its own. Resolved from the repo instead. */
  try {
    return originalLoad.call(this, request, parent, isMain);
  } catch (err) {
    if (request.startsWith('.') || request.startsWith('/')) throw err;
    return require(path.join(ROOT, 'node_modules', request));
  }
};
Module._resolveFilename = function (request, parent, ...rest) {
  if (Object.prototype.hasOwnProperty.call(FAKES, request)) return request;
  const source = resolveToSource(request, parent);
  if (source) return compileModule(source);
  return originalResolve.call(this, request, parent, ...rest);
};

/* ---------------------------------------------------------- compile it */

const source = fs.readFileSync(path.join(ROOT, 'app/api/admin/compose/route.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
  fileName: 'route.ts',
}).outputText;

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coyoteville-compose-'));
const outFile = path.join(outDir, 'route.js');
fs.writeFileSync(outFile, compiled);

const route = require(outFile);

/* ---------------------------------------------------------------- drive */

function formFor(extra) {
  const fields = {
    subject: 'Your spot for Friday',
    preheader: 'Where you are standing',
    body: '<p>Hello, you are in {{spot}}.</p>',
    vendor_ids: [ALICE.id, BOB.id].join(','),
    manual: '',
    ...extra,
  };

  return {
    get: (k) => (k in fields ? fields[k] : null),
    getAll: () => [],
  };
}

const failures = [];
function check(label, condition, detail) {
  if (!condition) failures.push(`${label}${detail ? ': ' + detail : ''}`);
}

/**
 * Is this exactly one address?
 *
 * "typeof x === 'string'" is not the check. A joined list is a string too, and
 * that is precisely the shape the bug takes: somebody swaps a per recipient
 * loop for one call and passes "a@x.test, b@y.test", which every mailer happily
 * accepts and delivers with both names on it. Caught here by counting the at
 * signs and refusing a separator.
 */
function oneAddress(value) {
  if (typeof value !== 'string') return false;
  if (/[,;]/.test(value)) return false;
  return (value.match(/@/g) || []).length === 1;
}

/** Does this blob of text mention an address it has no business mentioning? */
function mentions(payload, address) {
  return JSON.stringify(payload).toLowerCase().includes(address.toLowerCase());
}

(async () => {
  /* ---- 1. the dry run reports one address per message ---- */

  const dry = await route.POST({ formData: async () => formFor({ dry_run: 'true' }) });
  const body = dry.__json || {};

  check('the dry run returned 200', dry.status === 200, `got ${dry.status}`);
  check('the dry run sent nothing', sends.length === 0, `${sends.length} sends`);
  check('two recipients were previewed', body.recipients === 2, String(body.recipients));

  const preview = body.preview || [];
  check('two payloads', preview.length === 2, String(preview.length));

  for (const entry of preview) {
    check(
      `${entry.name}: the payload names exactly one address`,
      oneAddress(entry.to),
      JSON.stringify(entry.to)
    );

    const other = entry.to === ALICE.email ? BOB.email : ALICE.email;
    check(
      `${entry.name}: the payload does not mention ${other}`,
      !mentions(entry, other),
      JSON.stringify(entry)
    );
  }

  /* ---- 2. a real send is one call per recipient, one address each ---- */

  const wet = await route.POST({ formData: async () => formFor({ subject: 'Your spot, really' }) });
  check('the real send returned 200', wet.status === 200, `got ${wet.status}`);
  check('one call per recipient', sends.length === 2, `${sends.length} calls`);

  for (const send of sends) {
    check(
      'the call carries exactly one address',
      oneAddress(send.to),
      JSON.stringify(send.to)
    );

    const other = send.to === ALICE.email ? BOB.email : ALICE.email;
    check(
      `no other address in the message to ${send.to}`,
      !mentions(send.message, other),
      'the rendered email mentions another recipient'
    );
  }

  /* ---- 3. no cc or bcc anywhere in the senders ---- */

  const notify = fs.readFileSync(path.join(ROOT, 'lib/notify.ts'), 'utf8');
  const stripped = notify.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  for (const field of ['cc:', 'bcc:']) {
    check(
      `lib/notify sets no ${field.replace(':', '')}`,
      !stripped.includes(field),
      'found ' + field
    );
  }
  check(
    'lib/notify never sends an array of addresses',
    !/to:\s*\[/.test(stripped),
    'a to: [ ... ] was found'
  );

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.rmSync(outDirForDeps, { recursive: true, force: true });

  if (failures.length) {
    console.error('\ncheck-recipient-privacy: FAILED\n');
    for (const f of failures) console.error('  ' + f);
    console.error(
      [
        '',
        'A mass send must reach each recipient with only their own address on it.',
        'These are small businesses who gave us an address to be told about a',
        'spot, not to be introduced to each other. One call per recipient, one',
        'address in "to", and no cc or bcc.',
        '',
      ].join('\n')
    );
    process.exit(1);
  }

  console.log(
    'check-recipient-privacy: a two recipient send makes two Resend calls, each ' +
      'carrying one address, neither message mentioning the other address, and no ' +
      'sender in lib/notify sets a cc, a bcc, or a list of addresses.'
  );
})().catch((err) => {
  console.error('check-recipient-privacy: threw');
  console.error(err);
  process.exit(1);
});
