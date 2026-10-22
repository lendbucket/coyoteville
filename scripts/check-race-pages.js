#!/usr/bin/env node
'use strict';

/**
 * Are the two race pages finished?
 *
 * Renders /turkey-trot and /turkey-trot/sponsors at 390 and 1440 against a
 * fixture database and reports, per check, rather than asserting one pass or
 * fail. This is the pass that says the pages are done, so the output is a list
 * somebody reads, not a green tick.
 *
 * Chrome, so it does not run in the Vercel build. Same rule as
 * check-admin-parity: `npm run check:race-pages` on a machine with a browser,
 * and the GitHub health check workflow.
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 3217;
const BASE = `http://127.0.0.1:${PORT}`;
const DB_PORT = 54331;

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === 'win32') {
    return 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  }
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  return '/usr/bin/google-chrome';
}

/* ------------------------------------------------------------ the fixture */

/**
 * The live rows, as of 2026-10-22, with is_published forced true.
 *
 * Forced true on purpose: the question this answers is whether the pages are
 * finished, which means rendering them the way the public will see them. The
 * real row is still false and only Robert flips it.
 */
const RACE = {
  slug: 'turkey-trot-2026',
  name: 'Coyoteville 1st Annual Turkey Trot',
  starts_at: '2026-11-14T14:00:00Z',
  display_date: 'Saturday, November 14, 2026',
  display_time: '8:00 AM',
  distance_label: 'approximately 3.1 miles',
  course_certified: false,
  chip_timed: false,
  location_name: 'Coyoteville',
  location_address: '1704 E Main St, Alice, TX 78332',
  registration_opens_at: '2026-01-01T06:00:00Z',
  registration_closes_at: '2026-11-14T13:00:00Z',
  shirt_deadline_at: '2026-11-03T05:59:59Z',
  packet_pickup:
    'Friday from 4 to 7 PM, and race morning from 6:00 AM. All runners checked in by 7:00 AM.',
  runner_capacity: 400,
  is_published: true,
  waiver_version: 'race-v0.1-DRAFT-2026',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

/** Both food truck nights, published, which is now true in production. */
const EVENTS = [
  {
    slug: 'turkey-trot-packet-pickup-2026-11-13',
    name: 'Turkey Trot packet pickup',
    starts_at: '2026-11-13T23:30:00Z',
    ends_at: '2026-11-14T02:00:00Z',
    display_date: 'Friday, November 13',
    display_time: '5:30 PM',
    blurb: 'Packet pickup with trucks and vendors.',
    is_published: true,
    signup_closes_at: '2026-11-11T05:59:59Z',
  },
  {
    slug: 'turkey-trot-race-morning-2026-11-14',
    name: 'Turkey Trot race morning',
    starts_at: '2026-11-14T12:00:00Z',
    ends_at: '2026-11-14T17:00:00Z',
    display_date: 'Saturday, November 14',
    display_time: '6:00 AM',
    blurb: 'Breakfast before the start.',
    is_published: true,
    signup_closes_at: '2026-11-12T05:59:59Z',
  },
];

/** One published sponsor, so the sponsor block has something real in it. */
const SPONSORS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    race_slug: RACE.slug,
    level: 'finish',
    business_name: 'Example Feed and Supply',
    contact_name: 'Sam Example',
    email: 'sam@example.com',
    phone: '361-555-0123',
    website: 'https://example.com',
    logo_path: null,
    amount_cents: 50000,
    payment_status: 'paid',
    square_order_id: null,
    square_payment_id: 'fixture-pay-1',
    paid_at: '2026-10-20T15:00:00Z',
    placement_notes: null,
    published_at: '2026-10-21T15:00:00Z',
    agreement_version: 'sponsor-v0.1-DRAFT-2026',
    agreement_accepted: true,
    signature_name: 'Sam Example',
    signed_at: '2026-10-20T14:55:00Z',
    signer_ip: '127.0.0.1',
    signer_user_agent: 'fixture',
    created_at: '2026-10-20T14:55:00Z',
    updated_at: '2026-10-20T15:00:00Z',
  },
];

