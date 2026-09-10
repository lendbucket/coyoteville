#!/usr/bin/env node
'use strict';

/**
 * Can the build chain run on Vercel's builder?
 *
 * Vercel builds on Linux with no Chrome and no display. A check that launches a
 * browser passes on this machine, passes in Actions, and fails the deploy: the
 * site keeps serving the previous commit while every gate output in the log
 * reads green except one line at the bottom.
 *
 * That is not hypothetical. check-admin-parity went into postbuild with a
 * hardcoded C:/Program Files path, all nine other gates passed, and the fix it
 * was gating never shipped.
 *
 * So the rule is enforced rather than remembered: nothing prebuild or postbuild
 * reaches puppeteer. Browser checks run by hand and in GitHub Actions, where a
 * browser exists. This check is deliberately node and fs only, because a gate
 * that guards the build chain has to be the least demanding thing in it.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;

/** Everything `npm run build` sets off, following one script into the next. */
function chain(name, seen = new Set()) {
  if (seen.has(name) || !scripts[name]) return seen;
  seen.add(name);
  for (const next of scripts[name].match(/npm run ([a-z:-]+)/g) || []) {
    chain(next.replace('npm run ', ''), seen);
  }
  return seen;
}

const invoked = new Set([...chain('prebuild'), ...chain('build'), ...chain('postbuild')]);

const failures = [];
const checked = [];

for (const name of invoked) {
  for (const file of scripts[name].match(/scripts\/[\w-]+\.js/g) || []) {
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) {
      failures.push(`${name} runs ${file}, which does not exist`);
      continue;
    }

    const source = fs.readFileSync(abs, 'utf8');
    /* The import, not the word. Every one of these scripts is free to explain
       in a comment why it is not allowed to launch a browser. */
    const imports = /require\(['"](puppeteer[\w-]*)['"]\)|from ['"](puppeteer[\w-]*)['"]/.exec(
      source
    );

    checked.push(file);
    if (imports) {
      failures.push(`${name} runs ${file}, which imports ${imports[1] || imports[2]}`);
    }
  }
}

if (failures.length) {
  console.error('\ncheck-build-portable: FAILED\n');
  for (const f of failures) console.error('  ' + f);
  console.error(
    [
      '',
      "Vercel's builder is Linux with no Chrome. A gate that launches one fails",
      'the deploy rather than the code, and the site keeps serving the last',
      'commit that built. Move it out of prebuild and postbuild, run it by hand,',
      'and add it to .github/workflows where a browser is installed.',
      '',
    ].join('\n')
  );
  process.exit(1);
}

console.log(
  `check-build-portable: ${invoked.size} scripts run by the build, ${checked.length} of them ` +
    'node files, none importing puppeteer.'
);
