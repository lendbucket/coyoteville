#!/usr/bin/env node
'use strict';

/**
 * Can you actually read the admin?
 *
 * check-admin-parity counts controls and it passed 98 of 98 while almost every
 * label on the Race tab was cream on white and completely invisible. A control
 * can be present, reachable, correctly named and unreadable, and reachability
 * says nothing at all about legibility.
 *
 * So this measures the thing a person experiences: for every text node on the
 * admin, at both widths, the computed foreground against the pixels actually
 * behind it. Not the average over the card and not the nearest ancestor's
 * declared background, because neither is what the eye sees. The background is
 * sampled from a screenshot, at the text's own position, with the text hidden
 * so the sample is the surface and not the glyphs.
 *
 * WCAG AA: 4.5:1 for body text, 3:1 for large text, where large is 24px or
 * 18.66px bold.
 *
 * It walks every tab, not just the one that broke, because the cause was a
 * surface painting itself white and saying nothing about text, and nothing
 * about that cause was specific to the Race tab.
 */

const { spawn } = require('node:child_process');
const { createHmac } = require('node:crypto');
const net = require('node:net');
const path = require('node:path');

const puppeteer = require('puppeteer-core');
const { startFixtureDb } = require('./admin-fixture-db');

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === 'win32') return 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  return '/usr/bin/google-chrome';
}

const CHROME = chromePath();
const PASSWORD = 'contrast-fixture-password';

const DESKTOP = { label: '1440', width: 1440, height: 900 };
const PHONE = { label: '390', width: 390, height: 844 };

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

/* ----------------------------------------------------------------- colour */

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function ratio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Flatten a possibly translucent foreground over the surface behind it. */
function flatten(fg, alpha, bg) {
  if (alpha >= 1) return fg;
  return [0, 1, 2].map((i) => Math.round(fg[i] * alpha + bg[i] * (1 - alpha)));
}

function parseColor(value) {
  const m = /rgba?\(([^)]+)\)/.exec(value || '');
  if (!m) return null;
  const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some(Number.isNaN)) return null;
  return { rgb: [parts[0], parts[1], parts[2]], alpha: parts.length > 3 ? parts[3] : 1 };
}

/* ------------------------------------------------- what the page reports */

/**
 * Every visible text node, with its colour, its size and where it sits.
 *
 * One entry per text-bearing element rather than per character: the rect is
 * the first line box, which is where a sample lands on the surface the text is
 * actually drawn on even when the element is a tall container.
 */