/** A PostgREST stand-in that honours the filters these pages actually send. */
function startDb() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const single = (req.headers.accept || '').includes('pgrst.object');

    const send = (body) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Range': '0-0/*' });
      res.end(JSON.stringify(body));
    };

    if (url.pathname.endsWith('/races')) {
      return send(single ? RACE : [RACE]);
    }

    if (url.pathname.endsWith('/events')) {
      /* The page asks for is_published=eq.true, and both rows are. */
      return send(EVENTS);
    }

    if (url.pathname.endsWith('/race_sponsors')) {
      const published = url.searchParams.get('published_at');
      const rows = published === 'not.is.null' ? SPONSORS.filter((s) => s.published_at) : SPONSORS;
      return send(single ? (rows[0] ?? null) : rows);
    }

    /* Registrations, groups, parking, everything else: empty. */
    return send(single ? null : []);
  });

  return new Promise((resolve) => {
    server.listen(DB_PORT, () => resolve(server));
  });
}

async function waitFor(url, tries = 90) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/* ------------------------------------------------------------- the checks */

/**
 * Does the page CLAIM this, as opposed to denying it?
 *
 * Run in the browser over the rendered text. A phrase inside a sentence that
 * negates it is a disclaimer, which is the opposite of the thing being looked
 * for: "the course is not USATF certified" is the sentence that makes this
 * page honest, and an earlier version of this check failed the page for it.
 */
const CLAIM_FN = `(phrase) => {
  const text = document.body.innerText.replace(/\s+/g, " ");
  const sentences = text.split(/(?<=[.!?])\s+/);
  const hits = sentences.filter((s) => new RegExp(phrase, "i").test(s));
  if (!hits.length) return { claimed: false, sentences: [] };
  const negated = (s) => /\b(no|not|never|without|cannot|neither|nor)\b/i.test(s);
  const asserting = hits.filter((s) => !negated(s));
  return { claimed: asserting.length > 0, sentences: asserting.map((s) => s.slice(0, 90)) };
}`;


const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });

/* Prices that must come from a constant, read out of the real modules. */
function constantPrices() {
  const ts = require('typescript');
  const Module = require('node:module');

  const original = Module._load;
  Module._load = (request, parent, isMain) => {
    if (request === 'server-only') return {};
    return original(request, parent, isMain);
  };

  /* Resolves @/ and relative imports as TypeScript too, because lib/seo
     imports './time' and lib/race imports its own neighbours. Cached, so a
     diamond in the graph is loaded once. */
  const cache = new Map();

  const load = (relative) => {
    const abs = path.join(ROOT, relative);
    if (cache.has(abs)) return cache.get(abs);

    const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;

    const m = { exports: {} };
    cache.set(abs, m.exports);

    const here = path.dirname(abs);

    const resolve = (request) => {
      if (request === 'server-only') return null;

      let base = null;
      if (request.startsWith('@/')) base = path.join(ROOT, request.slice(2));
      else if (request.startsWith('.')) base = path.resolve(here, request);
      else return undefined;

      for (const ext of ['.ts', '.tsx', '']) {
        if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) {
          return path.relative(ROOT, base + ext).split(path.sep).join('/');
        }
      }
      return undefined;
    };

    const localRequire = (request) => {
      const target = resolve(request);
      if (target === null) return {};
      if (target === undefined) return require(request);
      return load(target);
    };

    new Function('exports', 'require', 'module', js)(m.exports, localRequire, m);
    cache.set(abs, m.exports);
    return m.exports;
  };
  const race = load('lib/race.ts');
  const sponsorship = load('lib/race-sponsorship.ts');
  const seo = load('lib/seo.ts');

  Module._load = original;

  const money = (cents) => race.dollars(cents);

  return {
    /* Entry tiers, every one of them, at whatever the clock says today plus the
       two the clock will reach later. */
    entry: Object.values(race.RACE_PRICING).map(money),
    addons: Object.values(race.RACE_ADDONS).map(money),
    levels: sponsorship.SPONSOR_LEVELS.map((l) => money(l.cents)),
    truck: seo.PRICING.truck.price,
    booth: seo.PRICING.booth.price,
    all: new Set(),
  };
}

