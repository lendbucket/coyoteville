/**
 * Turning what the composer produces into HTML an inbox will render.
 *
 * contenteditable emits whatever the browser feels like: nested spans with
 * inline colours, <font> tags, class names, pasted Word markup, sometimes a
 * whole stylesheet. None of that survives an email client intact and some of it
 * is unsafe to forward. So nothing the browser produces is trusted. This walks
 * the markup, keeps a short allowlist of tags, throws the rest away, and emits
 * a fresh document with every style inlined the way the other templates do it.
 *
 * Deliberately dependency free and deliberately not DOM based, because it has
 * to give byte identical output in two places: in the browser, where it drives
 * the live preview, and on the server, which re-runs it on submit and never
 * trusts what the client sent. A DOMParser version would only work in one.
 *
 * The parser is small on purpose. It is not a general HTML parser and does not
 * try to be: it handles the subset a rich text field can emit, and anything it
 * does not recognise is dropped rather than guessed at.
 */

const CREAM = '#F3EEE5';
const EMBER = '#F0A94B';
const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const TEXT = `font-family:${BODY};font-size:16px;line-height:25px;color:${CREAM};`;

/** Tags kept, mapped to what is emitted. */
const INLINE: Record<string, 'strong' | 'em' | 'u' | 'a'> = {
  b: 'strong',
  strong: 'strong',
  i: 'em',
  em: 'em',
  u: 'u',
  ins: 'u',
  a: 'a',
};

const BLOCK = new Set(['p', 'div', 'ul', 'ol', 'li', 'br']);

/**
 * Tags whose *contents* go too. Unwrapping a <script> would paste its source
 * into the email as visible text, which is worse than dropping it.
 */
const DROP_SUBTREE = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'template',
  'noscript',
  'head',
  'title',
  'meta',
  'link',
]);

const VOID = new Set(['br', 'img', 'hr', 'meta', 'link', 'input']);

export function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Only schemes that make sense from an email, and only ones that cannot
 * execute. javascript: and data: are the two that matter here.
 */
function safeHref(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  // Strip whitespace and control characters before testing the scheme. A tab
  // or a newline inside "java<tab>script:" is a real bypass that a plain
  // prefix check waves straight through.
  const flat = value.replace(/[\u0000-\u0020]/g, '').toLowerCase();

  if (/^(https?:|mailto:|tel:)/.test(flat)) return value;
  // A bare domain typed into the link box is almost always meant as https.
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/|$)/.test(flat)) return `https://${value}`;
  return null;
}

type Token =
  | { kind: 'text'; text: string }
  | { kind: 'open'; tag: string; attrs: string; selfClosing: boolean }
  | { kind: 'close'; tag: string };

/** Tokenise. Comments and doctypes are skipped outright. */
function tokenise(html: string): Token[] {
  const out: Token[] = [];
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf('<', i);

    if (lt === -1) {
      out.push({ kind: 'text', text: html.slice(i) });
      break;
    }

    if (lt > i) out.push({ kind: 'text', text: html.slice(i, lt) });

    // A "<" that cannot begin a tag is just a character someone typed, as in
    // "5 < 6". Treating it as markup swallowed the rest of the sentence.
    if (!/[a-zA-Z!/]/.test(html[lt + 1] ?? '')) {
      out.push({ kind: 'text', text: '<' });
      i = lt + 1;
      continue;
    }

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt);
      i = end === -1 ? html.length : end + 3;
      continue;
    }

    if (html.startsWith('<!', lt)) {
      const end = html.indexOf('>', lt);
      i = end === -1 ? html.length : end + 1;
      continue;
    }

    const gt = html.indexOf('>', lt);
    if (gt === -1) {
      // Unclosed tag at the end of the input. Treat the rest as text.
      out.push({ kind: 'text', text: html.slice(lt) });
      break;
    }

    const inner = html.slice(lt + 1, gt);

    if (inner.startsWith('/')) {
      out.push({ kind: 'close', tag: inner.slice(1).trim().toLowerCase() });
    } else {
      const selfClosing = inner.endsWith('/');
      const body = selfClosing ? inner.slice(0, -1) : inner;
      const space = body.search(/\s/);
      const tag = (space === -1 ? body : body.slice(0, space)).toLowerCase();
      const attrs = space === -1 ? '' : body.slice(space + 1);
      out.push({ kind: 'open', tag, attrs, selfClosing });
    }

    i = gt + 1;
  }

  return out;
}

function readHref(attrs: string): string | null {
  const match = attrs.match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  if (!match) return null;
  const raw = match[2] ?? match[3] ?? match[4] ?? '';
  return safeHref(decodeEntities(raw));
}

/** Just enough to make an href usable; text keeps its entities as written. */
function decodeEntities(v: string): string {
  return v
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'");
}

type Block = { tag: 'p' | 'ul' | 'ol'; items: string[] };

