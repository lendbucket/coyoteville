import 'server-only';
import path from 'node:path';
import fs from 'node:fs';
import React from 'react';
import { Font, Image, StyleSheet, Text, View } from '@react-pdf/renderer';

/**
 * The shared furniture every signed document is printed on.
 *
 * Three documents get a PDF now: the vendor agreement, the organization's
 * program terms, and the volunteer waiver. They are the same kind of object,
 * a signed instrument reproduced from the version its signer actually saw, so
 * they are printed on the same paper: one font registration, one palette, one
 * masthead, one running footer, one execution block.
 *
 * This file exists because the second one nearly became a copy of the first.
 * A second stylesheet is a second set of conspicuous provisions to keep
 * conspicuous, a second footer to keep from collapsing, and a second place for
 * the font registration to rot. The comments below are load bearing: several
 * of these numbers and structures are the way they are because the obvious
 * version produced a broken PDF.
 *
 * Fonts stay under lib/agreement/fonts. The directory name is now wrong for
 * where it sits, and it is not being renamed: six routes trace that path into
 * their function bundles, and a mistraced font asset is exactly the failure
 * that put a 500 in production once already. A tidier path is not worth
 * re-running that risk.
 */

export const BRAND = {
  ink: '#0B0B0C',
  body: '#1C1C1F',
  muted: '#5C574F',
  rule: '#D8D0C2',
  ember: '#C97C15',
  emberField: '#FDF4E4',
  rust: '#C4552B',
  paper: '#FFFFFF',
};

/**
 * US Letter at 72dpi, and the page margin. Both are needed as numbers rather
 * than as style shorthand: the running footer is positioned absolutely, and an
 * absolutely positioned box in this renderer does not get a width from left and
 * right alone. Sized from these, it cannot collapse.
 */
export const PAGE = { width: 612, margin: 52 };
export const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

const FONT_ROOT = path.join(process.cwd(), 'lib', 'agreement', 'fonts');
const LOGO = path.join(process.cwd(), 'public', 'logo.png');

/**
 * Fonts are read off disk rather than fetched, so a PDF produced during a
 * network blip is the same document as one produced on a good day. next.config
 * traces this directory and the logo into every PDF route's bundle; if that
 * trace is ever dropped these throw at render time rather than silently
 * substituting Helvetica for the signature.
 */
let registered = false;
export function registerFonts(): void {
  if (registered) return;

  Font.register({
    family: 'Karla',
    fonts: [
      { src: path.join(FONT_ROOT, 'Karla-Regular.ttf'), fontWeight: 400 },
      { src: path.join(FONT_ROOT, 'Karla-Bold.ttf'), fontWeight: 700 },
    ],
  });
  Font.register({ family: 'Anton', src: path.join(FONT_ROOT, 'Anton-Regular.ttf') });
  Font.register({ family: 'Yellowtail', src: path.join(FONT_ROOT, 'Yellowtail-Regular.ttf') });

  /* Long unbroken strings in the record, a user agent above all, otherwise run
     off the edge of the page instead of wrapping. */
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}

let logoCache: Buffer | null | undefined;

export function readLogo(): Buffer | null {
  if (logoCache !== undefined) return logoCache;
  try {
    logoCache = fs.readFileSync(LOGO);
  } catch {
    // A missing mark costs the branding, not the document. Everything that
    // makes this a record still renders.
    console.error('pdf: logo.png not readable, rendering without it');
    logoCache = null;
  }
  return logoCache;
}

/* ---------------------------------------------------------------- styles */

