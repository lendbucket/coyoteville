#!/usr/bin/env node
/**
 * Check that the PDF routes would actually work once deployed.
 *
 * A local build and a typecheck are both blind to this. pdfkit loads its
 * standard fonts through a Node subpath import, "#standard-fonts/Helvetica",
 * resolved against pdfkit's own package.json at runtime. Next's tracer cannot
 * follow that, so it bundles the entry and none of the fonts, everything passes
 * locally because the machine has the full node_modules, and the route 500s
 * with MODULE_NOT_FOUND on the first request in production.
 *
 *   npm run check:pdf-bundle        (runs after build; needs .next)
 *
 * Two checks, in order of strength:
 *
 *   1. Every runtime asset the routes need is in the tracer's own manifest,
 *      which is what Vercel packs the function from.
 *   2. A sandbox built from only those traced files renders a PDF using every
 *      standard face. If an asset is missing this fails here, in the same way
 *      and for the same reason it failed in production.
 *
 * Verified to fail when the includes are removed from next.config.js, which is
 * the only thing that makes a passing run worth anything.
 *
 * It is deliberately conservative about failing: no build output means skip,
 * because breaking a build over a missing artifact it was not asked to produce
 * is worse than the bug being guarded against.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const norm = (p) => p.replace(/\\/g, '/').replace(/^(\.\.\/)+/, '');

/* The routes to check come from the config rather than a list here, so a third
   PDF route is covered the moment it is given its tracing includes. */
function pdfRoutes() {
  const config = require(path.join(root, 'next.config.js'));
  const includes = config.experimental?.outputFileTracingIncludes ?? {};
  return Object.entries(includes)
    .filter(([, globs]) => globs.some((g) => g.includes('pdfkit')))
    .map(([route]) => route);
}

const FACES = [
  'Courier', 'CourierBold', 'CourierBoldOblique', 'CourierOblique',
  'Helvetica', 'HelveticaBold', 'HelveticaBoldOblique', 'HelveticaOblique',
  'Symbol', 'TimesBold', 'TimesBoldItalic', 'TimesItalic', 'TimesRoman',
  'ZapfDingbats',
];

/** The 14 standard PDF font names, as pdfkit's own API takes them. */
const PDF_FONT_NAMES = [
  'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
  'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique',
  'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
  'Symbol', 'ZapfDingbats',
];

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error('  FAIL', msg);
};

function traceFor(route) {
  const file = path.join(root, '.next', 'server', 'app', route, 'route.js.nft.json');
  if (!fs.existsSync(file)) return null;
  return {
    file,
    base: path.dirname(file),
    files: [...new Set(JSON.parse(fs.readFileSync(file, 'utf8')).files.map(norm))],
  };
}

function checkManifest(route, trace) {
  // Both extensions. The import map resolves .cjs under require and .mjs under
  // import, and which one wins is not something this can know from here.
  for (const face of FACES) {
    for (const ext of ['cjs', 'mjs']) {
      const want = `node_modules/pdfkit/js/standard-fonts/${face}.${ext}`;
      if (!trace.files.includes(want)) fail(`${route}: missing ${face}.${ext}`);
    }
  }

  // The .cjs faces require a shared glyph-name chunk of their own.
  const chunks = trace.files.filter((f) => f.includes('/js/standard-fonts/chunks/'));
  if (chunks.length < 2) fail(`${route}: standard-font chunks missing (${chunks.length}/2)`);

  if (!trace.files.some((f) => f.endsWith('sRGB_IEC61966_2_1.icc'))) {
    fail(`${route}: ICC profile missing`);
  }

  const brand = trace.files.filter((f) => /lib\/agreement\/fonts\/.*\.ttf$/.test(f));
  if (!brand.length) fail(`${route}: no brand fonts traced`);
  if (!trace.files.some((f) => f.endsWith('public/logo.png'))) fail(`${route}: logo.png missing`);

  return { chunks: chunks.length, brand: brand.length };
}

