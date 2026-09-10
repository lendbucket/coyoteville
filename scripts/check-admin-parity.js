#!/usr/bin/env node
'use strict';

/**
 * Does the tracker show a phone everything it shows a desktop?
 *
 * The tracker is run from a phone, standing in the lot, on the night. A control
 * that exists only at 1440 is a control Robert does not have when he needs it,
 * and the way it goes missing is silent: a panel gets added to the shell, the
 * desktop rule renders every panel at once so it appears there immediately, and
 * the phone rule is a hand written list of tab names that somebody forgot to
 * add it to. That is exactly how the Organizations panel, and with it every
 * parking control for game night, ended up unreachable below 900px.
 *
 * So this compares the two widths rather than trusting either. It renders the
 * real /admin against fixture rows, collects every actionable element by its
 * accessible name at 1440, then walks every tab at 390 and collects the union.
 * Any name the desktop has and the phone does not is a failure.
 *
 * Accessible name rather than selector, because that is what the person holding
 * the phone is actually looking for. "Print QR" moving from one panel to
 * another is fine. "Print QR" not being anywhere is not.
 *
 * It needs a real Chrome and a built app, so it is NOT part of the build. It
 * runs by hand, and in GitHub Actions where a browser exists:
 *
 *   npx next build && npm run check:admin-parity
 *
 * Not in prebuild or postbuild, deliberately and permanently. Vercel's builder
 * is Linux with no Chrome, so a puppeteer gate in the build fails the deploy
 * rather than the tracker: 33132ee passed all nine other gates and never
 * shipped. check-anchors is out of the build for the same reason. Anything
 * that launches a browser belongs on a machine or a runner that has one.
 *
 * Sabotage it to prove it works. Hide any control below 900px and this fails
 * naming that control.
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { createHmac } = require('node:crypto');
const net = require('node:net');
const path = require('node:path');

const puppeteer = require('puppeteer-core');
const { startFixtureDb } = require('./admin-fixture-db');

const ROOT = path.join(__dirname, '..');

/**
 * Where Chrome is, the same way scripts/healthcheck.js asks.
 *
 * CHROME_PATH first, because that is what browser-actions/setup-chrome hands
 * back and what a machine with Chrome somewhere unusual can set. Then the
 * platform default. A hardcoded Windows path is what took a deploy down: this
 * script was in postbuild, Vercel's builder is Linux and has no Chrome, so
 * every other gate passed and this one failed the build.
 */
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === 'win32') return 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  // What GitHub's ubuntu runners ship, and what setup-chrome installs.
  return '/usr/bin/google-chrome';
}

const CHROME = chromePath();

const PASSWORD = 'parity-fixture-password';

const DESKTOP = { label: 'desktop 1440x900', width: 1440, height: 900 };
const PHONE = { label: 'phone 390x844', width: 390, height: 844 };

/* Chrome's own furniture and the things that are not controls. */
const IGNORED_NAMES = new Set(['', 'Sign out']);

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function adminCookie() {
  const expiresAt = Date.now() + 60 * 60 * 1000;
  const mac = createHmac('sha256', PASSWORD).update(`v1.${expiresAt}`).digest('hex');
  return `${expiresAt}.${mac}`;
}

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('the server never came up at ' + url);
}

/**
 * Every actionable element on screen, by the name a person would call it.
 *
 * Runs in the page. Opens every details first, because a collapsed section is
 * reachable by tapping its summary and should count as present at both widths:
 * the question is whether the control exists, not whether it happens to be
 * expanded. Elements with no client rects are genuinely not on screen and do
 * not count.
 */
const COLLECT = function collect() {
  const root = document.querySelector('.ash');
  if (!root) return { names: [], panels: [] };

  for (const d of root.querySelectorAll('details')) d.open = true;

  const SELECTOR = [
    'button',
    'a[href]',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    'summary',
    '[role="button"]',
  ].join(',');

  const nameOf = (el) => {
    const labelled = el.getAttribute('aria-labelledby');
    if (labelled) {
      const target = document.getElementById(labelled);
      if (target) return (target.innerText || '').replace(/\s+/g, ' ').trim();
    }
    const aria = el.getAttribute('aria-label');
    if (aria) return aria.replace(/\s+/g, ' ').trim();

    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (text) return text;

    return (
      el.getAttribute('title') ||
      el.getAttribute('placeholder') ||
      el.getAttribute('value') ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim();
  };

  const names = new Set();
  for (const el of root.querySelectorAll(SELECTOR)) {
    if (el.getClientRects().length === 0) continue;
    const name = nameOf(el);
    /* A count that ticks up between two page loads is the same control. Numbers
       are stripped so a badge cannot masquerade as a missing button. */
    if (name) names.add(name.replace(/\d+/g, '#').slice(0, 80));
  }

  const panels = [...root.querySelectorAll('[data-panel]')]
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => el.getAttribute('data-panel'));

  return { names: [...names], panels };
};

