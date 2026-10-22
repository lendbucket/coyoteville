/**
 * Extract the waiver's text layer faithfully, with nothing but zlib.
 *
 * Everything here was learned by reading this specific file:
 *
 *   The strings are hex glyph indices into subset fonts, one byte per glyph
 *   (the codespacerange says <00> <FF>), so the bytes mean nothing without the
 *   font's ToUnicode CMap.
 *
 *   There are two fonts. /F1 is LiberationSerif-Bold and sets the headings,
 *   /F2 is LiberationSerif and sets the body, and their glyph orders are
 *   unrelated. Decoding the body with the heading map produced "COYTEOVTIL
 *   1ELSAN1UNL 1TR" for "The terms set forth" - fluent looking nonsense, which
 *   is the most dangerous failure possible for a legal transcription.
 *
 *   The Font dictionary is an indirect object. A page's /Resources names
 *   /Font 273 0 R, and 273 is what holds <</F1 267 0 R/F2 272 0 R>>.
 *
 * Unmappable glyphs come out as U+FFFD so a bad extraction is visible rather
 * than silent.
 */
const fs = require('fs');
const zlib = require('zlib');

const buf = fs.readFileSync(process.argv[2]);
const latin = buf.toString('latin1');

/** The body of object n, as text. */
function objBody(n) {
  const re = new RegExp('(?:^|[^0-9])' + n + '\\s+0\\s+obj([\\s\\S]{0,4000}?)endobj');
  const m = re.exec(latin);
  return m ? m[1] : '';
}

/** The stream belonging to object n, inflated. */
function streamOf(n) {
  const re = new RegExp('(?:^|[^0-9])' + n + '\\s+0\\s+obj');
  const m = re.exec(latin);
  if (!m) return null;

  const sAt = latin.indexOf('stream', m.index);
  const eAt = latin.indexOf('endstream', sAt);
  if (sAt === -1 || eAt === -1) return null;

  let from = sAt + 6;
  if (buf[from] === 0x0d) from += 1;
  if (buf[from] === 0x0a) from += 1;

  const raw = buf.subarray(from, eAt);
  if (/FlateDecode/.test(latin.slice(m.index, sAt))) {
    try {
      return zlib.inflateSync(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

const utf16 = (hex) => {
  let s = '';
  for (let i = 0; i + 4 <= hex.length; i += 4) s += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return s;
};

function parseCMap(text) {
  const map = new Map();

  const range = /begincodespacerange\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/.exec(text);
  map.codeBytes = range ? Math.max(1, Math.round(range[1].length / 2)) : 2;

  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(parseInt(p[1], 16), utf16(p[2]));
    }
  }

  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const r of block[1].matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([\s\S]*?)\])/g
    )) {
      const lo = parseInt(r[1], 16);
      const hi = parseInt(r[2], 16);
      if (r[3] !== undefined) {
        const base = parseInt(r[3], 16);
        for (let g = lo; g <= hi; g += 1) map.set(g, String.fromCodePoint(base + (g - lo)));
      } else if (r[4] !== undefined) {
        const items = [...r[4].matchAll(/<([0-9A-Fa-f]+)>/g)].map((m) => utf16(m[1]));
        for (let g = lo; g <= hi && g - lo < items.length; g += 1) map.set(g, items[g - lo]);
      }
    }
  }

  return map;
}

/* /Fn -> CMap, resolved through the indirect Font dictionary. */
const byName = new Map();
for (const ref of latin.matchAll(/\/Font\s+(\d+)\s+0\s+R/g)) {
  const entries = objBody(Number(ref[1]));
  for (const f of entries.matchAll(/\/(F\d+)\s+(\d+)\s+0\s+R/g)) {
    if (byName.has(f[1])) continue;
    const font = objBody(Number(f[2]));
    const tu = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(font);
    if (!tu) continue;
    const data = streamOf(Number(tu[1]));
    if (data) byName.set(f[1], parseCMap(data.toString('latin1')));
  }
}

console.log('fonts mapped: ' + [...byName.entries()].map(([n, m]) => n + '=' + m.size + 'g/' + m.codeBytes + 'B').join(', '));

/* Page content streams, in page order. */
const pages = [...latin.matchAll(/\/Type\s*\/Page[^s]([\s\S]{0,400}?)endobj/g)]
  .map((m) => /\/Contents\s+(\d+)\s+0\s+R/.exec(m[1]))
  .filter(Boolean)
  .map((m) => Number(m[1]));

console.log('pages: ' + pages.length);

let out = '';
let total = 0;
let unmapped = 0;

for (const contentObj of pages) {
  const data = streamOf(contentObj);
  if (!data) continue;
  const body = data.toString('latin1');

  let current = byName.get('F2') ?? byName.values().next().value ?? new Map();
  let lastY = null;

  for (const t of body.matchAll(
    /\/(F\d+)\s+[\d.]+\s+Tf|([\d.-]+)\s+([\d.-]+)\s+Td|<([0-9A-Fa-f]+)>\s*Tj|\[([\s\S]*?)\]\s*TJ/g
  )) {
    if (t[1]) {
      current = byName.get(t[1]) ?? current;
      continue;
    }

    if (t[3] !== undefined) {
      /* A new text position. A change in y is a new line. */
      const y = parseFloat(t[3]);
      if (lastY !== null && Math.abs(y - lastY) > 0.5) out += '\n';
      lastY = y;
      continue;
    }

    const hexes = [];
    if (t[4]) hexes.push(t[4]);
    if (t[5]) for (const h of t[5].matchAll(/<([0-9A-Fa-f]+)>/g)) hexes.push(h[1]);

    const step = (current.codeBytes ?? 1) * 2;
    for (const hex of hexes) {
      for (let i = 0; i + step <= hex.length; i += step) {
        const glyph = parseInt(hex.slice(i, i + step), 16);
        total += 1;
        const ch = current.get(glyph);
        if (ch === undefined) {
          unmapped += 1;
          out += '�';
        } else {
          out += ch;
        }
      }
    }
  }

  out += '\n\n';
}

const text = out.replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n');
fs.writeFileSync(process.argv[3], text, 'utf8');

console.log('glyphs ' + total + ', unmapped ' + unmapped + ' (' + ((unmapped / total) * 100).toFixed(2) + '%)');
console.log('characters ' + text.length);
console.log('replacement chars in output: ' + (text.match(/�/g) || []).length);
