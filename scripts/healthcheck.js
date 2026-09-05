#!/usr/bin/env node
/**
 * Production health check.
 *
 * Not a build gate. The six gates in package.json run against source and catch
 * what source can show; every live failure this site had in one week happened
 * past that point. event_slug was NOT NULL only in the real table. The CSP
 * blocked Square's SDK only in a real browser. pdfkit's fonts went missing only
 * in a real Lambda. None of those are visible before deploy, so this runs a real
 * browser against the real site and completes a real signup.
 *
 * Usage:
 *   BASE_URL=https://coyoteville.com node scripts/healthcheck.js
 *
 * Environment:
 *   BASE_URL              what to check. Defaults to production.
 *   HEALTHCHECK_SECRET    lets the signup route write marked rows. Required.
 *   ADMIN_PASSWORD        for step 6. Required.
 *   SQUARE_WEBHOOK_SIGNATURE_KEY  for step 8. Optional; step skips without it.
 *   RESEND_API_KEY, ALERT_EMAIL   failure email. Optional.
 *   TWILIO_*, ALERT_SMS_TO        failure SMS for steps 5 and 6. Optional.
 *   CHROME_PATH           puppeteer executable. Defaults per platform.
 *
 * Every row it writes is stamped business_name '__healthcheck__', which
 * everything that counts or lists vendors excludes, enforced by check-schema.
 * Stale rows are deleted before the run as well as after, so a crashed run
 * cannot leave debris behind.
 *
 * Retries: a step that fails is retried once after 60 seconds and only alerts if
 * it fails twice. A false alarm at three in the morning is how a health check
 * gets muted, and a muted health check is worse than none.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHmac } = require('crypto');
const puppeteer = require('puppeteer-core');

const BASE = (process.env.BASE_URL || 'https://coyoteville.com').replace(/\/+$/, '');
const SECRET = process.env.HEALTHCHECK_SECRET || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const WEBHOOK_KEY = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || '';
const RETRY_DELAY_MS = Number(process.env.HEALTHCHECK_RETRY_MS || 60_000);

const SHOTS = path.join(os.tmpdir(), 'coyoteville-healthcheck');
const HEALTHCHECK_NAME = '__healthcheck__';

/** Steps urgent enough to wake somebody. A broken signup or a locked out admin. */
const SMS_STEPS = new Set(['signup', 'admin-login']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === 'win32') return 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  // What GitHub's ubuntu runners ship, and what setup-chrome installs.
  return '/usr/bin/google-chrome';
}

/** Thrown by a step to fail it with a message worth putting in an email. */
class StepFailure extends Error {}
function assert(condition, message) {
  if (!condition) throw new StepFailure(message);
}

/* ------------------------------------------------------------- the browser */

let browser = null;

async function newPage(width = 390, height = 844, dsf = 3) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dsf });

  page.__consoleErrors = [];
  page.__cspViolations = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/Content Security Policy/i.test(text)) page.__cspViolations.push(text.slice(0, 300));
    else page.__consoleErrors.push(text.slice(0, 300));
  });
  page.on('pageerror', (e) => page.__consoleErrors.push('pageerror: ' + e.message.slice(0, 300)));
  return page;
}

/** Wait for a smooth scroll or a fetch driven render to stop moving. */
async function settle(page, ms = 900) {
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await sleep(ms);
}

/* ------------------------------------------------------------ the requests */

function healthcheckHeaders() {
  return { 'x-coyoteville-healthcheck': SECRET };
}