export const styles = StyleSheet.create({
  /**
   * Leading is set here and only here.
   *
   * A paragraph in these documents is a Text wrapping one more Text per bold
   * run. Set the line height on either of those and the two contributions add
   * up: the lines come out at nearly double. Inherited from the Page it is
   * applied once, to the line, which is the layout these are set in.
   *
   * The cost of that is in the running footer, and is handled there.
   */
  page: {
    paddingTop: 46,
    paddingBottom: 58,
    paddingHorizontal: PAGE.margin,
    fontFamily: 'Karla',
    fontSize: 9.2,
    lineHeight: 1.5,
    color: BRAND.body,
    backgroundColor: BRAND.paper,
  },

  /* masthead */
  masthead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  logo: { width: 108, marginRight: 16 },
  mastheadText: { flex: 1, paddingTop: 4 },
  title: {
    fontFamily: 'Anton',
    fontSize: 19,
    color: BRAND.ink,
    letterSpacing: 0.4,
    lineHeight: 1.15,
  },
  subtitle: {
    fontSize: 7.6,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: BRAND.ember,
    fontWeight: 700,
    marginTop: 4,
  },
  rule: { height: 2.5, backgroundColor: BRAND.ember, marginBottom: 16 },

  /* parties and details */
  panel: {
    borderWidth: 1,
    borderColor: BRAND.rule,
    padding: 12,
    marginBottom: 14,
  },
  panelHead: {
    fontSize: 7.4,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: 700,
    color: BRAND.ember,
    marginBottom: 8,
  },
  columns: { flexDirection: 'row' },
  column: { flex: 1, paddingRight: 14 },
  partyRole: {
    fontSize: 7,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: BRAND.muted,
    fontWeight: 700,
    marginBottom: 3,
  },
  partyName: { fontSize: 11.5, fontWeight: 700, color: BRAND.ink, marginBottom: 3, lineHeight: 1.3 },
  partyMeta: { fontSize: 8.4, color: BRAND.muted, lineHeight: 1.45 },

  factRow: { flexDirection: 'row', marginBottom: 3.5 },
  factKey: {
    width: 108,
    fontSize: 7.6,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: BRAND.muted,
    fontWeight: 700,
    paddingTop: 1.2,
  },
  factValue: { flex: 1, fontSize: 9.2, color: BRAND.body, lineHeight: 1.4 },

  note: {
    marginBottom: 14,
    paddingLeft: 9,
    borderLeftWidth: 2.5,
    borderLeftColor: BRAND.rust,
    fontSize: 8.4,
    color: BRAND.muted,
    lineHeight: 1.45,
  },

  /* document body */
  docTitle: {
    fontFamily: 'Anton',
    fontSize: 12,
    color: BRAND.ink,
    marginBottom: 8,
  },
  heading: {
    fontSize: 8.4,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: BRAND.rust,
    lineHeight: 1.3,
    marginTop: 13,
    marginBottom: 4,
  },
  runBold: { fontWeight: 700 },
  paragraph: { marginBottom: 7 },
  lead: { marginBottom: 10, color: BRAND.body },
  emphasis: { marginBottom: 7, fontWeight: 700 },
  listItem: { flexDirection: 'row', marginBottom: 4.5, paddingLeft: 4 },
  listMarker: { width: 16, fontWeight: 700, color: BRAND.muted },
  listBody: { flex: 1 },

  /* The conspicuous provisions. Bold, capitals, larger than the body copy
     around it, on a contrasting field inside a heavy border, which is the same
     set of signals the screen version uses and the same set Tex. Bus. & Com.
     Code 1.201(b)(10) recognises. Do not soften. */
  box: {
    borderWidth: 3,
    borderColor: BRAND.ember,
    backgroundColor: BRAND.emberField,
    padding: 11,
    marginTop: 9,
    marginBottom: 12,
  },
  boxHead: {
    fontSize: 8.6,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: BRAND.ember,
    borderBottomWidth: 1.5,
    borderBottomColor: BRAND.ember,
    paddingBottom: 5,
    marginBottom: 7,
  },
  boxText: {
    fontSize: 10.2,
    fontWeight: 700,
    color: BRAND.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.15,
    marginBottom: 6,
  },

  /* execution */
  execution: {
    marginTop: 20,
    borderWidth: 2,
    borderColor: BRAND.ink,
    padding: 14,
  },
  executionHead: {
    fontFamily: 'Anton',
    fontSize: 11,
    color: BRAND.ink,
    marginBottom: 2,
  },
  signature: {
    fontFamily: 'Yellowtail',
    fontSize: 27,
    color: BRAND.ink,
    marginTop: 12,
    marginBottom: 2,
  },
  signatureRule: {
    borderBottomWidth: 1,
    borderBottomColor: BRAND.ink,
    marginBottom: 4,
  },
  ueta: {
    marginTop: 12,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: BRAND.rule,
    fontSize: 8.2,
    color: BRAND.muted,
    lineHeight: 1.45,
  },

  /* The running footer.

     Separate absolutely positioned boxes rather than one flex row, each given
     an explicit width: a positioned box in this renderer takes no width from
     its content, and a row of them collapses to nothing at all.

     The page number goes through a View with a render callback rather than a
     Text with one. A Text produced per page has no content when the page is
     measured, and the page's line height multiplies that to a line box of
     zero, so it is never painted. A View is sized in its own right and the
     Text it returns is laid out inside that. */
  footerRule: {
    position: 'absolute',
    bottom: 33,
    left: PAGE.margin,
    width: CONTENT_WIDTH,
    height: 1,
    backgroundColor: BRAND.rule,
  },
  footerText: {
    fontSize: 7,
    letterSpacing: 0.5,
    lineHeight: 1.4,
    color: BRAND.muted,
  },
  footerLeft: {
    position: 'absolute',
    bottom: 21,
    left: PAGE.margin,
    width: CONTENT_WIDTH * 0.42,
    // A long name shortens rather than wrapping up over the rule.
    maxLines: 1,
    textOverflow: 'ellipsis',
  },
  footerPage: {
    position: 'absolute',
    bottom: 21,
    left: PAGE.margin + CONTENT_WIDTH * 0.42,
    width: CONTENT_WIDTH * 0.22,
    height: 10,
  },
  footerCentre: { textAlign: 'center' },
  footerRight: {
    position: 'absolute',
    bottom: 21,
    left: PAGE.margin + CONTENT_WIDTH * 0.64,
    width: CONTENT_WIDTH * 0.36,
    textAlign: 'right',
    maxLines: 1,
    textOverflow: 'ellipsis',
  },
});

