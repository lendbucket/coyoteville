import 'server-only';
import path from 'node:path';
import fs from 'node:fs';
import React from 'react';
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { AgreementBlock, AgreementRun } from './types';
import type { AgreementVersionRecord } from './registry';
import {
  amountLabel,
  bookingLabel,
  paymentMethodLabel,
  signedAtLabel,
  signedDateLabel,
  spotTypeLabel,
  type SignedAgreementRow,
} from './record';

/**
 * The signed agreement as a PDF.
 *
 * This is a legal artifact, not a report. Three things follow from that and
 * none of them are negotiable:
 *
 * 1. The body is the version on the vendor's row, resolved through the
 *    registry. Never the current text.
 * 2. The conspicuous provisions stay conspicuous. Texas will not enforce an
 *    indemnity covering a party's own negligence unless a reasonable person
 *    ought to have noticed it, so the boxes keep their border, their bold,
 *    their capitals and their larger size on paper exactly as they had them on
 *    screen. Flattening them to body copy would defeat the purpose of printing
 *    the thing.
 * 3. The counterparty is the one that was contracting when that version was
 *    live, which is not always the one contracting today.
 */

/* --------------------------------------------------------------- assets */

const BRAND = {
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
const PAGE = { width: 612, margin: 52 };
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

const ASSET_ROOT = path.join(process.cwd(), 'lib', 'agreement', 'fonts');
const LOGO = path.join(process.cwd(), 'public', 'logo.png');

/**
 * Fonts are read off disk rather than fetched, so a PDF produced during a
 * network blip is the same document as one produced on a good day. next.config
 * traces this directory and the logo into the function bundle; if that trace is
 * ever dropped these throw at render time rather than silently substituting
 * Helvetica for the signature.
 */
let registered = false;
function registerFonts(): void {
  if (registered) return;

  Font.register({
    family: 'Karla',
    fonts: [
      { src: path.join(ASSET_ROOT, 'Karla-Regular.ttf'), fontWeight: 400 },
      { src: path.join(ASSET_ROOT, 'Karla-Bold.ttf'), fontWeight: 700 },
    ],
  });
  Font.register({ family: 'Anton', src: path.join(ASSET_ROOT, 'Anton-Regular.ttf') });
  Font.register({ family: 'Yellowtail', src: path.join(ASSET_ROOT, 'Yellowtail-Regular.ttf') });

  /* Long unbroken strings in the record, a user agent above all, otherwise run
     off the edge of the page instead of wrapping. */
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}

/* ---------------------------------------------------------------- styles */

const styles = StyleSheet.create({
  /**
   * Leading is set here and only here.
   *
   * A paragraph in this document is a Text wrapping one more Text per bold run.
   * Set the line height on either of those and the two contributions add up:
   * the lines come out at nearly double. Inherited from the Page it is applied
   * once, to the line, which is the layout this document is set in.
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
  title: { fontFamily: 'Anton', fontSize: 19, color: BRAND.ink, letterSpacing: 0.4, lineHeight: 1.15 },
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

  /* agreement body */
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
    // A long business name shortens rather than wrapping up over the rule.
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

/** Bold runs stay bold; a break run is a hard newline. */
function Runs({ runs, upper }: { runs: AgreementRun[]; upper?: boolean }) {
  /* No leading here. These sit inside a paragraph Text, and a line height on
     both levels adds up rather than overriding. See the note on `page`. */
  return (
    <>
      {runs.map((run, i) =>
        run.break ? (
          <Text key={i}>{'\n'}</Text>
        ) : (
          <Text key={i} style={run.bold && !upper ? styles.runBold : undefined}>
            {upper ? run.text.toUpperCase() : run.text}
          </Text>
        )
      )}
    </>
  );
}

/**
 * `inBox` carries the conspicuous treatment down into nested paragraphs. Inside
 * a box everything is already bold and uppercase, so a bold run has nothing
 * left to add and is not marked again.
 */
function Blocks({ blocks, inBox }: { blocks: AgreementBlock[]; inBox?: boolean }) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.kind === 'counterparty') return null;

        if (block.kind === 'heading') {
          return (
            <Text key={i} style={styles.heading} minPresenceAhead={40}>
              {block.text}
            </Text>
          );
        }

        if (block.kind === 'paragraph') {
          const style = inBox
            ? styles.boxText
            : block.lead
              ? [styles.paragraph, styles.lead]
              : block.emphasis
                ? styles.emphasis
                : styles.paragraph;
          return (
            <Text key={i} style={style}>
              <Runs runs={block.runs} upper={inBox} />
            </Text>
          );
        }

        if (block.kind === 'list') {
          return (
            <View key={i} style={{ marginBottom: 6 }}>
              {block.items.map((item, j) => (
                <View key={j} style={styles.listItem} wrap={false}>
                  <Text style={styles.listMarker}>{block.ordered ? `${j + 1}.` : '•'}</Text>
                  <Text style={styles.listBody}>
                    <Runs runs={item} />
                  </Text>
                </View>
              ))}
            </View>
          );
        }

        /* wrap={false} keeps a conspicuous block whole. A release split across
           a page break is a release a reader can miss half of, which is the
           argument the box exists to foreclose. */
        return (
          <View key={i} style={styles.box} wrap={false}>
            {block.heading ? <Text style={styles.boxHead}>{block.heading}</Text> : null}
            <Blocks blocks={block.blocks} inBox />
          </View>
        );
      })}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factKey}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function AgreementPdf({
  row,
  record,
  generatedAt,
  logo,
}: {
  row: SignedAgreementRow;
  record: AgreementVersionRecord;
  generatedAt: Date;
  logo: Buffer | null;
}) {
  const generated = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(generatedAt);

  return (
    <Document
      title={`Vendor Participation Agreement ${record.version} — ${row.business_name}`}
      author={record.entity}
      subject={`Signed ${record.version}, executed electronically by ${row.signature_name}`}
      creator="Coyoteville vendor tracker"
      producer="Coyoteville vendor tracker"
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.masthead} fixed={false}>
          {logo ? <Image style={styles.logo} src={logo} /> : null}
          <View style={styles.mastheadText}>
            <Text style={styles.title}>VENDOR PARTICIPATION AGREEMENT</Text>
            <Text style={styles.subtitle}>
              Signed record · {record.version} · {row.business_name}
            </Text>
          </View>
        </View>
        <View style={styles.rule} />

        <View style={styles.panel}>
          <Text style={styles.panelHead}>This agreement is between</Text>
          <View style={styles.columns}>
            <View style={styles.column}>
              <Text style={styles.partyRole}>Coyoteville</Text>
              <Text style={styles.partyName}>{record.entity}</Text>
              <Text style={styles.partyMeta}>
                {record.signer ? `By: ${record.signer.name}, ${record.signer.title}\n` : ''}
                {record.entityAddress}
              </Text>
            </View>
            <View style={styles.column}>
              <Text style={styles.partyRole}>Vendor</Text>
              <Text style={styles.partyName}>{row.business_name}</Text>
              <Text style={styles.partyMeta}>
                {row.contact_name}
                {'\n'}
                {row.email}
                {'\n'}
                {row.phone}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelHead}>Booking</Text>
          <Fact label="Business" value={row.business_name} />
          <Fact label="Contact" value={row.contact_name} />
          <Fact label="Phone" value={row.phone} />
          <Fact label="Email" value={row.email} />
          <Fact label="Spot type" value={spotTypeLabel(row.spot_type)} />
          <Fact label="Booked" value={bookingLabel(row)} />
          {row.spot_number ? <Fact label="Spot number" value={row.spot_number} /> : null}
          <Fact label="Amount paid" value={amountLabel(row)} />
          <Fact label="Payment method" value={paymentMethodLabel(row)} />
        </View>

        {record.note ? <Text style={styles.note}>{record.note}</Text> : null}

        {record.document.title ? (
          <Text style={styles.docTitle}>{record.document.title}</Text>
        ) : null}

        <Blocks blocks={record.document.blocks} />

        <View style={styles.execution} wrap={false}>
          <Text style={styles.executionHead}>ELECTRONIC SIGNATURE</Text>
          <Text style={styles.partyMeta}>
            Executed by the Vendor under the Texas Uniform Electronic Transactions Act, Chapter 322
            of the Texas Business and Commerce Code.
          </Text>

          <Text style={styles.signature}>{row.signature_name}</Text>
          <View style={styles.signatureRule} />
          <Text style={styles.partyRole}>Vendor signature, typed and submitted electronically</Text>

          <View style={{ marginTop: 12 }}>
            <Fact label="Signed by" value={row.signature_name} />
            <Fact label="On behalf of" value={row.business_name} />
            <Fact label="Signed date" value={signedDateLabel(row.signed_date)} />
            <Fact label="Signed at" value={signedAtLabel(row.signed_at)} />
            <Fact label="Version" value={record.version} />
            <Fact label="Signer IP" value={row.signer_ip ?? 'Not recorded'} />
            <Fact label="User agent" value={row.signer_user_agent ?? 'Not recorded'} />
          </View>

          <Text style={styles.ueta}>
            The Vendor typed the name shown above into the signature field of the Coyoteville vendor
            application and submitted it, agreeing to this Agreement in the version stated. Under
            Tex. Bus. &amp; Com. Code § 322.007, a record or signature may not be denied legal effect
            or enforceability solely because it is in electronic form, and a contract may not be
            denied legal effect or enforceability solely because an electronic record was used in
            its formation. The date, timestamp, agreement version, network address and user agent
            above are the record of that signature as captured at the moment of signing and retained
            by {record.entity}.
          </Text>
        </View>

        {/* Every page says whose agreement it is, which version, and where it
            sits in the whole, so a page separated from the rest is still
            identifiable and a missing one is obvious. */}
        <View style={styles.footerRule} fixed />
        <Text style={[styles.footerText, styles.footerLeft]} fixed>
          {row.business_name} · {record.version}
        </Text>
        <View
          style={styles.footerPage}
          fixed
          render={(args) => {
            /* A View's render callback is handed the same page counters a
               Text's is; only the Text one is described in the typings. */
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
          Generated {generated}
        </Text>
      </Page>
    </Document>
  );
}

/* ------------------------------------------------------------------- api */

let logoCache: Buffer | null | undefined;

function readLogo(): Buffer | null {
  if (logoCache !== undefined) return logoCache;
  try {
    logoCache = fs.readFileSync(LOGO);
  } catch {
    // A missing mark costs the branding, not the document. Everything that
    // makes this a record still renders.
    console.error('agreement pdf: logo.png not readable, rendering without it');
    logoCache = null;
  }
  return logoCache;
}

/** Render one signed agreement. */
export async function renderAgreementPdf(
  row: SignedAgreementRow,
  record: AgreementVersionRecord
): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(
    <AgreementPdf row={row} record={record} generatedAt={new Date()} logo={readLogo()} />
  );
}
