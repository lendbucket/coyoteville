#!/usr/bin/env node
'use strict';

/**
 * Did every file we asked the tracer to include actually land in the bundle?
 *
 * outputFileTracingIncludes is a request, not a guarantee. A glob that matches
 * nothing, a path that moved, a route whose key no longer matches its folder:
 * all three fail silently. The build is green, the page renders locally
 * because the file is sitting right there on disk, and the function 500s in
 * production on a file it was never given.
 *
 * That has happened twice on this site. pdfkit's standard fonts, resolved
 * through a subpath import the tracer cannot follow, which took down every PDF
 * route on its first request. And the lot map, read off disk to attach to the
 * spot assignment emails. Both times the symptom was identical and neither was
 * visible in a build log.
 *
 * check-pdf-bundle goes deeper on the PDF routes, rendering a document from a
 * sandbox containing only the traced files. This one is wider and shallower:
 * every entry in the config, every route, asserted against the tracer's own
 * manifest. The course map is the third asset of this shape and it should not
 * need a third outage to be covered.
 *
 * Postbuild, because it reads .next. Conservative about failing: no build
 * output at all means skip, since breaking a build over an artifact it was not
 * asked to produce is worse than the bug being guarded against.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const norm = (p) => p.replace(/\\/g, '/');

const config = require(path.join(root, 'next.config.js'));
const includes = config.experimental?.outputFileTracingIncludes ?? {};

const entries = Object.entries(includes);
if (!entries.length) {
  console.log('check-traced-assets: nothing is asking to be traced.');
  process.exit(0);
}

const serverDir = path.join(root, '.next', 'server', 'app');
if (!fs.existsSync(serverDir)) {
  console.log('check-traced-assets: no build output, skipping.');
  process.exit(0);
}

/**
 * The tracer writes one manifest per entry point, named after the file it
 * traced. A route folder has route.js.nft.json; a page folder has
 * page.js.nft.json. Which one a key means is decided by what is on disk rather
 * than by guessing from the path shape.
 */