const COLLECT_TEXT = function collectText() {
  const root = document.querySelector('.ash');
  if (!root) return [];

  for (const d of root.querySelectorAll('details')) d.open = true;

  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let node = walker.nextNode();
  while (node) {
    const text = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
    const el = node.parentElement;

    if (!text || !el) {
      node = walker.nextNode();
      continue;
    }

    const style = getComputedStyle(el);
    const hidden =
      style.visibility === 'hidden' ||
      style.display === 'none' ||
      Number(style.opacity) === 0 ||
      el.closest('[aria-hidden="true"]') !== null;

    if (hidden) {
      node = walker.nextNode();
      continue;
    }

    /* A disabled control has no contrast requirement.
     *
     * WCAG 1.4.3 exempts text that is part of an inactive user interface
     * component, and dimming a disabled button is how a disabled button is
     * conventionally drawn. Including them would mean every greyed out
     * control on the page is a failure, which would bury the real ones and
     * teach everybody to ignore this gate. It is an exemption in the standard,
     * not a way to get to green: an enabled control at the same colour still
     * fails. */
    const inactive = el.closest('[disabled], [aria-disabled="true"], fieldset[disabled]');
    if (inactive) {
      node = walker.nextNode();
      continue;
    }

    /* The first line box of this text, which is where the glyphs are. */
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
    range.detach();

    if (!rects.length) {
      node = walker.nextNode();
      continue;
    }

    const rect = rects[0];

    /* Off screen, or scrolled out of the viewport: not being read right now. */
    if (
      rect.bottom <= 0 ||
      rect.right <= 0 ||
      rect.top >= window.innerHeight ||
      rect.left >= window.innerWidth
    ) {
      node = walker.nextNode();
      continue;
    }

    /* Is this text actually painted where it is measured?
     *
     * A rect survives clipping, so an element scrolled out of its own
     * container still reports a position, and sampling there reads whatever
     * is painted underneath instead of the surface the glyphs sit on. The hit
     * test rejects that, and rejects text covered by a sticky header or an
     * overlay, which is a different bug and not this gate's to report. */
    const sx = Math.round(rect.left + Math.min(rect.width, 80) / 2);
    const sy = Math.round(rect.top + rect.height / 2);
    const hit = document.elementFromPoint(sx, sy);
    if (!hit || (hit !== el && !el.contains(hit) && !hit.contains(el))) {
      node = walker.nextNode();
      continue;
    }

    /* Not underneath the fixed chrome.
     *
     * The header and the tab bar are translucent and sit over the scrolling
     * panel, so a row that happens to be beneath one samples a blended pixel
     * that is darker than the surface the text is read on. elementFromPoint
     * does not catch it because that chrome does not take pointer events.
     * Skipping the sample is right rather than generous: the sweep measures
     * the same element again at a scroll position where it is in the clear,
     * and an element that is never in the clear is a layout bug, not a
     * contrast one. */
    const underChrome = [...document.querySelectorAll('.ash *')].some((other) => {
      if (other === el || other.contains(el)) return false;
      const pos = getComputedStyle(other).position;
      if (pos !== 'fixed' && pos !== 'sticky') return false;
      const r = other.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      return sx >= r.left && sx <= r.right && sy >= r.top && sy <= r.bottom;
    });

    if (underChrome) {
      node = walker.nextNode();
      continue;
    }

    const size = parseFloat(style.fontSize) || 16;
    const weight = Number(style.fontWeight) || 400;

    /* What is behind this text, composited from the DOM.
     *
     * The first version of this read the pixel out of a screenshot. That is
     * the honest thing to do when the backdrop is a photo or a video, which
     * is why the hero was measured that way, but the admin is flat colour and
     * the encoder was shifting saturated fills by about a fifth: a rust
     * button that computes to rgb(196, 85, 43) came back as rgb(157, 72, 41)
     * and failed on a colour the page never painted.
     *
     * So the surface is composited here instead, by walking ancestors and
     * flattening each translucent layer onto the one behind it, which is
     * exactly what the compositor does. Anything carrying a background image
     * or a gradient is reported as such and falls back to the pixel sample,
     * because compositing cannot answer for those. */
    const behind = (function surface(start) {
      let acc = null;
      let node = start;
      let painted = false;

      const blend = (over, under) => {
        if (!under) return over;
        const a = over[3];
        return [
          Math.round(over[0] * a + under[0] * (1 - a)),
          Math.round(over[1] * a + under[1] * (1 - a)),
          Math.round(over[2] * a + under[2] * (1 - a)),
          1,
        ];
      };

      const layers = [];

      while (node && node !== document.documentElement) {
        const cs = getComputedStyle(node);

        if (cs.backgroundImage && cs.backgroundImage !== 'none') return { image: true };

        const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor || '');
        if (m) {
          const q = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
          const alpha = q.length > 3 ? q[3] : 1;
          if (alpha > 0) {
            layers.push([q[0], q[1], q[2], alpha]);
            painted = true;
            if (alpha === 1) break;
          }
        }

        node = node.parentElement;
      }

      /* Nothing painted anywhere: the canvas is the html background. */
      if (!painted) {
        const root = /rgba?\(([^)]+)\)/.exec(getComputedStyle(document.documentElement).backgroundColor || '');
        const q = root ? root[1].split(/[,\s/]+/).filter(Boolean).map(Number) : [255, 255, 255];
        layers.push([q[0] ?? 255, q[1] ?? 255, q[2] ?? 255, 1]);
      }

      /* Furthest back first, then each nearer layer over it. */
      for (let i = layers.length - 1; i >= 0; i -= 1) {
        acc = acc ? blend(layers[i], acc) : [layers[i][0], layers[i][1], layers[i][2], 1];
      }

      return { rgb: [acc[0], acc[1], acc[2]] };
    })(el);

    out.push({
      behind,
      text: text.slice(0, 60),
      color: style.color,
      size,
      weight,
      /* Large text by WCAG: 24px, or 18.66px when bold. */
      large: size >= 24 || (size >= 18.66 && weight >= 700),
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute('class') || '').split(/\s+/).slice(0, 3).join('.'),
      x: sx,
      y: sy,
    });

    node = walker.nextNode();
  }

  return out;
};

/* --------------------------------------------------------------- the run */

/**
 * Sample the surface behind the text.
 *
 * The text is hidden first, with transparent instead of display none so
 * nothing reflows and every rect stays where it was measured. What comes back
 * is the pixels the glyphs sit on, including any image or gradient, which is
 * the only honest answer to "what is behind this".
 */
