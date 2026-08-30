#!/usr/bin/env node
/**
 * Check every Supabase column reference in this repo against SCHEMA.md.
 *
 * Three separate outages have come from the same cause: a query naming a column
 * that does not exist in production, which Postgres rejects with 42703 and
 * which fails the whole statement rather than degrading. TypeScript cannot
 * catch it, because a select is a string and a row type is whatever we assert
 * it is. This can, so it runs before every build.
 *
 *   npm run check:schema
 *
 * The allowed columns are parsed out of the fenced block in SCHEMA.md rather
 * than restated here, so this cannot drift from the file it enforces. When
 * production genuinely changes, update SCHEMA.md first; there is no other
 * source of truth and the checker will not learn a column any other way.
 *
 * What it cannot see, and no static check will:
 *   - the bodies of join_waitlist and register_prepaid_vendor, which are not in
 *     this repo and write columns of their own
 *   - anything not reached through a .from('table') chain
 *
 * It is deliberately conservative about failing. A missing or unparseable
 * SCHEMA.md is reported and passes, because breaking every build over a
 * malformed doc is worse than the drift it is guarding against.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const SCHEMA_FILE = path.join(root, 'SCHEMA.md');

const NEWLINE = String.fromCharCode(10);
const BACKSLASH = String.fromCharCode(92);
const BACKTICK = String.fromCharCode(96);

/* ------------------------------------------------- the allowed columns */

function readSchema() {
  if (!fs.existsSync(SCHEMA_FILE)) return null;

  const text = fs.readFileSync(SCHEMA_FILE, 'utf8');
  const parts = text.split('```');
  if (parts.length < 2) return null;

  const tables = {};
  let current = null;

  for (const raw of parts[1].split(NEWLINE)) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;

    // "postgres functions (bodies NOT in this repo):" ends the table lists.
    if (line.startsWith('postgres functions')) {
      current = null;
      continue;
    }
    if (!line.startsWith('  ') && /^\w+$/.test(line.trim())) {
      current = line.trim();
      tables[current] = new Set();
      continue;
    }
    if (current && line.startsWith('  ')) {
      for (const col of line.split(',')) {
        const name = col.trim();
        if (name) tables[current].add(name);
      }
    }
  }

  return Object.keys(tables).length ? tables : null;
}

/* --------------------------------------------------------- comments out */

/** Blank comments out, preserving line count, so prose is never read as code. */
function stripComments(text) {
  let out = '';
  let i = 0;
  let quote = null;

  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];

    if (quote) {
      out += c;
      if (c === BACKSLASH) {
        out += next === undefined ? '' : next;
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }

    if (c === "'" || c === '"' || c === BACKTICK) {
      quote = c;
      out += c;
      i += 1;
      continue;
    }

    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== NEWLINE) {
        out += ' ';
        i += 1;
      }
      continue;
    }

    if (c === '/' && next === '*') {
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        out += text[i] === NEWLINE ? NEWLINE : ' ';
        i += 1;
      }
      out += '  ';
      i += 2;
      continue;
    }

    out += c;
    i += 1;
  }

  return out;
}

/* ------------------------------------------------------- source files */

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'out', 'build']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Column lists held in a constant and passed as .select(NAME). */
function constantLists(text) {
  const lists = {};

  // const NAME = 'a, b' + 'c, d';
  const stringForm = /const\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[^=]+)?=\s*((?:'[^']*'\s*\+?\s*)+);/g;
  for (const m of text.matchAll(stringForm)) {
    const joined = [...m[2].matchAll(/'([^']*)'/g)].map((s) => s[1]).join('');
    lists[m[1]] = joined.split(',').map((c) => c.trim()).filter(Boolean);
  }

  // const NAME = ['a', 'b'].join(', ');
  const arrayForm = /const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\[([\s\S]*?)\]\s*\.join\(/g;
  for (const m of text.matchAll(arrayForm)) {
    lists[m[1]] = [...m[2].matchAll(/'([^']*)'/g)].map((s) => s[1].trim()).filter(Boolean);
  }

  return lists;
}

const FILTERS = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is', 'not', 'order', 'contains',
];

/* A .from() opens a scope that runs to the next .from() or this many lines,
   whichever comes first. Queries here are short chains; a bounded window is
   easier to trust than a parser and has not missed one yet. */
const WINDOW = 45;

