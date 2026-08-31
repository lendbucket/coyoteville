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
  require('fs').writeFileSync(process.argv[2]||'.anchors.tmp.json',JSON.stringify(results,null,1));
  await browser.close();
})();
