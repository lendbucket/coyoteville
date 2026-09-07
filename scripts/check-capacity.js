#!/usr/bin/env node
'use strict';

/**
 * One capacity rule, and everything that counts spots reads it.
 *
 * The bug this exists to stop happening again: the rule was written out three
 * times, in lib/spots, lib/days and lib/revenue, and the three disagreed. The
 * event meter released only rows marked 'denied', a value the check constraint
 * did not permit, so it released nothing at all. The day calendar counted only
 * settled rows, so a date read as open while somebody was part way through
 * paying for it. Five abandoned checkouts held five spots for days and the
 * homepage advertised two booths left on a night when five were free, four days
 * before the event.
 *
 * Three things are checked, and each one has caught something:
 *
 *   1. Every surface that shows or enforces capacity can reach lib/holds-spot
 *      through its imports. Not "mentions it": the real import graph is walked
 *      from each entry point, so a file that stops using the helper fails here
 *      whichever way it stopped.
 *
 *   2. No second copy of the settled payment rule exists. The pair
 *      'paid'/'not_required' appearing anywhere but lib/holds-spot is how the
 *      first three copies started.
 *
 *   3. The rule itself does what it says, driven directly, including the five
 *      abandoned checkouts as they actually looked. A helper everybody imports
 *      is worth nothing if it is wrong.
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const HELPER = path.join(root, 'lib', 'holds-spot.ts');

/**
 * Where capacity is shown or enforced, and what each one is to a person.
 *
 * Named rather than discovered. A gate that infers its own entry points cannot
 * fail when somebody adds a sixth surface and forgets the rule, which is
 * exactly the failure worth catching.
 */
const SURFACES = [
  ['components/Pricing.tsx', 'the pricing cards'],
  ['components/EventsSection.tsx', 'the events section'],
  ['lib/event-schedule.ts', 'the homepage next event and the lifecycle FULL state'],
  ['lib/days.ts', 'the day calendar'],
  ['lib/admin-data.ts', 'the tracker'],
  ['app/api/vendor-application/route.ts', 'the signup gate'],
  ['app/api/waitlist/route.ts', 'the waitlist gate'],
];

/**
 * The files that actually count rows, which must import the helper themselves.
 *
 * Reachability alone is too weak here and this gate proved it: taking the
 * import out of lib/spots did not fail, because lib/spots imports lib/days for
 * the monthly holders and lib/days imports the helper, so the graph still
 * joined up while the event meter had quietly stopped using the rule. These
 * four are the places a copy of it has actually appeared, so they are named and
 * the import has to be theirs.
 */
const COUNTERS = [
  ['lib/spots.ts', 'the event meter'],
  ['lib/days.ts', 'the day calendar'],
  ['lib/revenue.ts', 'the money summary'],
  ['lib/admin-data.ts', 'the tracker counts'],
];

const EXTS = ['.ts', '.tsx', '.js', '.jsx'];

function resolveImport(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = path.join(root, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // a package, not ours

  for (const ext of EXTS) {
    const file = base + ext;
    if (fs.existsSync(file)) return file;
  }
  for (const ext of EXTS) {
    const file = path.join(base, 'index' + ext);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

const IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;
const DYNAMIC = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

function importsOf(file) {
  const source = fs.readFileSync(file, 'utf8');
  const out = [];
  for (const re of [IMPORT, DYNAMIC]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(source))) {
      const resolved = resolveImport(m[1], file);
      if (resolved) out.push(resolved);
    }
  }
  return out;
}

/** Shortest import path from a surface to the helper, or null. */
function pathToHelper(entry) {
  const start = path.join(root, entry);
  if (!fs.existsSync(start)) return { missing: true };

  const queue = [[start]];
  const seen = new Set([start]);

  while (queue.length) {
    const trail = queue.shift();
    const file = trail[trail.length - 1];
    if (file === HELPER) return { trail };

    for (const next of importsOf(file)) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push([...trail, next]);
    }
  }
  return { trail: null };
}

/* ------------------------------------------------ 2. no second copy of it */

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXTS.includes(path.extname(entry.name))) out.push(full);
  }
  return out;
}

/** Strip comments so prose about the rule does not read as a copy of it. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const PAIR = /(['"])(?:paid\1\s*,\s*\1not_required|not_required\1\s*,\s*\1paid)\1/;

function findCopies() {
  const problems = [];
  for (const dir of ['app', 'lib', 'components']) {
    for (const file of walk(path.join(root, dir))) {
      if (file === HELPER) continue;
      const source = stripComments(fs.readFileSync(file, 'utf8'));
      if (!PAIR.test(source)) continue;
      problems.push(path.relative(root, file).split(path.sep).join('/'));
    }
  }
  return problems;
}

/* ---------------------------------------------- 3. drive the rule for real */

const cache = new Map();

function loadModule(file) {
  if (cache.has(file)) return cache.get(file);

  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;

  const module = { exports: {} };
  cache.set(file, module.exports);

  const shim = (spec) => {
    const resolved = resolveImport(spec, file);
    if (!resolved) return {}; // 'server-only' and friends
    return loadModule(resolved);
  };

  // eslint-disable-next-line no-new-func
  new Function('exports', 'require', 'module', '__filename', '__dirname', js)(
    module.exports,
    shim,
    module,
    file,
    path.dirname(file)
  );

  cache.set(file, module.exports);
  return module.exports;
}

const NOW = Date.parse('2026-09-07T18:00:00Z');
const ago = (minutes) => new Date(NOW - minutes * 60000).toISOString();