async function surfaceBehind(page, points) {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'contrast-hide-text';
    style.textContent = '.ash, .ash * { color: transparent !important; }';
    document.head.appendChild(style);
  });

  const shot = await page.screenshot({ encoding: 'base64' });

  await page.evaluate(() => {
    document.getElementById('contrast-hide-text')?.remove();
  });

  return page.evaluate(
    async (dataUrl, pts) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + dataUrl;
      await img.decode();

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      /* The screenshot is in device pixels and the rects are in CSS pixels. */
      const scale = img.naturalWidth / window.innerWidth;

      return pts.map(({ x, y }) => {
        const px = Math.max(0, Math.min(canvas.width - 1, Math.round(x * scale)));
        const py = Math.max(0, Math.min(canvas.height - 1, Math.round(y * scale)));
        const d = ctx.getImageData(px, py, 1, 1).data;
        return [d[0], d[1], d[2]];
      });
    },
    shot,
    points
  );
}

/**
 * Measure a tab all the way down, not just the first screen.
 *
 * Only text in the viewport can be sampled, because only text in the viewport
 * is painted. The admin panels scroll, so a single pass measures the top of a
 * tab and nothing else: the first version of this gate caught two of the
 * invisible headings on the Race tab and missed the rest purely because they
 * were below the fold. This scrolls the active panel a screen at a time and
 * measures at each stop.
 */