function manifestFor(route) {
  /* The root page is keyed /page in the config, because a bare / is a glob
     that matches every route and drags whatever it lists into every bundle.
     On disk its manifest is still at the top of app. */
  const key = route === '/page' ? '' : route.replace(/^\//, '');
  const dir = path.join(serverDir, key);
  for (const name of ['route.js.nft.json', 'page.js.nft.json']) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/** What a glob like ./public/course/** actually matches on disk, right now. */
function expand(pattern) {
  const clean = pattern.replace(/^\.\//, '');
  const star = clean.indexOf('*');

  if (star === -1) {
    const abs = path.join(root, clean);
    return fs.existsSync(abs) ? [clean] : [];
  }

  const dir = clean.slice(0, clean.lastIndexOf('/', star));
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];

  /* A regex from the glob. Only ** and * appear in this config and both mean
     "some characters", which is close enough for checking that a real file on
     disk is covered. */
  const re = new RegExp(
    '^' + clean.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/(?<!\.)\*/g, '[^/]*') + '$'
  );

  const out = [];
  const walk = (current) => {
    for (const name of fs.readdirSync(current)) {
      const full = path.join(current, name);
      const rel = norm(path.relative(root, full));
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (re.test(rel)) out.push(rel);
    }
  };
  walk(abs);
  return out;
}

/* ------------------------------------------- what the code actually needs */

/**
 * Which files under public/ the server reads at runtime, and from where.
 *
 * Derived from the code rather than from the config, and that distinction is
 * the whole point. A check that reads outputFileTracingIncludes and confirms
 * those files are traced passes the moment somebody deletes the entry, which
 * is exactly the mistake it is supposed to catch. Removing the request removes
 * the requirement, and the bug ships.
 *
 * So the requirement comes from the import graph: this lib reads this file, this
 * route imports that lib, therefore that route's bundle has to contain it. The
 * config entry is then just the mechanism that satisfies it, and the gate does
 * not care whether anybody remembered to write one.
 */

const EXTS = ['.ts', '.tsx', '.js', '.jsx'];

function resolveImport(spec, fromFile) {
  if (!spec.startsWith('.') && !spec.startsWith('@/')) return null;

  const base = spec.startsWith('@/')
    ? path.join(root, spec.slice(2))
    : path.resolve(path.dirname(fromFile), spec);

  for (const ext of EXTS) {
    if (fs.existsSync(base + ext)) return base + ext;
  }
  for (const ext of EXTS) {
    const index = path.join(base, 'index' + ext);
    if (fs.existsSync(index)) return index;
  }
  return fs.existsSync(base) && fs.statSync(base).isFile() ? base : null;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;

function importsOf(file) {
  const source = fs.readFileSync(file, 'utf8');
  const out = [];
  for (const m of source.matchAll(IMPORT_RE)) {
    const resolved = resolveImport(m[1], file);
    if (resolved) out.push(resolved);
  }
  return out;
}

/**
 * Every file under public/ that this module, or anything it imports, reads.
 *
 * Two shapes appear in this codebase and both are matched: a path.join with a
 * 'public' segment, and a plain 'public/...' literal. A path built from a
 * variable is invisible, which is a real limit worth stating: what this catches
 * is the asset somebody wrote down, which is all of them today.
 */
function assetsReadBy(entry, seen = new Set()) {
  if (seen.has(entry)) return [];
  seen.add(entry);

  const source = fs.readFileSync(entry, 'utf8');
  const found = [];

  /* path.join(process.cwd(), 'public', 'course', 'turkey-trot-course.svg') */
  for (const m of source.matchAll(/process\.cwd\(\)\s*,\s*((?:'[^']+'\s*,\s*)*'[^']+')/g)) {
    const segments = [...m[1].matchAll(/'([^']+)'/g)].map((s) => s[1]);
    if (segments[0] !== 'public') continue;
    /* A bare public root is not an asset, it is the directory assets get
       joined onto. The relatives joined onto it are picked up below. */
    if (segments.length === 1) continue;
    if (segments.some((s) => s.includes('*'))) continue;
    found.push(segments.join('/'));
  }

  /* 'public/photos/lot-map-2026-09-11.png' */
  for (const m of source.matchAll(/'(public\/[^']+)'/g)) {
    if (m[1].includes('*')) continue;
    found.push(m[1]);
  }

  /* A module that builds a public root once and joins relatives onto it.

     lib/race-assets does exactly this: PUBLIC is process.cwd() plus public,
     and present('video/turkey-trot-ad.mp4') checks under it. Reading only the
     path.join above would call the asset "public" and learn nothing, so when
     a file declares such a root, every relative looking literal in it is
     resolved underneath it.

     This matters more than it looks. Those are existsSync calls at module
     scope deciding whether the ad and the logo render at all. On an ISR
     revalidation they run inside the function, so an untraced video is not a
     broken player, it is a block that silently stops existing on a page that
     was correct in the build output. */
  const hasPublicRoot = new RegExp(
    "path\\.join\\(\\s*process\\.cwd\\(\\)\\s*,\\s*'public'\\s*\\)"
  ).test(source);

  if (hasPublicRoot) {
    const relative = new RegExp("'\\/?((?:[A-Za-z0-9_-]+\\/)+[A-Za-z0-9_.-]+\\.[a-z0-9]{2,5})'", 'g');
    for (const m of source.matchAll(relative)) {
      found.push('public/' + m[1]);
    }
  }

  for (const next of importsOf(entry)) {
    found.push(...assetsReadBy(next, seen));
  }

  return found;
}

/** Every built route, as a path and the entry file the app uses for it. */
function appEntries() {
  const appDir = path.join(root, 'app');
  const out = [];

  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/^(page|route)\.tsx?$/.test(name)) continue;

      const route =
        '/' +
        norm(path.relative(appDir, path.dirname(full)))
          .split('/')
          .filter((s) => s && !s.startsWith('(') && !s.startsWith('_'))
          .join('/');

      out.push({ route: route === '/' ? '/' : route, file: full });
    }
  };

  walk(appDir);
  return out;
}

const failures = [];
const report = [];

/* ---- what the code needs, whether or not anybody asked for it ---- */