function check(tables) {
  const findings = [];
  const files = walk(root);
  let scanned = 0;

  for (const file of files) {
    const text = stripComments(fs.readFileSync(file, 'utf8'));
    if (!text.includes('.from(')) continue;
    scanned += 1;

    const lines = text.split(/\r?\n/);
    const lists = constantLists(text);
    const rel = path.relative(root, file).replace(/\\/g, '/');

    const froms = [];
    lines.forEach((line, i) => {
      const m = /\.from\('([^']+)'\)/.exec(line);
      if (m) froms.push({ table: m[1], line: i });
    });

    froms.forEach((from, idx) => {
      const allowed = tables[from.table];
      if (!allowed) {
        findings.push({
          file: rel,
          line: from.line + 1,
          table: from.table,
          column: '(whole table)',
          how: 'table is not in SCHEMA.md',
        });
        return;
      }

      const end =
        idx + 1 < froms.length ? froms[idx + 1].line : Math.min(from.line + WINDOW, lines.length);
      const windowLines = lines.slice(from.line, end);
      const windowText = windowLines.join(NEWLINE);
      const lineOf = (index) => from.line + windowText.slice(0, index).split(NEWLINE).length;

      const add = (line, column, how) =>
        findings.push({ file: rel, line, table: from.table, column, how });

      // .select('a, b, c'), including one that wraps onto the next line
      for (const m of windowText.matchAll(/\.select\(\s*'([^']*)'/g)) {
        for (const col of m[1].split(',')) {
          const name = col.trim();
          if (name && name !== '*' && !allowed.has(name)) add(lineOf(m.index), name, 'select');
        }
      }

      // .select(CONSTANT)
      for (const m of windowText.matchAll(/\.select\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g)) {
        if (!lists[m[1]]) continue;
        for (const name of lists[m[1]]) {
          if (name && name !== '*' && !allowed.has(name)) {
            add(lineOf(m.index), name, `select via ${m[1]}`);
          }
        }
      }

      // .eq('col', …), .order('col', …) and friends
      windowLines.forEach((line, offset) => {
        for (const fn of FILTERS) {
          const re = new RegExp(`\\.${fn}\\(\\s*'([^']+)'`, 'g');
          for (const m of line.matchAll(re)) {
            const name = m[1].trim();
            if (name && !allowed.has(name)) add(from.line + offset + 1, name, `.${fn}()`);
          }
        }
      });

      // .update({ … }) / .insert({ … }) / .upsert({ … }) object keys
      for (const m of windowText.matchAll(/\.(update|insert|upsert)\(\s*\{/g)) {
        let depth = 0;
        let i = m.index + m[0].length - 1;
        const start = i;
        for (; i < windowText.length; i += 1) {
          if (windowText[i] === '{') depth += 1;
          else if (windowText[i] === '}') {
            depth -= 1;
            if (depth === 0) break;
          }
        }
        const body = windowText.slice(start, i + 1);
        const baseLine = from.line + windowText.slice(0, start).split(NEWLINE).length;

        for (const key of body.matchAll(/(?:^|[{,\s])([a-z_][a-z0-9_]*)\s*:/gi)) {
          const name = key[1];
          if (!allowed.has(name)) {
            add(baseLine + body.slice(0, key.index).split(NEWLINE).length - 1, name, `.${m[1]}()`);
          }
        }
      }
    });
  }

  return { findings, scanned };
}

/* -------------------------------------------------------------- report */

const tables = readSchema();

if (!tables) {
  console.warn('check-schema: SCHEMA.md is missing or has no column block; skipping.');
  process.exit(0);
}

const { findings, scanned } = check(tables);

const seen = new Set();
const unique = findings.filter((f) => {
  const key = `${f.file}:${f.line}:${f.table}:${f.column}:${f.how}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

unique.sort(
  (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column.localeCompare(b.column)
);

if (!unique.length) {
  console.log(
    `check-schema: ${scanned} files, ${Object.keys(tables).length} tables, no unknown columns.`
  );
  process.exit(0);
}

const distinct = [...new Set(unique.map((f) => `${f.table}.${f.column}`))].sort();

console.error(
  `\ncheck-schema: ${unique.length} reference(s) to ${distinct.length} column(s) that are not in SCHEMA.md.\n`
);
for (const f of unique) {
  console.error(`  ${f.file}:${f.line}  ${f.table}.${f.column}  (${f.how})`);
}
console.error(
  [
    '',
    'Postgres rejects a query naming a column that does not exist with error',
    '42703, and fails the whole statement. Either the query is wrong, or',
    'production changed and SCHEMA.md has not been updated to match it.',
    '',
    'Verify against the live database before editing SCHEMA.md. It is the only',
    'source of truth here, and supabase/*.sql are both known to disagree with it.',
    '',
  ].join(NEWLINE)
);

process.exit(1);