/* ------------------------------------------------------------ components */

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factKey}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

/** The brand block at the top of page one. */
export function Masthead({
  logo,
  title,
  subtitle,
}: {
  logo: Buffer | null;
  title: string;
  /* Nodes, not a string. This renderer lays out each child of a Text as its
     own positioned run, so "a · b · c" written as three children and the same
     sentence written as one interpolated string are different objects in the
     file even though they read identically. Callers pass their children
     through unchanged so a document's bytes do not move when it is rewired to
     use this component. */
  subtitle: React.ReactNode;
}) {
  return (
    <>
      <View style={styles.masthead} fixed={false}>
        {logo ? <Image style={styles.logo} src={logo} /> : null}
        <View style={styles.mastheadText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>
      <View style={styles.rule} />
    </>
  );
}

/**
 * Every page says whose document it is, which version, and where it sits in the
 * whole, so a page separated from the rest is still identifiable and a missing
 * one is obvious.
 */
export function Footer({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <>
      <View style={styles.footerRule} fixed />
      <Text style={[styles.footerText, styles.footerLeft]} fixed>
        {left}
      </Text>
      <View
        style={styles.footerPage}
        fixed
        render={(args) => {
          /* A View's render callback is handed the same page counters a Text's
             is; only the Text one is described in the typings. */
          const { pageNumber, totalPages } = args as unknown as {
            pageNumber: number;
            totalPages: number;
          };
          return (
            <Text style={[styles.footerText, styles.footerCentre]}>
              {`Page ${pageNumber} of ${totalPages}`}
            </Text>
          );
        }}
      />
      <Text style={[styles.footerText, styles.footerRight]} fixed>
        {right}
      </Text>
    </>
  );
}

/** The date a document was produced, in Central, for the footer. */
export function generatedLabel(at: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(at);
}

/* ---------------------------------------------- the plain block documents */

/**
 * The shape the program terms and the volunteer waiver are authored in.
 *
 * Deliberately not the vendor agreement's shape. That document is written in
 * rich runs so a single sentence can carry bold inside it, which it needs
 * because it defines terms mid paragraph. These two are plain text per block,
 * and widening them to runs to share one renderer would be adding a capability
 * to two documents so that a third could stop having its own.
 */
export type PlainBlock = {
  kind: 'heading' | 'paragraph' | 'list' | 'conspicuous';
  text?: string;
  items?: string[];
};

/**
 * Render a plain block document.
 *
 * The conspicuous blocks get the same box the vendor agreement's do: heavy
 * border, contrasting field, bold, capitals, larger than the body around it.
 * That is not decoration. The release in the volunteer waiver and the forfeit
 * in the program terms both have to satisfy the Texas fair notice doctrine's
 * conspicuousness limb, and a version of the document that flattens them on
 * paper is a weaker instrument than the one that was signed on screen.
 *
 * They are uppercased here rather than trusted to arrive that way, so a block
 * marked conspicuous cannot be quietly less conspicuous than its neighbours.
 */
export function PlainBlocks({ blocks }: { blocks: readonly PlainBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.kind === 'heading') {
          return (
            <Text key={i} style={styles.heading} minPresenceAhead={40}>
              {block.text}
            </Text>
          );
        }

        if (block.kind === 'list') {
          return (
            <View key={i} style={{ marginBottom: 6 }}>
              {(block.items ?? []).map((item, j) => (
                <View key={j} style={styles.listItem} wrap={false}>
                  <Text style={styles.listMarker}>•</Text>
                  <Text style={styles.listBody}>{item}</Text>
                </View>
              ))}
            </View>
          );
        }

        if (block.kind === 'conspicuous') {
          /* wrap={false} keeps a conspicuous block whole. A release split
             across a page break is a release a reader can miss half of, which
             is the argument the box exists to foreclose. */
          return (
            <View key={i} style={styles.box} wrap={false}>
              <Text style={styles.boxText}>{(block.text ?? '').toUpperCase()}</Text>
            </View>
          );
        }

        return (
          <Text key={i} style={styles.paragraph}>
            {block.text}
          </Text>
        );
      })}
    </>
  );
}