const tracedFor = (route) => {
  const manifest = manifestFor(route);
  if (!manifest) return null;
  return new Set(
    (JSON.parse(fs.readFileSync(manifest, 'utf8')).files ?? []).map((f) =>
      norm(path.relative(root, path.resolve(path.dirname(manifest), f)))
    )
  );
};

let derived = 0;

for (const { route, file } of appEntries()) {
  const assets = [...new Set(assetsReadBy(file))];
  if (!assets.length) continue;

  for (const asset of assets) {
    /* Not committed yet is not a failure. The course map and the lot map are
       both dropped in by hand and the build has to work before they land. */
    const abs = path.join(root, asset);
    if (!fs.existsSync(abs)) {
      report.push(`${route} reads ${asset}, not on disk yet`);
      continue;
    }

    /* A directory rather than a file. The composer reads all of public/photos,
       so the requirement is a glob covering the directory and not any one
       file being present. Asserting each file inside it would fail the build
       the first time somebody drops in a photo and deploys later, which is
       ordinary and not a bug. */
    if (fs.statSync(abs).isDirectory()) {
      const covered = (includes[route] ?? []).some((pattern) => {
        const clean = pattern.startsWith('./') ? pattern.slice(2) : pattern;
        let prefix = clean.split('*')[0];
        while (prefix.endsWith('/')) prefix = prefix.slice(0, -1);
        return asset === prefix || asset.startsWith(prefix + '/') || prefix.startsWith(asset + '/');
      });
      if (!covered) {
        failures.push(
          `${route} reads the directory ${asset} off disk and no` +
            `
    outputFileTracingIncludes entry for ${route} covers it.`
        );
      } else {
        report.push(`${route}: ${asset}/ covered by a glob`);
      }
      continue;
    }

    const traced = tracedFor(route);
    if (!traced) {
      report.push(`${route} reads ${asset}, no manifest (not a server route)`);
      continue;
    }

    derived += 1;
    if (!traced.has(asset)) {
      failures.push(
        `${route} reads ${asset} off disk and it is NOT in the traced bundle.
` +
          `    Nothing imports a file, so the tracer cannot see it. This needs an
` +
          `    outputFileTracingIncludes entry for ${route} in next.config.js.
` +
          `    Without one the page works locally and 500s in production.`
      );
    }
  }
}

if (derived) report.unshift(`${derived} asset read(s) derived from the code and traced`);

/* ---- and the config's own entries, as a second and weaker check ---- */

for (const [route, patterns] of entries) {
  const manifest = manifestFor(route);

  if (!manifest) {
    failures.push(
      `${route} has tracing includes but no manifest in .next/server/app.\n` +
        '    The key does not match a built route, so nothing it lists is traced.'
    );
    continue;
  }

  const traced = new Set(
    (JSON.parse(fs.readFileSync(manifest, 'utf8')).files ?? []).map((f) =>
      norm(path.relative(root, path.resolve(path.dirname(manifest), f)))
    )
  );

  let wanted = 0;
  let found = 0;

  for (const pattern of patterns) {
    const matches = expand(pattern);

    /* A pattern matching nothing on disk is not an error on its own: the
       course map is dropped in by hand and the build has to work before it
       lands. It is reported so it is visible rather than silent. */
    if (!matches.length) {
      report.push(`${route}: ${pattern} matches no file on disk yet`);
      continue;
    }

    for (const file of matches) {
      wanted += 1;
      if (traced.has(file)) {
        found += 1;
      } else {
        failures.push(
          `${route}: ${file} is in outputFileTracingIncludes and is NOT in the\n` +
            `    traced bundle. The function will not have it at runtime.`
        );
      }
    }
  }

  if (wanted) report.push(`${route}: ${found} of ${wanted} traced`);
}

if (failures.length) {
  console.error('\ncheck-traced-assets: FAILED\n');
  for (const f of failures) console.error('  ' + f + '\n');
  console.error(
    [
      'A file the config asks for is not in the function bundle. It will work',
      'locally, because the file is on disk, and fail on the first request in',
      'production, because the function only has what the tracer packed.',
      '',
    ].join('\n')
  );
  process.exit(1);
}

console.log('check-traced-assets: ' + report.join('; ') + '.');