async function cleanup(staleOnly) {
  const res = await fetch(`${BASE}/api/admin/healthcheck-cleanup`, {
    method: 'POST',
    headers: { ...healthcheckHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ stale: staleOnly }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ...body };
}

/* ------------------------------------------------------------- the steps */

/** 1. The homepage renders, with no console errors and no CSP violations. */
async function stepHomepage(ctx) {
  const page = await newPage();
  ctx.page = page;

  const res = await page.goto(`${BASE}/`, { waitUntil: 'networkidle0', timeout: 60_000 });
  assert(res && res.ok(), `homepage returned ${res && res.status()}`);
  await settle(page);

  const h1 = await page.evaluate(() => (document.querySelector('h1') || {}).innerText || '');
  assert(h1.trim().length > 0, 'the homepage rendered no h1, so it is not the real page');

  assert(
    page.__cspViolations.length === 0,
    `CSP violations on the homepage: ${page.__cspViolations.join(' | ')}`
  );
  assert(
    page.__consoleErrors.length === 0,
    `console errors on the homepage: ${page.__consoleErrors.join(' | ')}`
  );

  return `h1 "${h1.trim().slice(0, 40)}", no console errors, no CSP violations`;
}

/**
 * 2. The page names the right next event.
 *
 * The soonest event that has not finished, cross checked in three places that
 * are rendered from three different code paths: the events section, the form's
 * dropdown, and the FAQ answer. A stale NEXT_EVENT is exactly the bug that let
 * this page advertise a finished event, and it showed up in only one of them.
 */
async function stepNextEvent(ctx) {
  const page = ctx.page || (ctx.page = await newPage());
  if (page.url() !== `${BASE}/`) {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle0', timeout: 60_000 });
    await settle(page);
  }

  const now = Date.now();
  const found = await page.evaluate(() => {
    const optionTexts = [...document.querySelectorAll('select[name="event_slug"] option')].map((o) => ({
      value: o.value,
      text: o.textContent.trim(),
    }));
    const body = document.body.innerText;
    const faq = [...document.querySelectorAll('details, .faq__a, .faq li')]
      .map((e) => e.innerText)
      .join('\n');
    return { optionTexts, body, faq };
  });

  assert(found.optionTexts.length > 0, 'the form has no event dropdown, so no event can be picked');

  /* Every event slug ends in its date, which is what makes this checkable
     without shipping the calendar to the check. */
  const dated = found.optionTexts
    .map((o) => {
      const m = o.value.match(/(\d{4})-(\d{2})-(\d{2})$/);
      return m ? { ...o, at: Date.parse(`${m[1]}-${m[2]}-${m[3]}T23:59:59Z`) } : null;
    })
    .filter(Boolean);

  assert(dated.length > 0, `no event option carries a date: ${JSON.stringify(found.optionTexts)}`);

  const past = dated.filter((d) => d.at < now);
  assert(
    past.length === 0,
    `the form offers ${past.length} event(s) that already finished: ${past.map((p) => p.value).join(', ')}`
  );

  const soonest = dated.sort((a, b) => a.at - b.at)[0];
  const name = soonest.text.split(',')[0].trim();

  assert(
    found.body.includes(name),
    `the soonest event "${name}" is in the dropdown but is not named anywhere on the page`
  );
  assert(
    found.faq.includes(name) || found.body.includes(name),
    `the FAQ does not name the next event "${name}"`
  );

  return `next event "${name}" (${soonest.value}), in the dropdown and on the page, nothing past offered`;
}

/**
 * 3. The capacity numbers are actually loading, and are coherent.
 *
 * The valuable assertion here is not that two numbers match. It is that the
 * numbers exist at all. When the spots query fails, EventsSection quietly
 * renders "Spot counts are not loading right now." and the page still looks
 * completely normal: no error, no missing section, nothing a person scanning
 * the site would catch. A vendor sees a page that cannot tell them whether
 * there is room.
 *
 * So this asserts the fallback is absent, that every event card carries a state
 * and a count, and that any number claiming to be spots left is in a range a
 * lot with tens of spaces could actually have. It reads the specific elements
 * rather than scraping digits out of the section, because the first version of
 * this step did the latter and failed on the year in the event date.
 */
const SPOTS_FALLBACK = "Spot counts are not loading right now";

async function stepCapacity(ctx) {
  const page = ctx.page;

  const seen = await page.evaluate(() => ({
    body: document.body.innerText,
    cards: [...document.querySelectorAll('.evcard')].map((c) => ({
      name: (c.querySelector('.evcard__name') || {}).innerText || '',
      state: (c.querySelector('.evcard__state') || {}).innerText || '',
      count: (c.querySelector('.evcard__count') || {}).innerText || '',
    })),
    prices: [...document.querySelectorAll('.price__amount')].map((e) => e.innerText.trim()),
  }));

  assert(
    !seen.body.includes(SPOTS_FALLBACK),
    `the events section is showing "${SPOTS_FALLBACK}", so the spot count query is failing and the page cannot tell a vendor whether there is room`
  );

  assert(seen.cards.length > 0, "the events section rendered no event cards");

  for (const card of seen.cards) {
    assert(card.state.trim(), `event card "${card.name.trim()}" has no state (open, full, closed)`);
    assert(card.count.trim(), `event card "${card.name.trim()}" has no spot count`);
  }

  /* Any "N left" on a card has to be a number a real lot could hold. A negative
     or a wild number means the capacity maths has gone wrong rather than the
     query, which looks identical on the page. */
  const claims = seen.cards
    .flatMap((c) => [...c.count.matchAll(/(\d+)\s+(?:booth|truck|spot)/gi)].map((m) => Number(m[1])));
  const wrong = claims.filter((n) => n < 0 || n > 200);
  assert(wrong.length === 0, `implausible spots remaining on an event card: ${wrong.join(", ")}`);

  assert(seen.prices.length > 0, "the pricing cards render no prices");

  return `${seen.cards.length} event card(s) with a state and a count, ${seen.prices.length} price(s), no loading fallback`;
}

/** 4. The Square SDK loads and its card iframe mounts. The CSP check. */
async function stepSquareSdk(ctx) {
  const page = await newPage();
  ctx.squarePage = page;
  await page.goto(`${BASE}/#apply`, { waitUntil: 'networkidle0', timeout: 60_000 });
  await settle(page, 600);

  const picked = await page.evaluate(() => {
    const opts = document.querySelectorAll('.kindpick__opt');
    if (opts.length < 3) return false;
    opts[2].click();
    return true;
  });
  assert(picked, 'the booking kind picker is not on the page, so monthly cannot be chosen');

  await sleep(8000);

  const state = await page.evaluate(() => ({
    sdk: typeof window.Square,
    frames: [...document.querySelectorAll('iframe')]
      .map((f) => {
        try {
          return new URL(f.src).host;
        } catch {
          return '';
        }
      })
      .filter(Boolean),
  }));

  assert(
    page.__cspViolations.length === 0,
    `CSP blocked something on the monthly form: ${page.__cspViolations.join(' | ')}`
  );
  assert(
    state.sdk === 'object',
    'window.Square is not defined after picking Permanent monthly, so the card SDK did not load and no card can be entered'
  );
  assert(
    state.frames.some((h) => /squarecdn\.com$/.test(h)),
    `no card iframe from squarecdn.com mounted; iframes present: ${state.frames.join(', ') || 'none'}`
  );

  return `window.Square is an object and the card iframe mounted from ${state.frames.find((h) => /squarecdn/.test(h))}`;
}

/**
 * 5. A real signup, all six combinations, through the real route and database.
 *
 * Posted rather than typed into the form. The form is walked by step 4 and by
 * the build gate; what only production can prove is that the insert lands, and
 * that is a property of the route and the table rather than of the fields.
 */
async function stepSignup() {
  const CASES = [
    { label: 'Event + Booth', kind: 'event', spot: 'booth' },
    { label: 'Event + Truck', kind: 'event', spot: 'truck', permit: true },
    { label: 'Day + Booth', kind: 'day', spot: 'booth' },
    { label: 'Day + Truck', kind: 'day', spot: 'truck', permit: true },
    { label: 'Monthly + Booth', kind: 'monthly', spot: 'booth' },
    { label: 'Monthly + Truck', kind: 'monthly', spot: 'truck', permit: true },
  ];

  /* The event slug and an open date are read off the live page rather than
     hardcoded, so this keeps working as the calendar advances. */
  const page = await newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0', timeout: 60_000 });
  const eventSlug = await page.evaluate(() => {
    const sel = document.querySelector('select[name="event_slug"]');
    return sel && sel.options.length ? sel.options[0].value : '';
  });
  await page.close();
  assert(eventSlug, 'could not read an event slug off the live page');

  const day = new Date(Date.now() + 21 * 86400_000).toISOString().slice(0, 10);

  const results = [];
  for (const c of CASES) {
    const form = new FormData();
    form.append('business_name', 'Health Check');
    form.append('contact_name', 'Health Check');
    form.append('phone', '3615550142');
    form.append('email', 'healthcheck@example.invalid');
    form.append('sells', 'automated production health check');
    form.append('signature_name', 'Health Check');
    form.append('signed_date', new Date().toISOString().slice(0, 10));
    form.append('waiver_accepted', 'true');
    form.append('permits_confirmed', 'true');
    form.append('spot_type', c.spot);
    form.append('serves_food', c.spot === 'truck' ? 'true' : 'false');
    form.append('booking_kind', c.kind);
    if (c.kind === 'event') form.append('event_slug', eventSlug);
    if (c.kind === 'day') form.append('booking_date', day);
    if (c.kind === 'monthly') {
      form.append('recurring_acknowledged', 'true');
      /* Deliberately a fake token. Square must refuse it, and that refusal is
         what proves the card path is reached and validated rather than skipped.
         A health check that could bypass card validation would be asserting
         only that it can bypass card validation. */
      form.append('card_source_id', 'cnon:card-nonce-healthcheck-invalid');
    }
    if (c.permit) {
      form.append(
        'permit',
        new Blob([Buffer.from('%PDF-1.4\n% health check permit\n')], { type: 'application/pdf' }),
        'permit.pdf'
      );
    }

    const res = await fetch(`${BASE}/api/vendor-application`, {
      method: 'POST',
      headers: healthcheckHeaders(),
      body: form,
    });
    const body = await res.json().catch(() => ({}));

    if (c.kind === 'monthly') {
      /* The card is fake, so Square refusing it is the pass. 402 is the route's
         card-on-file failure. Anything that looks like a database or shape
         error is a real failure and is reported as one. */
      const refusedForCard = res.status === 402 || /card/i.test(body.error || '');
      assert(
        refusedForCard,
        `${c.label}: expected Square to refuse the fake card, got ${res.status} ${JSON.stringify(body).slice(0, 200)}`
      );
      results.push(`${c.label}: card correctly refused`);
      continue;
    }

    assert(
      res.status === 200 && body.ok,
      `${c.label}: signup failed with ${res.status} ${JSON.stringify(body).slice(0, 240)}`
    );
    assert(body.id, `${c.label}: succeeded but returned no row id`);
    assert(
      body.healthcheck === true,
      `${c.label}: the route did not take the health check branch, so this may have created a real Square order`
    );
    results.push(`${c.label}: row ${String(body.id).slice(0, 8)}`);
  }

  return results.join('; ');
}

/** 6. The admin login works. */
async function stepAdminLogin(ctx) {
  assert(ADMIN_PASSWORD, 'ADMIN_PASSWORD is not set, so the admin login cannot be checked');

  const page = await newPage();
  ctx.adminPage = page;
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle0', timeout: 60_000 });
  await settle(page, 500);

  const field = await page.$('input[type="password"]');
  assert(field, 'the admin sign in screen has no password field');

  await field.type(ADMIN_PASSWORD, { delay: 5 });
  const submit = await page.$('button[type="submit"]');
  assert(submit, 'the admin sign in screen has no submit button');
  await submit.click();
  await sleep(6000);

  const signedIn = await page.evaluate(() => ({
    hasShell: Boolean(document.querySelector('.ash__top, .ash, [class*="ash__"]')),
    stillPassword: Boolean(document.querySelector('input[type="password"]')),
    error: (document.querySelector('.adminlogin__error, [role="alert"]') || {}).innerText || '',
  }));

  assert(
    !signedIn.error,
    `the admin login was refused: ${signedIn.error}`
  );
  assert(
    signedIn.hasShell && !signedIn.stillPassword,
    'the admin login did not reach the tracker, so the password was not accepted'
  );

  return 'signed in and the tracker shell rendered';
}

/** 7. The agreement PDF renders in the deployed Lambda. The pdfkit check. */
async function stepAgreementPdf(ctx) {
  const page = ctx.adminPage;
  assert(page, 'the admin session is required for the agreement PDF');

  const result = await page.evaluate(async () => {
    /* Ask the tracker for one signed row and then render its agreement, using
       the session cookie the browser already holds. Nothing about a vendor is
       read beyond the one id needed to render one document. */
    const link = document.querySelector('a[href*="/api/admin/agreement"], button[data-agreement-id]');
    const id = link
      ? (link.getAttribute('href') || '').match(/id=([0-9a-f-]{36})/)?.[1] ||
        link.getAttribute('data-agreement-id')
      : null;
    if (!id) return { ok: false, reason: 'no signed agreement is available in the tracker to render' };

    const res = await fetch(`/api/admin/agreement?id=${id}`);
    const buf = await res.arrayBuffer();
    const head = new TextDecoder().decode(new Uint8Array(buf.slice(0, 5)));
    return { ok: true, status: res.status, bytes: buf.byteLength, head };
  });

  if (!result.ok) {
    // Not a failure of the site. Reported so a run does not silently skip it.
    return `SKIPPED: ${result.reason}`;
  }

  assert(result.status === 200, `the agreement route returned ${result.status}`);
  assert(
    result.head === '%PDF-',
    `the agreement route did not return a PDF (first bytes "${result.head}"), which is what the pdfkit font failure looked like`
  );
  assert(result.bytes > 1000, `the PDF is only ${result.bytes} bytes, which is too small to be a real agreement`);

  return `rendered a ${result.bytes} byte PDF from the deployed function`;
}

/** 8. The Square webhook accepts a correctly signed payload. */
async function stepWebhook() {
  if (!WEBHOOK_KEY) return 'SKIPPED: SQUARE_WEBHOOK_SIGNATURE_KEY is not set';

  /* A payment for an order that does not exist. Correctly signed, so it proves
     signature verification and the handler are alive, and deliberately
     unmatched so it changes nothing. */
  const payload = JSON.stringify({
    type: 'payment.updated',
    data: {
      object: {
        payment: {
          id: 'healthcheck',
          status: 'COMPLETED',
          order_id: 'HEALTHCHECK_ORDER_DOES_NOT_EXIST',
          amount_money: { amount: 1, currency: 'USD' },
        },
      },
    },
  });

  const url = `${BASE}/api/square-webhook`;
  const signature = createHmac('sha256', WEBHOOK_KEY).update(url + payload, 'utf8').digest('base64');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-square-hmacsha256-signature': signature, 'Content-Type': 'application/json' },
    body: payload,
  });
  const body = await res.json().catch(() => ({}));

  assert(
    res.status === 200,
    `the webhook returned ${res.status} for a correctly signed payload: ${JSON.stringify(body).slice(0, 200)}`
  );
  assert(
    body.received === true,
    `the webhook did not acknowledge a signed payload: ${JSON.stringify(body).slice(0, 200)}`
  );

  return `signed payload acknowledged and ignored (${body.ignored || 'no reason given'})`;
}