const HOLDS_CASES = [
  [
    'a paid booth waiting on review',
    { payment_status: 'paid', approval_status: 'pending', created_at: ago(9000) },
    true,
  ],
  [
    'a free organisation spot',
    { payment_status: 'not_required', approval_status: 'pending', created_at: ago(9000) },
    true,
  ],
  [
    'a checkout five minutes old',
    { payment_status: 'unpaid', approval_status: 'pending', created_at: ago(5) },
    true,
  ],
  [
    'a checkout twenty nine minutes old',
    { payment_status: 'unpaid', approval_status: 'pending', created_at: ago(29) },
    true,
  ],
  [
    'a checkout forty five minutes old',
    { payment_status: 'unpaid', approval_status: 'pending', created_at: ago(45) },
    false,
  ],
  [
    'one of the five abandoned September checkouts',
    { payment_status: 'unpaid', approval_status: 'pending', created_at: ago(60 * 72) },
    false,
  ],
  [
    'a paid row somebody denied',
    { payment_status: 'paid', approval_status: 'denied', created_at: ago(9000) },
    false,
  ],
  [
    'a paid row that aged out to cancelled',
    { payment_status: 'paid', approval_status: 'cancelled', created_at: ago(9000) },
    false,
  ],
  [
    'a refunded row',
    { payment_status: 'refunded', approval_status: 'approved', created_at: ago(5) },
    false,
  ],
  [
    'an expired row inside the window',
    { payment_status: 'expired', approval_status: 'pending', created_at: ago(5) },
    false,
  ],
  [
    'a row with no created_at at all',
    { payment_status: 'unpaid', approval_status: 'pending', created_at: null },
    false,
  ],
];

const ABANDONED_CASES = [
  [
    'an order from three days ago that was never paid',
    {
      payment_status: 'unpaid',
      approval_status: 'pending',
      created_at: ago(60 * 72),
      square_order_id: 'ord_1',
      square_payment_id: null,
    },
    true,
  ],
  [
    'the same checkout an hour in',
    {
      payment_status: 'unpaid',
      approval_status: 'pending',
      created_at: ago(60),
      square_order_id: 'ord_1',
      square_payment_id: null,
    },
    false,
  ],
  [
    'a vendor who came back and paid',
    {
      payment_status: 'paid',
      approval_status: 'pending',
      created_at: ago(60 * 72),
      square_order_id: 'ord_1',
      square_payment_id: 'pay_1',
    },
    false,
  ],
  [
    'an old unpaid row that never reached Square',
    {
      payment_status: 'unpaid',
      approval_status: 'pending',
      created_at: ago(60 * 72),
      square_order_id: null,
      square_payment_id: null,
    },
    false,
  ],
  [
    'an approved vendor who owes for her spot',
    {
      payment_status: 'unpaid',
      approval_status: 'approved',
      created_at: ago(60 * 72),
      square_order_id: 'ord_2',
      square_payment_id: null,
    },
    false,
  ],
];

function driveTheRule() {
  const { holdsSpot, isAbandonedCheckout } = loadModule(HELPER);
  const problems = [];

  for (const [label, row, expected] of HOLDS_CASES) {
    const got = holdsSpot(row, NOW);
    if (got !== expected) {
      problems.push(`holdsSpot: ${label} should be ${expected ? 'held' : 'free'}, got ${got}`);
    }
  }

  for (const [label, row, expected] of ABANDONED_CASES) {
    const got = isAbandonedCheckout(row, NOW);
    if (got !== expected) {
      problems.push(
        `isAbandonedCheckout: ${label} should be ${expected ? 'abandoned' : 'left alone'}, got ${got}`
      );
    }
  }

  return problems;
}

/* ------------------------------------------------------------------- run */

function main() {
  const problems = [];
  const reached = [];

  for (const [entry, what] of SURFACES) {
    const result = pathToHelper(entry);
    if (result.missing) {
      problems.push(`${entry} does not exist, so ${what} cannot be checked.`);
      continue;
    }
    if (!result.trail) {
      problems.push(
        `${entry} (${what}) cannot reach lib/holds-spot through its imports, so it is counting spots by some other rule.`
      );
      continue;
    }
    reached.push([entry, what, result.trail.length - 1]);
  }

  for (const [entry, what] of COUNTERS) {
    const file = path.join(root, entry);
    if (!fs.existsSync(file)) {
      problems.push(`${entry} does not exist, so ${what} cannot be checked.`);
      continue;
    }
    if (!importsOf(file).includes(HELPER)) {
      problems.push(
        `${entry} (${what}) does not import lib/holds-spot itself, so it is deciding what holds a spot on its own.`
      );
    }
  }

  for (const file of findCopies()) {
    problems.push(
      `${file} writes out the settled payment pair itself. Import isSettled from lib/holds-spot instead.`
    );
  }

  problems.push(...driveTheRule());

  if (problems.length) {
    console.error(`\ncheck-capacity: ${problems.length} problem(s).\n`);
    for (const p of problems) console.error(`  ${p}`);
    console.error(
      [
        '',
        'One rule decides whether an application is standing on a spot, and it',
        'lives in lib/holds-spot. It was in three places once and they',
        'disagreed: the homepage advertised two booths left on a night when',
        'five were free, four days before the event.',
        '',
      ].join('\n')
    );
    process.exit(1);
  }

  const hops = reached.map(([entry, , n]) => `${entry.split('/').pop()} ${n}`).join(', ');
  console.log(
    `check-capacity: ${COUNTERS.length} counting files import lib/holds-spot directly, ` +
      `${reached.length} capacity surfaces all reach it, ` +
      `no second copy of the settled rule, and ` +
      `${HOLDS_CASES.length + ABANDONED_CASES.length} cases of the rule itself hold. ` +
      `Import hops: ${hops}.`
  );
}

main();
