#!/usr/bin/env node
/**
 * Do the homepage anchors still land flush on their section?
 *
 * Not a build gate: it needs a running server and a real Chrome, so it is run
 * by hand when something touches layout, scroll padding, or containment.
 *
 *   npx next build && npx next start -p 3210
 *   node scripts/check-anchors.js
 *
 * Two paths, because they fail differently. cold loads /#id so the browser
 * jumps during load; click loads / and then sets the hash, which is the smooth
 * scroll path. Both wait for the scroll to actually stop rather than guessing a
 * delay, because a fixed wait reads the settle as a regression.
 *
 * A gap of 0 is flush. This is what caught content-visibility changing the
 * layout, and what proves cfc8665 is still intact.
 */
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3210';
const ANCHORS = ['events','about','vendors','faq','visit','apply','mission','spotlight','permanent','how','game-night'];
const VIEWPORTS = [
  { label:'mobile  390x844', width:390, height:844, dsf:3 },
  { label:'desktop 1440x900', width:1440, height:900, dsf:1 },
];

const settle = (ms) => new Promise(r=>setTimeout(r,ms));

(async()=>{
  const browser = await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const results={};
  for(const vp of VIEWPORTS){
    console.log(`\n=== ${vp.label} ===`);
    console.log('  anchor         cold gap   click gap   findable');
    results[vp.label]={};
    for(const id of ANCHORS){
      const page=await browser.newPage();
      await page.setViewport({width:vp.width,height:vp.height,deviceScaleFactor:vp.dsf});

      // COLD: navigate straight to the fragment
      await page.goto(`${BASE}/#${id}`,{waitUntil:'networkidle0'});
      await page.evaluate(()=>document.fonts.ready);
      await settle(300);
      await page.evaluate(async()=>{let last=-1,still=0;for(let i=0;i<120;i++){await new Promise(r=>setTimeout(r,50));const y=Math.round(window.scrollY);if(y===last){if(++still>=6)break;}else{still=0;last=y;}}});
      const cold=await page.evaluate((id)=>{
        const el=document.getElementById(id);
        if(!el) return null;
        return Math.round(window.scrollY - (el.getBoundingClientRect().top + window.scrollY));
      },id);

      // CLICK: from the top of a fully loaded page
      await page.goto(`${BASE}/`,{waitUntil:'networkidle0'});
      await page.evaluate(()=>document.fonts.ready);
      await settle(300);
      const click=await page.evaluate(async(id)=>{
        const el=document.getElementById(id);
        if(!el) return null;
        location.hash='#'+id;
        // wait for the smooth scroll to actually stop rather than guessing a delay
        let last=-1, still=0;
        for(let i=0;i<120;i++){
          await new Promise(r=>setTimeout(r,50));
          const y=Math.round(window.scrollY);
          if(y===last){ if(++still>=6) break; } else { still=0; last=y; }
        }
        return Math.round(window.scrollY - (el.getBoundingClientRect().top + window.scrollY));
      },id);

      // find-in-page reachability: is the section's text in the accessibility
      // / text content of the document even when far off screen?
      const findable=await page.evaluate((id)=>{
        const el=document.getElementById(id);
        if(!el) return false;
        const t=(el.innerText||'').trim();
        return t.length>20;
      },id);

      results[vp.label][id]={cold,click,findable};
      const f=(v)=>v===null?'   n/a':String(v).padStart(6);
      console.log('  #'+id.padEnd(13)+f(cold)+'     '+f(click)+'      '+(findable?'yes':'NO'));
      await page.close();
    }
  }
  /* Only writes a file when asked for one, so an ordinary run leaves nothing
     behind in the working tree. Pass a path to keep the numbers for a diff. */
  if (process.argv[2]) {
    require('fs').writeFileSync(process.argv[2], JSON.stringify(results, null, 1));
    console.log([String.fromCharCode(10), 'wrote ' + process.argv[2]].join(''));
  }
  /* ------------------------------------------------- dead links, per page */

  /* Every link in the shared header and footer has to go somewhere from every
     page, not just from the homepage. A bare #about resolves against whatever
     page it is on, which is how the whole nav on /parking-fundraiser pointed at
     sections that do not exist and silently did nothing. */
  console.log([String.fromCharCode(10), '=== links that go nowhere ==='].join(''));

  for (const path of ['/', '/parking-fundraiser']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 });
    await page.goto(BASE + path, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);

    const links = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') || ''))]
    );

    const dead = [];

    for (const href of links) {
      if (!href || href === '#') continue;

      /* A bare fragment has to resolve on the page it is written on. */
      if (href.startsWith('#')) {
        const here = await page.evaluate((id) => Boolean(document.getElementById(id)), href.slice(1));
        if (!here) dead.push(href);
        continue;
      }

      /* A path with a fragment has to resolve on the page it points at. This is
         the one that actually mattered: /#about written on /parking-fundraiser
         is only a real link if the homepage still has an #about. */
      const hash = href.indexOf('#');
      if (hash > 0 && href.startsWith('/')) {
        const target = href.slice(0, hash);
        const id = href.slice(hash + 1);
        const probe = await browser.newPage();
        try {
          await probe.goto(BASE + target, { waitUntil: 'domcontentloaded' });
          const there = await probe.evaluate((x) => Boolean(document.getElementById(x)), id);
          if (!there) dead.push(href);
        } catch {
          dead.push(href + ' (page did not load)');
        }
        await probe.close();
      }
    }

    console.log(
      '  ' + path.padEnd(22) + (dead.length ? 'DEAD: ' + dead.join(', ') : 'no dead fragments')
    );
    if (dead.length) process.exitCode = 1;
    await page.close();
  }

  /* ------------------------------------ the fundraiser calls to action */

  /* Six buttons on /parking-fundraiser point at #apply-fnf: the hero, and one
     at the end of each section that makes an argument. They are the only way
     into the form from the middle of a long page, so a fragment that stops
     landing flush is a button that appears to do nothing.
     Clicked as a real element rather than with location.hash, because an
     untrusted click is exactly the shortcut that once reported four bugs that
     did not exist. */
  console.log([String.fromCharCode(10), '=== fundraiser buttons land flush ==='].join(''));

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.dsf });
    await page.goto(BASE + '/parking-fundraiser', { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);

    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('a[href="#apply-fnf"]')].map((a) => a.innerText.trim())
    );

    console.log('  ' + vp.label);

    for (let i = 0; i < labels.length; i += 1) {
      await page.goto(BASE + '/parking-fundraiser', { waitUntil: 'networkidle0' });
      await page.evaluate(() => document.fonts.ready);
      await settle(300);

      const handles = await page.$$('a[href="#apply-fnf"]');
      await handles[i].click();

      await page.evaluate(async () => {
        let last = -1;
        let still = 0;
        for (let n = 0; n < 120; n += 1) {
          await new Promise((r) => setTimeout(r, 50));
          const y = Math.round(window.scrollY);
          if (y === last) {
            if (++still >= 6) break;
          } else {
            still = 0;
            last = y;
          }
        }
      });

      const gap = await page.evaluate(() => {
        const el = document.getElementById('apply-fnf');
        if (!el) return null;
        return Math.round(window.scrollY - (el.getBoundingClientRect().top + window.scrollY));
      });

      const ok = gap === 0;
      console.log(
        '    ' + String(labels[i]).slice(0, 34).padEnd(36) + (gap === null ? 'NO TARGET' : String(gap).padStart(4))
      );
      if (!ok) process.exitCode = 1;
    }

    await page.close();
  }

  /* ------------------------------------------------------- the redirects */

  /* The program was renamed and its page moved. /friday-night-fund is indexed
     and /fundraiser is what somebody types after reading a flyer that prints
     the domain and the word fundraiser and nothing else. A redirect that stops
     working is invisible from every other angle: the new page is fine, the old
     path simply 404s for people who are not looking at this repo. */
  console.log([String.fromCharCode(10), '=== old paths still arrive ==='].join(''));

  for (const from of ['/friday-night-fund', '/fundraiser']) {
    const page = await browser.newPage();
    let landed = '';
    try {
      await page.goto(BASE + from, { waitUntil: 'domcontentloaded' });
      const here = new URL(page.url()).pathname;
      landed = here.length > 1 && here.endsWith('/') ? here.slice(0, -1) : here;
    } catch {
      landed = '(did not load)';
    }

    const ok = landed === '/parking-fundraiser';
    console.log('  ' + from.padEnd(22) + (ok ? '-> /parking-fundraiser' : 'WRONG: ' + landed));
    if (!ok) process.exitCode = 1;
    await page.close();
  }

  await browser.close();
})();