/**
 * Convert composer HTML into inline styled email HTML.
 *
 * The output is always a sequence of block level elements. Loose text that
 * arrives outside any block, which contenteditable produces constantly, is
 * gathered into a paragraph rather than emitted bare, so the result is
 * predictable no matter how the browser structured things.
 */
export function toEmailHtml(input: string): string {
  const tokens = tokenise(input ?? '');

  const blocks: Block[] = [];
  /** Open list contexts, innermost last. */
  const listStack: ('ul' | 'ol')[] = [];
  /** Inline formatting currently open, so it can be closed in order. */
  const openInline: string[] = [];

  let current = '';
  let dropDepth = 0;
  let dropTag = '';

  const flushParagraph = () => {
    const text = current.trim();
    current = '';
    if (!text) return;
    blocks.push({ tag: 'p', items: [text] });
  };

  const pushListItem = () => {
    const text = current.trim();
    current = '';
    if (!text) return;

    const tag = listStack[listStack.length - 1] ?? 'ul';
    const last = blocks[blocks.length - 1];

    if (last && last.tag === tag) last.items.push(text);
    else blocks.push({ tag, items: [text] });
  };

  const closeInline = () => {
    while (openInline.length) {
      const tag = openInline.pop() as string;
      current += `</${tag}>`;
    }
  };

  for (const token of tokens) {
    if (dropDepth > 0) {
      if (token.kind === 'open' && token.tag === dropTag && !token.selfClosing) dropDepth += 1;
      else if (token.kind === 'close' && token.tag === dropTag) dropDepth -= 1;
      continue;
    }

    if (token.kind === 'text') {
      // Collapse the whitespace contenteditable sprinkles between tags, but
      // keep single spaces, which carry meaning between words.
      const text = token.text.replace(/[\t\r\n]+/g, ' ').replace(/ {2,}/g, ' ');
      if (text) current += escapeHtml(decodeEntities(text));
      continue;
    }

    if (token.kind === 'open') {
      const { tag } = token;

      if (DROP_SUBTREE.has(tag)) {
        if (!token.selfClosing && !VOID.has(tag)) {
          dropDepth = 1;
          dropTag = tag;
        }
        continue;
      }

      if (tag === 'br') {
        current += '<br />';
        continue;
      }

      if (tag === 'p' || tag === 'div') {
        // A new block ends whatever was being collected.
        closeInline();
        if (listStack.length) pushListItem();
        else flushParagraph();
        continue;
      }

      if (tag === 'ul' || tag === 'ol') {
        closeInline();
        flushParagraph();
        listStack.push(tag);
        continue;
      }

      if (tag === 'li') {
        closeInline();
        pushListItem();
        continue;
      }

      const mapped = INLINE[tag];
      if (!mapped) continue; // Unknown tag: unwrap, keep the text inside.

      if (mapped === 'a') {
        const href = readHref(token.attrs);
        if (!href) continue;
        current += `<a href="${escapeHtml(href)}" style="color:${EMBER};text-decoration:underline;">`;
        openInline.push('a');
        continue;
      }

      current += `<${mapped}>`;
      openInline.push(mapped);
      continue;
    }

    // close
    const { tag } = token;

    if (tag === 'p' || tag === 'div') {
      closeInline();
      if (listStack.length) pushListItem();
      else flushParagraph();
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      closeInline();
      pushListItem();
      listStack.pop();
      continue;
    }

    if (tag === 'li') {
      closeInline();
      pushListItem();
      continue;
    }

    const mapped = INLINE[tag];
    if (!mapped) continue;

    // Close down to the matching tag, so crossed nesting cannot leak an
    // unclosed element into the email.
    const at = openInline.lastIndexOf(mapped);
    if (at === -1) continue;
    while (openInline.length > at) {
      const open = openInline.pop() as string;
      current += `</${open}>`;
    }
  }

  closeInline();
  if (listStack.length) pushListItem();
  else flushParagraph();

  return blocks
    .map((block) => {
      if (block.tag === 'p') {
        return `<p style="margin:0 0 16px;${TEXT}">${block.items[0]}</p>`;
      }
      const items = block.items
        .map((item) => `<li style="margin:0 0 8px;${TEXT}">${item}</li>`)
        .join('');
      return `<${block.tag} style="margin:0 0 16px;padding-left:22px;${TEXT}">${items}</${block.tag}>`;
    })
    .join('\n');
}

/** The plain text part, derived from the same cleaned HTML so they agree. */
export function toPlainText(emailHtml: string): string {
  return emailHtml
    .replace(/<li[^>]*>/gi, '\n- ')
    // </li> deliberately absent: the opening tag already started the line, and
    // ending it too would put a blank line between every bullet.
    .replace(/<\/(p|ul|ol)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

/** True when the body has no actual words in it, only empty markup. */
export function isEmptyBody(emailHtml: string): boolean {
  return toPlainText(emailHtml).replace(/[\s-]/g, '') === '';
}