/** Copy only the traced files somewhere clean and render a PDF there. */
function renderFromBundle(route, trace) {
  const sandbox = path.join(root, '.pdf-bundle-check');
  fs.rmSync(sandbox, { recursive: true, force: true });

  let copied = 0;
  for (const entry of JSON.parse(fs.readFileSync(trace.file, 'utf8')).files) {
    const abs = path.resolve(trace.base, entry);
    const rel = path.relative(root, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    const target = path.join(sandbox, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(abs, target);
    copied += 1;
  }

  const entry = path.join(sandbox, 'node_modules', 'pdfkit', 'js', 'pdfkit.node.mjs');
  if (!fs.existsSync(entry)) {
    fail(`${route}: pdfkit entry not in the traced bundle`);
    return null;
  }

  const probe = path.join(sandbox, 'probe.mjs');
  fs.writeFileSync(
    probe,
    [
      "const { default: PDFDocument } = await import('./node_modules/pdfkit/js/pdfkit.node.mjs');",
      "const { createRequire } = await import('node:module');",
      'const require_ = createRequire(import.meta.url);',
      "// Production failed on the .cjs half of the import map; the entry above",
      '// uses the .mjs half. Both are exercised so neither can rot unnoticed.',
      "require_('./node_modules/pdfkit/js/standard-fonts/Helvetica.cjs');",
      "const doc = new PDFDocument({ size: 'LETTER' });",
      'const chunks = [];',
      "doc.on('data', (c) => chunks.push(c));",
      "const done = new Promise((r) => doc.on('end', r));",
      `for (const f of ${JSON.stringify(PDF_FONT_NAMES)}) {`,
      "  doc.font(f).fontSize(10).text(f + ' loaded');",
      '}',
      'doc.end();',
      'await done;',
      'const out = Buffer.concat(chunks);',
      "if (out.subarray(0, 5).toString() !== '%PDF-') { console.error('bad PDF header'); process.exit(1); }",
      'console.log(out.length);',
    ].join(String.fromCharCode(10))
  );

  try {
    const bytes = execFileSync(process.execPath, [probe], {
      cwd: sandbox,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    fs.rmSync(sandbox, { recursive: true, force: true });
    return { copied, bytes: Number(bytes) };
  } catch (err) {
    console.error(`  FAIL ${route}: the traced bundle could not render a PDF`);
    console.error(String(err.stdout || '') + String(err.stderr || err.message));
    failures += 1;
    fs.rmSync(sandbox, { recursive: true, force: true });
    return null;
  }
}

const routes = pdfRoutes();

if (!routes.length) {
  console.log('check-pdf-bundle: no PDF routes configured; nothing to check.');
  process.exit(0);
}

if (!fs.existsSync(path.join(root, '.next', 'server'))) {
  console.warn('check-pdf-bundle: no build output; skipping. Run after next build.');
  process.exit(0);
}

for (const route of routes) {
  const trace = traceFor(route);
  if (!trace) {
    fail(`${route}: no trace file, so this route did not build`);
    continue;
  }

  const counts = checkManifest(route, trace);
  const rendered = renderFromBundle(route, trace);

  if (counts && rendered) {
    console.log(
      `check-pdf-bundle: ${route} — 28 standard faces, ${counts.chunks} chunks, ` +
        `${counts.brand} brand fonts; ${rendered.copied} traced files rendered ` +
        `a ${rendered.bytes} byte PDF`
    );
  }
}

if (failures) {
  console.error(
    [
      '',
      'A PDF route is missing a runtime asset from its traced bundle. It will',
      'deploy and then 500 on the first request, which is what happened before.',
      'Add the asset to experimental.outputFileTracingIncludes in next.config.js',
      'for every route that renders a PDF.',
      '',
    ].join(String.fromCharCode(10))
  );
  process.exit(1);
}