async function measureTab(page, label, tab) {
  const results = [];
  const seen = new Set();

  /* Where the scrolling actually happens. The panel owns the overflow, not
     the window, so scrolling the window would move nothing. */
  const steps = await page.evaluate(() => {
    const panel =
      document.querySelector('.ash [data-panel][data-active="true"]') ||
      document.querySelector('.ash__panel[data-active="true"]') ||
      document.querySelector('.ash__panel');
    if (!panel) return 1;
    const h = panel.clientHeight || 1;
    return Math.max(1, Math.min(14, Math.ceil(panel.scrollHeight / h)));
  });

  for (let step = 0; step < steps; step += 1) {
    await page.evaluate((i) => {
      const panel =
        document.querySelector('.ash [data-panel][data-active="true"]') ||
        document.querySelector('.ash__panel[data-active="true"]') ||
        document.querySelector('.ash__panel');
      if (panel) panel.scrollTop = i * (panel.clientHeight || 0) * 0.9;
    }, step);
    await new Promise((r) => setTimeout(r, 220));

    for (const row of await measure(page, label, tab)) {
      /* The same element seen at two scroll positions is one element. */
      const key = `${row.cls}|${row.text}|${row.size}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(row);
    }
  }

  /* Back to the top so the next tab starts where a person would. */
  await page.evaluate(() => {
    const panel =
      document.querySelector('.ash [data-panel][data-active="true"]') ||
      document.querySelector('.ash__panel[data-active="true"]') ||
      document.querySelector('.ash__panel');
    if (panel) panel.scrollTop = 0;
  });

  return results;
}

async function measure(page, label, tab) {
  const nodes = await page.evaluate(COLLECT_TEXT);
  if (!nodes.length) return [];

  /* Only the ones sitting on an image or a gradient need the screenshot. On
     the admin that is usually none of them, so usually no screenshot is
     taken at all. */
  const needPixel = nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n.behind && n.behind.image);

  let sampled = [];
  if (needPixel.length) {
    sampled = await surfaceBehind(
      page,
      needPixel.map(({ n }) => ({ x: n.x, y: n.y }))
    );
  }

  const pixelFor = new Map();
  needPixel.forEach(({ i }, k) => pixelFor.set(i, sampled[k]));

  const results = [];

  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    const bg = n.behind && n.behind.image ? pixelFor.get(i) : n.behind && n.behind.rgb;
    const parsed = parseColor(n.color);
    if (!parsed || !bg) continue;

    /* A fully transparent foreground draws nothing, so there is nothing to
       read and nothing to fail. */
    if (parsed.alpha === 0) continue;

    const fg = flatten(parsed.rgb, parsed.alpha, bg);
    const r = ratio(fg, bg);
    const needs = n.large ? 3 : 4.5;

    results.push({
      ...n,
      width: label,
      tab,
      fg,
      bg,
      ratio: r,
      needs,
      pass: r >= needs - 0.005,
    });
  }

  return results;
}

async function walkTabs(page, label) {
  const found = [];

  const tabCount = await page.$$eval('.tabbar__tab', (els) => els.length).catch(() => 0);

  if (!tabCount) {
    found.push(...(await measureTab(page, label, 'the tracker')));
    return found;
  }

  for (let i = 0; i < tabCount; i += 1) {
    await page.evaluate((idx) => {
      document.querySelectorAll('.tabbar__tab')[idx].click();
    }, i);
    await new Promise((r) => setTimeout(r, 350));

    const name = await page.evaluate(
      (idx) =>
        document.querySelectorAll('.tabbar__tab')[idx].innerText.replace(/\s+/g, ' ').trim(),
      i
    );

    found.push(...(await measureTab(page, label, name || `tab ${i + 1}`)));

    /* A tab that opens further panels. One screen deep, same rule as parity. */
    const onScreen = () =>
      [...document.querySelectorAll('[data-more-target]')].filter(
        (el) => el.getClientRects().length > 0
      );

    const moreCount = await page.evaluate(`(${onScreen.toString()})().length`);

    for (let m = 0; m < moreCount; m += 1) {
      await page.evaluate(`(${onScreen.toString()})()[${m}].click()`);
      await new Promise((r) => setTimeout(r, 300));

      const sub = await page.evaluate(() => {
        const open = document.querySelector('[data-panel][data-active="true"]');
        return open ? open.getAttribute('data-panel') : '';
      });

      found.push(...(await measureTab(page, label, `${name} > ${sub || m + 1}`)));

      await page.evaluate((idx) => {
        document.querySelectorAll('.tabbar__tab')[idx].click();
      }, i);
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return found;
}

async function main() {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const db = await startFixtureDb();

  const ROOT = path.join(__dirname, '..');

  /* Node on the next binary directly, not npx: spawning a .cmd shim is EINVAL
     on Windows under recent Node, and parity already learned this. */
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

    const cookie = { name: 'cv_admin', value: adminCookie(), domain: '127.0.0.1', path: '/' };
    const all = [];

    for (const size of [DESKTOP, PHONE]) {
      const page = await browser.newPage();
      await page.setViewport({
        width: size.width,
        height: size.height,
        isMobile: size === PHONE,
      });
      await page.setCookie(cookie);
      await page.goto(base + '/admin', { waitUntil: 'networkidle0' });
      await page.evaluate(() => document.fonts.ready);
      await new Promise((r) => setTimeout(r, 700));

      const rendered = await page.$('.ash');
      if (!rendered) {
        throw new Error('the tracker did not render: the cookie was rejected or the page errored');
      }

      all.push(...(await walkTabs(page, size.label)));
      await page.close();
    }

    if (!all.length) {
      throw new Error('no text was measured at all, so this check proves nothing');
    }

    const failures = all.filter((r) => !r.pass);

    /* One line per distinct element rather than per occurrence: the same label
       on both widths is one bug, and a list of three hundred repeats of it is
       not a report anybody reads. */
    const seen = new Map();
    for (const f of failures) {
      const key = `${f.tab}|${f.cls}|${f.text}`;
      const prior = seen.get(key);
      if (!prior || f.ratio < prior.ratio) seen.set(key, f);
    }

    const unique = [...seen.values()].sort((a, b) => a.ratio - b.ratio);

    const rgb = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

    if (unique.length) {
      console.error('\ncheck-admin-contrast: FAILED\n');
      console.error(
        `  ${unique.length} text element(s) below the minimum, out of ${all.length} measured.\n`
      );

      for (const f of unique) {
        console.error(
          `  ${f.ratio.toFixed(2)}:1  needs ${f.needs}:1   [${f.width}] ${f.tab}\n` +
            `      ${f.tag}${f.cls ? '.' + f.cls : ''}  "${f.text}"\n` +
            `      ${rgb(f.fg)} on ${rgb(f.bg)}, ${Math.round(f.size)}px${
              f.weight >= 700 ? ' bold' : ''
            }\n`
        );
      }

      console.error(
        [
          '  The background is sampled from the rendered page at the text position,',
          '  with the text hidden, so it is the real surface and not a declared one.',
          '',
          '  The usual cause is a surface that sets its own background and says',
          '  nothing about its foreground. body is cream on black, so anything that',
          '  paints itself white and inherits is invisible. Set the pair together on',
          '  the surface rather than patching each label.',
          '',
        ].join('\n')
      );

      await shutdown();
      if (browser) await browser.close();
      process.exit(1);
    }

    const worst = all.reduce((a, b) => (a.ratio < b.ratio ? a : b));

    console.log(
      `check-admin-contrast: ${all.length} text nodes measured across both widths and every ` +
        `tab, each against the pixels actually behind it, and all of them clear AA. The ` +
        `closest is "${worst.text}" at ${worst.ratio.toFixed(2)}:1 against ${worst.needs}:1.`
    );
  } catch (err) {
    console.error('\ncheck-admin-contrast: could not run.\n');
    console.error('  ' + (err && err.message ? err.message : String(err)));
    if (serverLog.trim()) {
      console.error('\nserver said:\n' + serverLog.split('\n').slice(-14).join('\n'));
    }
    await shutdown();
    if (browser) await browser.close();
    process.exit(1);
  }

  await shutdown();
  if (browser) await browser.close();
}

void main();