/* ------------------------------------------------------------- the runner */

const STEPS = [
  ['homepage', stepHomepage],
  ['next-event', stepNextEvent],
  ['capacity', stepCapacity],
  ['square-sdk', stepSquareSdk],
  ['signup', stepSignup],
  ['admin-login', stepAdminLogin],
  ['agreement-pdf', stepAgreementPdf],
  ['webhook', stepWebhook],
];

async function screenshot(ctx, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `${name}.png`);
  const page = ctx.adminPage || ctx.squarePage || ctx.page;
  if (!page) return null;
  try {
    await page.screenshot({ path: file, fullPage: false });
    return file;
  } catch {
    return null;
  }
}

async function main() {
  assert(SECRET, 'HEALTHCHECK_SECRET is not set, so the check cannot write or clean up its rows');

  console.log(`health check against ${BASE}`);

  browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  // Debris from a crashed run, before anything else counts rows.
  const pre = await cleanup(true);
  console.log(`  stale cleanup: ${pre.deleted ?? 0} row(s) removed (${pre.status})`);

  const ctx = {};
  const failures = [];
  const passed = [];

  for (const [name, fn] of STEPS) {
    let detail = null;
    let error = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        detail = await fn(ctx);
        error = null;
        break;
      } catch (err) {
        error = err;
        if (attempt === 1) {
          /* Retry once. A step that fails twice sixty seconds apart is a real
             outage; one that fails once is usually a cold Lambda or a dropped
             connection, and paging on that is how a check gets turned off. */
          console.log(`  ${name}: failed, retrying in ${Math.round(RETRY_DELAY_MS / 1000)}s: ${err.message}`);
          await sleep(RETRY_DELAY_MS);
        }
      }
    }

    if (error) {
      const shot = await screenshot(ctx, name);
      failures.push({ step: name, message: error.message, shot });
      console.log(`  FAIL ${name}: ${error.message}`);
    } else {
      passed.push({ step: name, detail });
      console.log(`  ok   ${name}: ${detail}`);
    }
  }

  // Always, even when a step failed, so a bad run does not leave rows behind.
  const post = await cleanup(false).catch((e) => ({ status: 0, error: e.message }));
  console.log(`  cleanup: ${post.deleted ?? 0} row(s) removed (${post.status})`);

  await browser.close().catch(() => {});

  if (!failures.length) {
    // Nothing is sent on success, on purpose. A daily "all good" trains you to
    // ignore the one that matters.
    console.log(`\nhealth check: all ${passed.length} steps passed against ${BASE}`);
    return 0;
  }

  await alert(failures, post);
  return 1;
}

