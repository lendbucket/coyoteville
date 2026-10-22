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

/**
 * A check that could not run, because what it checks is not in the repo.
 *
 * Not a pass: nothing was verified. Not a fail: nothing is wrong. Recording
 * it as a pass is how a suite reports green on three checks that never
 * executed, which is exactly what happened here while the course map and the
 * video were missing.
 */
const skip = (name, why) => results.push({ name, skipped: true, detail: why });

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

    /* The course map render at each width, compared once both are in. */
    const mapByWidth = {};

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
              /* An element inside a clipping ancestor cannot push the page
                 sideways, whatever its own geometry says.

                 getBoundingClientRect reports where a box would be, not
                 where it is visible, so the decorative string lights SVG in
                 the hero measured 4px past the edge while being clipped by
                 the hero's own overflow: hidden, and the page scroll check,
                 which is the one that matters, passed at the same time.

                 The old test looked only for an inline overflow style, so a
                 clip set by a class was invisible to it. Computed style on
                 the ancestors is the actual question. */
              let clipped = false;
              for (let a = el.parentElement; a; a = a.parentElement) {
                const o = getComputedStyle(a);
                if (/hidden|clip|auto|scroll/.test(o.overflowX + o.overflow)) {
                  clipped = true;
                  break;
                }
              }

              if (!clipped) {
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

        record(
          `${label}: no page, console or request errors`,
          consoleErrors.length === 0,
          consoleErrors.slice(0, 3).join('; ') || 'none'
        );

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

        /* ---- the forms are present, and gate on being complete ---- */

        const form = await page.evaluate(() => {
          const f = document.querySelector('form');
          if (!f) return { present: false };
          const submit = f.querySelector('button[type="submit"]');
          return {
            present: true,
            submit: !!submit,
            disabledWhenEmpty: submit ? submit.disabled : null,
            fields: f.querySelectorAll('input, select, textarea').length,
            boxes: f.querySelectorAll('input[type="checkbox"]').length,
          };
        });

        record(
          `${label}: a form is present with a submit button`,
          form.present && form.submit,
          JSON.stringify(form)
        );

        if (route === '/turkey-trot' && form.present) {
          /* Article 14.2 makes the boxes, the typed name and the click one
             act, so the button must not be offered until all of them are
             there. Disabled, not failing on submit: a button that looks ready
             and then refuses is a trap at the last step before payment. */
          record(
            `${label}: signing is disabled until it is complete`,
            form.disabledWhenEmpty === true,
            `disabled with nothing filled: ${form.disabledWhenEmpty}`
          );

          /* Fill it in and confirm it opens up. Nothing is submitted. */
          const afterFilling = await page.evaluate(() => {
            const f = document.querySelector('form');
            const boxes = [...f.querySelectorAll('input[type="checkbox"]')];
            for (const b of boxes) {
              if (!b.checked) {
                b.click();
              }
            }
            const name = f.querySelector('input[autocomplete="name"]');
            if (name) {
              const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
              ).set;
              setter.call(name, 'Dana Ybarra');
              name.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return { nameField: !!name, boxes: boxes.length };
          });

          await new Promise((r) => setTimeout(r, 400));

          const nowEnabled = await page.evaluate(() => {
            const submit = document.querySelector('form button[type="submit"]');
            return submit ? !submit.disabled : null;
          });

          record(
            `${label}: signing enables once the boxes and the name are in`,
            nowEnabled === true,
            `after checking ${afterFilling.boxes} boxes and typing a name: enabled ${nowEnabled}`
          );
        }
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
            /* The page's own copy, excluding the waiver panel.

               The instrument quoted on this page is a legal document, and
               the Media Release grants rights to use a participant's "FINISH
               TIME, RESULTS" among other categories of likeness. That is the
               document describing what it may do with a result if there is
               one, not the page promising a timed race, and scanning it for
               marketing claims fails the page for its own waiver.

               The exclusion is one container and nothing else, and it is not
               a hole: every word in it is verified verbatim against the
               executed PDF by check-waiver-transcription, which is a stricter
               test than this one. */
            const pageText = (() => {
              const skip = [...document.querySelectorAll('.racedocs, .racereg__waivertext')];
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              const out = [];
              while (walker.nextNode()) {
                const node = walker.currentNode;
                const parent = node.parentElement;
                if (parent && skip.some((s) => s.contains(parent))) continue;
                const t = node.textContent.trim();
                if (t) out.push(t);
              }
              return out.join(' ');
            })();

            const claim = (phrase) => {
              const text = pageText.replace(/\s+/g, ' ');
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
            let streetLabel = null;
            let streetNames = [];
            if (map) {
              const vb = map.viewBox.baseVal;
              const scale = map.getBoundingClientRect().width / vb.width;
              const texts = [...map.querySelectorAll('text')];
              if (texts.length) {
                const smallestUnits = Math.min(
                  ...texts.map((t) => parseFloat(getComputedStyle(t).fontSize))
                );
                smallestLabel = Math.round(smallestUnits * scale * 10) / 10;

                /* The street names specifically, and only the ones actually
                   displayed at this width, since the artwork ships a desktop
                   and a mobile variant of each and hides one.

                   Measured apart from the smallest text anywhere, because the
                   smallest is the title subtitle and failing the map over that
                   was measuring the wrong thing. The street labels are what has
                   to survive being read on a phone. */
                const streets = [...map.querySelectorAll('text.rd')].filter(
                  (t) => getComputedStyle(t).display !== 'none'
                );
                if (streets.length) {
                  streetLabel =
                    Math.round(
                      Math.min(
                        ...streets.map((t) => parseFloat(getComputedStyle(t).fontSize))
                      ) *
                        scale *
                        10
                    ) / 10;
                  streetNames = streets.map((t) => t.textContent.trim());
                }
              }
            }

            /* The label sizes in the SVG's OWN units, not on screen pixels.

               The artwork carries two type scales switched by a media query
               below 760px. On screen pixels cannot tell a switched scale from
               a linearly scaled one, but user units can: under one scale
               these values are identical at every width, and under two they
               differ. That is the switch, measured. */
            const labelUnits = map
              ? [...new Set([...map.querySelectorAll('text')].map((t) =>
                  Math.round(parseFloat(getComputedStyle(t).fontSize) * 100) / 100
                ))].sort((a, b) => a - b)
              : [];

            /* Does the draw animation resolve, and does reduced motion turn it
               off? Both read from the file's own CSS, which only reaches the
               page because the SVG is inlined. */
            /* The drawn line. This artwork strokes a path from defs through <use>
               elements, so the animation sits on a use and not on a path. An
               earlier selector of '.route, path[class]' found nothing at all
               and the check reported no drawn path rather than a result. */
            const drawn = map ? map.querySelector('.draw') : null;
            const motion = drawn
              ? {
                  animationName: getComputedStyle(drawn).animationName,
                  dashoffset: getComputedStyle(drawn).strokeDashoffset,
                }
              : null;

            const text = pageText;

            return {
              mapInlined: !!map,
              placeholderShown: !!soon,
              smallestLabelPx: smallestLabel,
              streetLabelPx: streetLabel,
              streetNames,
              labelUnits,
              motion,
              videoPresent: !!video,
              adFramePresent: !!frame,
              claimsCertified: claim('USATF certified|certified 5K|certified course'),
              claimsTimes: claim('official results|splits|finish time'),
              saysApproximately: /approximately 3\.1 miles/i.test(text),
              saysNotCertified: /not\s+USATF\s+certified/i.test(text),
              saysNoResults: /no official results/i.test(text),
            };
          });

          /* Kept so the 390 and 1440 renders can be compared to each other. */
          mapByWidth[width] = bits;

          /* Exactly one of the two: the map, or the placeholder. Never both and
             never neither. */
          record(
            `${label}: course map inlined, or the placeholder cleanly`,
            bits.mapInlined !== bits.placeholderShown,
            bits.mapInlined
              ? `inlined, smallest label ${bits.smallestLabelPx ?? 'no text'}px`
              : 'SVG not in the repo, placeholder shown'
          );

          if (bits.mapInlined && bits.streetLabelPx !== null) {
            record(
              `${label}: course map street labels readable`,
              bits.streetLabelPx >= 12,
              `street labels ${bits.streetLabelPx}px (${bits.streetNames.join(', ')}), ` +
                `smallest text anywhere ${bits.smallestLabelPx}px`
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
    /* ---- the course map, across the two widths ---- */

    const narrow = mapByWidth[390];
    const wide = mapByWidth[1440];

    if (narrow && wide && narrow.mapInlined && wide.mapInlined) {
      /* The two type scales. Under one scale the user unit sizes are the same
         at both widths; under two they differ. Nothing about on screen pixels
         can tell those apart, which is why this reads the SVG's own units. */
      const switched =
        JSON.stringify(narrow.labelUnits) !== JSON.stringify(wide.labelUnits);

      record(
        'course map: the mobile type scale switches below 760px',
        switched,
        `390 units ${JSON.stringify(narrow.labelUnits)}, 1440 units ${JSON.stringify(wide.labelUnits)}`
      );
    } else if (narrow && !narrow.mapInlined) {
      skip(
        'course map: the mobile type scale switches below 760px',
        'the SVG is not in the repo, so there is no artwork to switch'
      );
      skip(
        'course map: reduced motion draws it complete with no animation',
        'the SVG is not in the repo'
      );
    }

    /* ---- reduced motion, which only works inlined ---- */

    if (narrow && narrow.mapInlined) {
      const page = await browser.newPage();
      await page.setViewport({ width: 390, height: 1000 });
      await page.emulateMediaFeatures([
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ]);
      await page.goto(BASE + '/turkey-trot', { waitUntil: 'networkidle0' });

      const reduced = await page.evaluate(() => {
        const el = document.querySelector('.race__coursemap svg .draw');
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { animationName: cs.animationName, dashoffset: cs.strokeDashoffset };
      });
      await page.close();

      record(
        'course map: reduced motion draws it complete with no animation',
        Boolean(reduced) &&
          reduced.animationName === 'none' &&
          parseFloat(reduced.dashoffset) === 0,
        reduced
          ? `animation ${reduced.animationName}, dashoffset ${reduced.dashoffset}`
          : 'no drawn path found'
      );

      record(
        'course map: without that preference it animates',
        Boolean(narrow.motion) && narrow.motion.animationName !== 'none',
        narrow.motion
          ? `animation ${narrow.motion.animationName}, dashoffset ${narrow.motion.dashoffset}`
          : 'no drawn path found'
      );
    }

    /* ---- the waiver is in the served markup ---- */

    {
      /* Three phrases, one per document, from the executed text. Each has to
         be in the HTML, because the whole point is that a signer can read
         what they are signing before they sign it.

         There was a second assertion here, that none of it appears in the
         flight payload, and it was wrong. The App Router serializes the
         whole server rendered tree into self.__next_f so a client side
         navigation can rebuild the page, so correctly server rendered text is
         in the payload as well. It failed against the right architecture,
         which made it a bad check rather than a finding. What the payload
         cannot tell you, the bundle and the import graph can: see
         check-waiver-not-bundled. */
      const PHRASES = [
        'being struck by a motor vehicle can cause catastrophic injury or death',
        'SUBLICENSABLE, AND TRANSFERABLE RIGHT AND LICENSE',
        'must be accompanied on the course at all times by',
      ];

      const html = await (await fetch(BASE + '/turkey-trot')).text();
      const inMarkup = PHRASES.filter((x) => html.includes(x)).length;

      record(
        'waiver: all three documents are in the served markup',
        inMarkup === PHRASES.length,
        `${inMarkup} of ${PHRASES.length} phrases present`
      );
    }
    /* ---- the ad loop defers the video download ---- */

    {
      const page = await browser.newPage();
      await page.setViewport({ width: 390, height: 900 });
      await page.setCacheEnabled(false);

      /* Every request the page makes, so this is measured rather than reasoned
         about. The mp4 is 4.8MB and must not be fetched until the frame is in
         view. There is no poster: what fills the frame before the video is the
         logo, an ordinary image on the page rather than part of the player's
         loading behaviour. */
      const asked = [];
      page.on('request', (r) => asked.push(r.url()));

      /* If React never hydrates, the observer never attaches and the src stays
         null while the server rendered markup still looks correct. So the
         errors are captured rather than assumed away. */
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 140)));
      page.on('console', (m) => {
        if (m.type() === 'error') pageErrors.push('console: ' + m.text().slice(0, 140));
      });

      await page.goto(BASE + '/', { waitUntil: 'networkidle0' });

      const hasBlock = await page.evaluate(() => !!document.querySelector('.racead'));
      if (!hasBlock) {
        skip(
          'ad loop, before the frame is in view: no mp4 request',
          'the mp4 is not in the repo, so no player renders'
        );
        skip(
          'ad loop, after the frame enters view: mp4 requested and actually playing',
          'the mp4 is not in the repo, so no player renders'
        );
      } else {
        const wanted = (list) => list.filter((u) => u.includes('turkey-trot-ad.mp4')).length;
        const beforeScroll = wanted(asked);

        /* ---- question one: is the download actually deferred ----

           The logo fills the frame before the video, so there is no poster
           request to pair this with. What matters is unchanged: 4.8MB must not
           move until somebody scrolls to it. */

        record(
          'ad loop, before the frame is in view: no mp4 request',
          beforeScroll === 0,
          `mp4 requests ${beforeScroll}`
        );

        /* ---- question two: and does it then play ----

           These are two questions and not one, and the reason is a bug this
           suite already shipped. The observer attached the src and called
           play() a microtask too early, so play() hit a source-less element and
           nothing retried. The result: src set, zero bytes fetched, nothing
           playing. Question one passed perfectly the whole time, because
           "deferred" and "broken" look identical from the before side.

           So this asserts the video reaches HAVE_FUTURE_DATA, is not paused,
           and has a clock that has moved. A request alone is not playback: an
           mp4 that 404s or fails to demux is also exactly one request. */
        await page.evaluate(() => {
          document.querySelector('.racead').scrollIntoView({ block: 'center' });
        });

        /* Polled, not slept. A fixed wait passes on a fast machine and fails on
           a slow one, which is worse than no check. */
        let videoState = null;
        for (let i = 0; i < 60; i += 1) {
          videoState = await page.evaluate(() => {
            const v = document.querySelector('.racead video');
            if (!v) return null;
            return {
              src: v.getAttribute('src'),
              paused: v.paused,
              readyState: v.readyState,
              networkState: v.networkState,
              currentTime: Math.round(v.currentTime * 100) / 100,
              error: v.error ? v.error.code : null,
            };
          });

          if (
            videoState &&
            videoState.readyState >= 3 &&
            !videoState.paused &&
            videoState.currentTime > 0
          ) {
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }

        const requested = wanted(asked);
        const playing =
          Boolean(videoState) &&
          videoState.readyState >= 3 &&
          !videoState.paused &&
          videoState.currentTime > 0;

        record(
          'ad loop, after the frame enters view: mp4 requested and actually playing',
          requested > 0 && playing,
          `mp4 requests ${requested}, video ${JSON.stringify(videoState)}` +
            (pageErrors.length ? ', errors: ' + pageErrors.slice(0, 2).join(' | ') : '')
        );
      }

      await page.close();
    }

  } finally {
    if (browser) await browser.close();
    server.kill();
    db.close();
  }

  /* -------------------------------------------------------------- report */

  const failed = results.filter((r) => !r.skipped && !r.ok);
  const skipped = results.filter((r) => r.skipped);

  console.log('\ncheck-race-pages\n');
  for (const r of results) {
    const state = r.skipped ? 'SKIP' : r.ok ? 'PASS' : 'FAIL';
    console.log(`  ${state}  ${r.name}\n          ${r.detail}`);
  }

  const ran = results.length - skipped.length;
  console.log(
    `\n  ${ran - failed.length} of ${ran} passed` +
      (skipped.length ? `, ${skipped.length} could not run` : '') +
      '.\n'
  );

  /* Named again at the bottom, because a skip scrolls past in a list of fifty
     and the whole point of the state is that it is not a pass. */
  if (skipped.length) {
    console.log('  Could not run, so nothing about these is known yet:');
    for (const r of skipped) console.log(`    ${r.name}`);
    console.log('');
  }

  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('check-race-pages threw', err);
  process.exit(1);
});