async function main() {
  const db = await startDb();

  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${DB_PORT}`,
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-key',
    NEXT_PUBLIC_SITE_URL: BASE,
    ADMIN_PASSWORD: 'race-pages-fixture',
  };

  /* Build against the fixture, not just serve against it.

     With no database configured at build time these routes are prerendered
     with race null, and next start then serves that HTML and never calls the
     fixture at all: every check would pass or fail against the reduced page
     rather than the real one. Found that out by watching the fixture log stay
     empty while the page still rendered. */
  console.log('check-race-pages: building against the fixture, this takes a minute.');

  await new Promise((resolve, reject) => {
    const build = spawn(
      process.execPath,
      [path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'],
      { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let out = '';
    build.stdout.on('data', (c) => { out += c; });
    build.stderr.on('data', (c) => { out += c; });
    build.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error('the fixture build failed\n' + out.slice(-2500)))
    );
  });

  const server = spawn(
    process.execPath,
    [path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(PORT)],
    {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let log = '';
  server.stdout.on('data', (c) => {
    log += c;
  });
  server.stderr.on('data', (c) => {
    log += c;
  });

  let browser = null;

  try {
    if (!(await waitFor(BASE + '/turkey-trot'))) {
      console.error('check-race-pages: the server never came up.\n' + log.slice(-2000));
      process.exit(1);
    }

    browser = await puppeteer.launch({
      executablePath: chromePath(),
      headless: 'new',
      args: ['--no-sandbox'],
    });

    const prices = constantPrices();

    for (const route of ['/turkey-trot', '/turkey-trot/sponsors']) {
      for (const width of [390, 1440]) {
        const page = await browser.newPage();
        await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
        await page.setCacheEnabled(false);

        const consoleErrors = [];
        page.on('pageerror', (e) => consoleErrors.push(String(e.message).slice(0, 120)));

        const res = await page.goto(BASE + route, { waitUntil: 'networkidle0' });
        await page.evaluate(() => document.fonts.ready);

        const label = `${route} @ ${width}`;

        record(`${label}: renders 200`, res.status() === 200, `status ${res.status()}`);

        /* ---- no horizontal overflow, nothing past the right edge ---- */
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          const past = [];
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            /* A couple of pixels of slack for subpixel rounding and for the
               one table that is deliberately allowed to scroll inside itself. */
            if (r.right > window.innerWidth + 2) {
              const inScroller = el.closest('[style*="overflow"], .race-tr__tablewrap');
              if (!inScroller) {
                past.push(
                  (el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0]).slice(0, 44) +
                    ' right=' + Math.round(r.right)
                );
              }
            }
          }
          return {
            scrolls: doc.scrollWidth > window.innerWidth,
            scrollWidth: doc.scrollWidth,
            inner: window.innerWidth,
            past: past.slice(0, 6),
          };
        });

        record(
          `${label}: no horizontal page scroll`,
          !overflow.scrolls,
          `scrollWidth ${overflow.scrollWidth} vs ${overflow.inner}`
        );
        record(
          `${label}: nothing past the right edge`,
          overflow.past.length === 0,
          overflow.past.length ? overflow.past.join('; ') : 'none'
        );

        record(`${label}: no page errors`, consoleErrors.length === 0, consoleErrors.join('; ') || 'none');

        /* ---- every price on the page is one of the constants ---- */
        const money = await page.evaluate(() =>
          /* Proper thousands grouping. [\d,]+ swallowed the comma out of
             "$25, $5" and reported "$25," as a price matching no constant. */
          [...(document.body.innerText.match(/\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g) ?? [])]
        );
        const allowed = new Set([
          ...prices.entry,
          ...prices.addons,
          ...prices.levels,
          prices.truck,
          prices.booth,
        ]);
        const strays = [...new Set(money)].filter((m) => !allowed.has(m));

        record(
          `${label}: every price comes from a constant`,
          strays.length === 0,
          strays.length ? 'not from a constant: ' + strays.join(', ') : `${new Set(money).size} distinct, all matched`
        );

        /* ---- internal links resolve ---- */
        const links = await page.evaluate(() =>
          [...new Set(
            [...document.querySelectorAll('a[href]')]
              .map((a) => a.getAttribute('href'))
              .filter((h) => h && !h.startsWith('http') && !h.startsWith('mailto:') && !h.startsWith('tel:'))
          )]
        );

        const broken = [];
        for (const href of links) {
          /* A fragment on this page, or a path with one. */
          const [pathPart, hash] = href.split('#');
          if (!pathPart) {
            const found = await page.evaluate((id) => !!document.getElementById(id), hash);
            if (!found) broken.push(`${href} (no element with that id)`);
            continue;
          }
          const target = pathPart.split('?')[0];
          const r = await fetch(BASE + target, { redirect: 'follow' });
          if (r.status >= 400) broken.push(`${href} -> ${r.status}`);
        }

        /* A query after a fragment is a link that resolves and does nothing.

           /#apply?event=slug returns 200, because everything after the # is
           never sent to the server, and the form never sees the event. The
           link check above passed it happily. This is the check that would
           have caught it, and it did not exist until it had already shipped. */
        const misordered = links.filter((h) => {
          const hash = h.indexOf('#');
          const query = h.indexOf('?');
          return hash !== -1 && query !== -1 && query > hash;
        });

        record(
          `${label}: no link puts a query after its fragment`,
          misordered.length === 0,
          misordered.length ? misordered.join('; ') : 'none'
        );

        /* Both food truck nights, now that both event rows are published.
           Each needs its own signup link carrying its own slug. */
        if (route === '/turkey-trot') {
          for (const slug of [
            'turkey-trot-packet-pickup-2026-11-13',
            'turkey-trot-race-morning-2026-11-14',
          ]) {
            const link = links.find((h) => h.includes(slug));
            let status = null;
            if (link) {
              const target = link.split('#')[0];
              status = (await fetch(BASE + target, { redirect: 'follow' })).status;
            }
            record(
              `${label}: the ${slug} signup is linked and resolves`,
              Boolean(link) && status === 200,
              link ? `${link} -> ${status}` : 'no link on the page carries this slug'
            );
          }
        }

        record(
          `${label}: every internal link resolves`,
          broken.length === 0,
          broken.length ? broken.join('; ') : `${links.length} links, all resolve`
        );

        /* ---- the forms are present and submittable ---- */
        const form = await page.evaluate(() => {
          const f = document.querySelector('form');
          if (!f) return { present: false };
          const submit = f.querySelector('button[type="submit"], button:not([type])');
          return {
            present: true,
            submit: !!submit,
            submitDisabled: submit ? submit.disabled : null,
            fields: f.querySelectorAll('input, select, textarea').length,
          };
        });
        record(
          `${label}: a form is present with a working submit`,
          form.present && form.submit && form.submitDisabled === false,
          JSON.stringify(form)
        );

        /* ---- page specific ---- */
        if (route === '/turkey-trot') {
          const bits = await page.evaluate(() => {
            /**
             * Does the page CLAIM this, as opposed to denying it?
             *
             * The first version of these checks searched the text for a phrase
             * and failed the page for its own disclaimers. "The course is not
             * USATF certified" contains "USATF certified"; "there are no
             * official results, no splits" contains "official results". Those
             * are the sentences that make the page honest. Reading for a
             * phrase is not reading for a claim.
             *
             * So the text is split into sentences, and the phrase only counts
             * as claimed if a sentence containing it is not negating it.
             */
            const claim = (phrase) => {
              const text = document.body.innerText.replace(/\s+/g, ' ');
              const sentences = text.split(/(?<=[.!?])\s+/);
              const re = new RegExp(phrase, 'i');
              const hits = sentences.filter((s) => re.test(s));
              const negated = (s) => /\b(no|not|never|without|cannot|neither|nor)\b/i.test(s);
              const asserting = hits.filter((s) => !negated(s));
              return { claimed: asserting.length > 0, where: asserting.map((s) => s.slice(0, 90)) };
            };

            const map = document.querySelector('.race__coursemap svg');
            const soon = document.querySelector('.race__coursemap--soon');
            const video = document.querySelector('video');
            /* Scoped to the player's own class. An earlier [class*="race__ad"]
               also matched race__addons, which is the add-on pricing line. */
            const frame = document.querySelector('.racead');

            let smallestLabel = null;
            if (map) {
              const vb = map.viewBox.baseVal;
              const scale = map.getBoundingClientRect().width / vb.width;
              const texts = [...map.querySelectorAll('text')];
              if (texts.length) {
                const smallestUnits = Math.min(
                  ...texts.map((t) => parseFloat(getComputedStyle(t).fontSize))
                );
                smallestLabel = Math.round(smallestUnits * scale * 10) / 10;
              }
            }

            const text = document.body.innerText;

            return {
              mapInlined: !!map,
              placeholderShown: !!soon,
              smallestLabelPx: smallestLabel,
              videoPresent: !!video,
              adFramePresent: !!frame,
              claimsCertified: claim('USATF certified|certified 5K|certified course'),
              claimsTimes: claim('official results|splits|finish time'),
              saysApproximately: /approximately 3\.1 miles/i.test(text),
              saysNotCertified: /not\s+USATF\s+certified/i.test(text),
              saysNoResults: /no official results/i.test(text),
            };
          });

          /* Exactly one of the two: the map, or the placeholder. Never both and
             never neither. */
          record(
            `${label}: course map inlined, or the placeholder cleanly`,
            bits.mapInlined !== bits.placeholderShown,
            bits.mapInlined
              ? `inlined, smallest label ${bits.smallestLabelPx ?? 'no text'}px`
              : 'SVG not in the repo, placeholder shown'
          );

          if (bits.mapInlined && bits.smallestLabelPx !== null) {
            record(
              `${label}: course map labels readable`,
              bits.smallestLabelPx >= 12,
              `smallest label ${bits.smallestLabelPx}px`
            );
          }

          /* Either the player is there with a video in it, or neither is: a
             frame with no video is the broken player this must never show. */
          record(
            `${label}: ad block renders or is absent cleanly`,
            bits.videoPresent === bits.adFramePresent,
            bits.adFramePresent
              ? 'player and video both present'
              : 'assets absent, no frame and no broken player'
          );

          record(
            `${label}: never claims a certified course, and says so`,
            !bits.claimsCertified.claimed && bits.saysApproximately && bits.saysNotCertified,
            bits.claimsCertified.claimed
              ? 'claimed in: ' + bits.claimsCertified.where.join(' | ')
              : `says not USATF certified: ${bits.saysNotCertified}, says approximately 3.1 miles: ${bits.saysApproximately}`
          );

          record(
            `${label}: promises no times while chip_timed is false`,
            !bits.claimsTimes.claimed && bits.saysNoResults,
            bits.claimsTimes.claimed
              ? 'promised in: ' + bits.claimsTimes.where.join(' | ')
              : 'says no official results, and promises none'
          );
        }

        await page.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
    db.close();
  }

  /* -------------------------------------------------------------- report */

  const failed = results.filter((r) => !r.ok);

  console.log('\ncheck-race-pages\n');
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}\n          ${r.detail}`);
  }
  console.log(`\n  ${results.length - failed.length} of ${results.length} passed.\n`);

  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('check-race-pages threw', err);
  process.exit(1);
});