/**
 * The electronic signature block.
 *
 * The same treatment on all three documents, because it is the same claim on
 * all three: this person typed this name into this field at this time, from
 * this address, on this device, against this version. That set of facts is
 * what makes the document evidence rather than a printout, so it is laid out
 * identically wherever it appears and never abbreviated.
 *
 * `facts` is the record itself. `secondary` is for a document signed by two
 * people, which today means a minor's waiver: the volunteer signs and a parent
 * or guardian signs, and both signatures have to be on the page or the second
 * one is not on the record at all.
 */
export function Execution({
  heading,
  intro,
  signatureName,
  signatureCaption,
  facts,
  secondary,
  ueta,
}: {
  heading: string;
  intro: string;
  signatureName: string;
  signatureCaption: string;
  facts: { label: string; value: string }[];
  secondary?: { name: string; caption: string; facts: { label: string; value: string }[] };
  ueta: React.ReactNode;
}) {
  return (
    <View style={styles.execution} wrap={false}>
      <Text style={styles.executionHead}>{heading}</Text>
      <Text style={styles.partyMeta}>{intro}</Text>

      <Text style={styles.signature}>{signatureName}</Text>
      <View style={styles.signatureRule} />
      <Text style={styles.partyRole}>{signatureCaption}</Text>

      {secondary ? (
        <>
          <Text style={styles.signature}>{secondary.name}</Text>
          <View style={styles.signatureRule} />
          <Text style={styles.partyRole}>{secondary.caption}</Text>
        </>
      ) : null}

      <View style={{ marginTop: 12 }}>
        {facts.map((f) => (
          <Fact key={f.label} label={f.label} value={f.value} />
        ))}
        {secondary
          ? secondary.facts.map((f) => <Fact key={`g-${f.label}`} label={f.label} value={f.value} />)
          : null}
      </View>

      <Text style={styles.ueta}>{ueta}</Text>
    </View>
  );
}