/** Every tab in the bar, and every entry in a More style list once opened. */
async function walkPhone(page) {
  const names = new Set();
  const seenPanels = new Set();
  const visited = [];

  const tabCount = await page.$$eval('.tabbar__tab', (els) => els.length);

  for (let i = 0; i < tabCount; i += 1) {
    await page.evaluate((idx) => {
      document.querySelectorAll('.tabbar__tab')[idx].click();
    }, i);
    await new Promise((r) => setTimeout(r, 250));

    const label = await page.evaluate(
      (idx) => document.querySelectorAll('.tabbar__tab')[idx].innerText.replace(/\s+/g, ' ').trim(),
      i
    );

    const first = await page.evaluate(COLLECT);
    first.names.forEach((n) => names.add(n));
    first.panels.forEach((p) => seenPanels.add(p));
    visited.push({ tab: label, panels: first.panels });

    /* A tab that opens a list of further panels: follow each entry, then come
       back. One screen deep is the rule, so this does not recurse. */
    /* Only the entries actually on screen under this tab. Every panel is in the
       DOM at every width, so a menu that is display:none still answers a
       querySelector, and following it would invent a path nobody has. */
    const onScreen = () =>
      [...document.querySelectorAll('[data-more-target]')].filter(
        (el) => el.getClientRects().length > 0
      );

    const moreCount = await page.evaluate(
      `(${onScreen.toString()})().length`
    );

    for (let m = 0; m < moreCount; m += 1) {
      await page.evaluate(`(${onScreen.toString()})()[${m}].click()`);
      await new Promise((r) => setTimeout(r, 250));

      const deeper = await page.evaluate(COLLECT);
      deeper.names.forEach((n) => names.add(n));
      deeper.panels.forEach((p) => seenPanels.add(p));
      visited.push({ tab: label + ' > entry ' + (m + 1), panels: deeper.panels });

      await page.evaluate((idx) => {
        document.querySelectorAll('.tabbar__tab')[idx].click();
      }, i);
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return { names, panels: seenPanels, visited };
}

/** The vendor sheet, which is where Request payment and the review buttons are. */
async function openSheet(page) {
  const opened = await page.evaluate(() => {
    const card = document.querySelector('.vcard:not(.vcard--skeleton)');
    if (!card) return false;
    (card.querySelector('button, [role="button"]') || card).click();
    return true;
  });
  if (!opened) return [];

  await new Promise((r) => setTimeout(r, 400));

  const found = await page.evaluate(() => {
    const sheet = document.querySelector('.sheet');
    if (!sheet || sheet.getClientRects().length === 0) return [];
    for (const d of sheet.querySelectorAll('details')) d.open = true;

    const out = new Set();
    for (const el of sheet.querySelectorAll(
      'button,a[href],input:not([type="hidden"]),select,textarea,summary,[role="button"]'
    )) {
      if (el.getClientRects().length === 0) continue;
      const name = (
        el.getAttribute('aria-label') ||
        (el.innerText || '').replace(/\s+/g, ' ').trim() ||
        el.getAttribute('title') ||
        el.getAttribute('placeholder') ||
        ''
      )
        .replace(/\s+/g, ' ')
        .trim();
      if (name) out.add(name.replace(/\d+/g, '#').slice(0, 80));
    }
    return [...out];
  });

  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 250));
  return found;
}