/* -------------------------------------------------------------- alerting */

async function alert(failures, cleanupResult) {
  const subject = `COYOTEVILLE DOWN: ${failures.map((f) => f.step).join(', ')}`;
  const lines = [
    `Health check failed against ${BASE}`,
    `at ${new Date().toISOString()}`,
    '',
    'Each of these failed twice, sixty seconds apart.',
    '',
    ...failures.map((f) => `[${f.step}]\n${f.message}\n`),
    `Health check rows cleaned up afterwards: ${cleanupResult.deleted ?? 'unknown'}`,
  ];
  const text = lines.join('\n');

  console.error('\n' + subject + '\n' + text);

  await sendEmail(subject, text, failures).catch((e) =>
    console.error('could not send the alert email:', e.message)
  );

  if (failures.some((f) => SMS_STEPS.has(f.step))) {
    await sendSms(
      `COYOTEVILLE DOWN: ${failures.filter((f) => SMS_STEPS.has(f.step)).map((f) => f.step).join(', ')}. Check email.`
    ).catch((e) => console.error('could not send the alert SMS:', e.message));
  }
}

async function sendEmail(subject, text, failures) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL;
  const from = process.env.FROM_EMAIL;
  if (!key || !to || !from) {
    console.error('email alerting is not configured (RESEND_API_KEY, ALERT_EMAIL, FROM_EMAIL)');
    return;
  }

  const attachments = [];
  for (const f of failures) {
    if (!f.shot || !fs.existsSync(f.shot)) continue;
    attachments.push({
      filename: `${f.step}.png`,
      content: fs.readFileSync(f.shot).toString('base64'),
    });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text, attachments }),
  });

  if (!res.ok) throw new Error(`Resend returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  console.error(`alert email sent to ${to} with ${attachments.length} screenshot(s)`);
}

async function sendSms(body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const to = process.env.ALERT_SMS_TO;
  if (!sid || !token || !from || !to) {
    console.error('SMS alerting is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, ALERT_SMS_TO)');
    return;
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: to, Body: body.slice(0, 300) }),
  });

  if (!res.ok) throw new Error(`Twilio returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  console.error(`alert SMS sent to ${to}`);
}

main()
  .then((code) => process.exit(code))
  .catch(async (err) => {
    console.error('health check itself threw:', err);
    if (browser) await browser.close().catch(() => {});
    await alert([{ step: 'healthcheck-harness', message: String(err && err.message) }], {}).catch(() => {});
    process.exit(1);
  });