(async () => {
  if (!fs.existsSync(CHROME)) {
    console.error('check-admin-parity: no browser at ' + CHROME);
    console.error(
      [
        '',
        'This check drives a real Chrome, so it runs on a machine or a CI runner',
        'that has one, never in the Vercel build. Point CHROME_PATH at a Chrome',
        'or install one, then:',
        '',
        '  npx next build && npm run check:admin-parity',
        '',
      ].join('\n')
    );
    process.exit(1);
  }

  const db = await startFixtureDb();
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;

  /* Node on next's own bin rather than npx, which on Windows is a .cmd and
     needs a shell that then owns the process we later have to kill. */
  const server = spawn(
    process.execPath,
    [path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port)],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: db.url,
        SUPABASE_SERVICE_ROLE_KEY: db.key,
        ADMIN_PASSWORD: PASSWORD,
        NEXT_PUBLIC_SITE_URL: base,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let serverLog = '';
  server.stdout.on('data', (c) => {
    serverLog += c;
  });
  server.stderr.on('data', (c) => {
    serverLog += c;
  });

  const shutdown = async () => {
    server.kill();
    await db.stop();
  };

  let browser = null;
  try {
    await waitFor(base + '/park');

    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: 'new',
      args: ['--no-sandbox'],
    });

    const cookie = {
      name: 'cv_admin',
      value: adminCookie(),
      domain: '127.0.0.1',
      path: '/',
    };

    /* ---------------------------------------------------------- desktop */

    const wide = await browser.newPage();
    await wide.setViewport({ width: DESKTOP.width, height: DESKTOP.height });
    await wide.setCookie(cookie);
    await wide.goto(base + '/admin', { waitUntil: 'networkidle0' });
    await wide.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 600));

    const loggedIn = await wide.$('.ash');
    if (!loggedIn) {
      throw new Error(
        'the tracker did not render: the admin cookie was rejected or the page errored'
      );
    }

    const desktop = await wide.evaluate(COLLECT);
    const desktopSheet = await openSheet(wide);
    desktopSheet.forEach((n) => desktop.names.push(n));

    /* ------------------------------------------------------------ phone */

    const narrow = await browser.newPage();
    await narrow.setViewport({ width: PHONE.width, height: PHONE.height, isMobile: true });
    await narrow.setCookie(cookie);
    await narrow.goto(base + '/admin', { waitUntil: 'networkidle0' });
    await narrow.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 600));

    const phone = await walkPhone(narrow);

    /* The sheet opens from the vendors tab, so go back to it first. */
    await narrow.evaluate(() => {
      const tabs = [...document.querySelectorAll('.tabbar__tab')];
      const vendors = tabs.find((t) => /vendor/i.test(t.innerText));
      (vendors || tabs[0]).click();
    });
    await new Promise((r) => setTimeout(r, 300));
    const phoneSheet = await openSheet(narrow);
    phoneSheet.forEach((n) => phone.names.add(n));

    /* --------------------------------------------------------- the diff */

    const desktopNames = [...new Set(desktop.names)].filter((n) => !IGNORED_NAMES.has(n));
    const missing = desktopNames.filter((n) => !phone.names.has(n)).sort();

    const declaredPanels = await wide.evaluate(
      () => [...document.querySelectorAll('.ash [data-panel]')].map((el) => el.getAttribute('data-panel'))
    );
    const unreachablePanels = declaredPanels.filter((p) => !phone.panels.has(p));

    console.log('\n  where the phone went, and what each stop showed');
    for (const stop of phone.visited) {
      console.log(`    ${stop.tab.padEnd(24)} ${stop.panels.join(', ') || '(nothing)'}`);
    }
    console.log(
      `\n  ${desktopNames.length} named controls at 1440, ${phone.names.size} reachable at 390`
    );

    /* The inventory, for when the question is what is on the page rather than
       whether the two agree. PARITY_DUMP=1 npm run check:admin-parity */
    if (process.env.PARITY_DUMP) {
      console.log('\n  --- every named control at 1440 ---');
      for (const n of [...desktopNames].sort()) console.log('    ' + n);
      console.log('\n  --- every named control reachable at 390 ---');
      for (const n of [...phone.names].sort()) console.log('    ' + n);
    }

    if (unreachablePanels.length) {
      console.error('\ncheck-admin-parity: FAILED\n');
      console.error('  panels that render at 1440 and are unreachable at 390:');
      for (const p of unreachablePanels) console.error('    ' + p);
    }

    if (missing.length) {
      if (!unreachablePanels.length) console.error('\ncheck-admin-parity: FAILED\n');
      console.error('\n  controls at 1440 with no path to them at 390:');
      for (const name of missing) console.error('    ' + name);
    }

    if (missing.length || unreachablePanels.length) {
      console.error(
        [
          '',
          'The tracker is run from a phone in the lot. Anything on the desktop',
          'page has to be reachable there, one screen deep at most, without a',
          'horizontal swipe. Add the panel to the phone display rule and to the',
          'tab bar or the More list.',
          '',
        ].join('\n')
      );
      process.exitCode = 1;
    } else {
      console.log(
        `check-admin-parity: every panel that renders at 1440 is reachable at 390, and all ` +
          `${desktopNames.length} named controls on the desktop tracker have a path on the phone.`
      );
    }

    await browser.close();
    browser = null;
  } catch (err) {
    console.error('check-admin-parity: threw');
    console.error(err);
    if (serverLog.trim()) console.error('\nserver said:\n' + serverLog.trim().slice(-2000));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await shutdown();
  }
})();
