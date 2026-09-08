import 'server-only';
import React from 'react';
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { AgreementBlock, AgreementRun } from './types';
import type { AgreementVersionRecord } from './registry';
import {
  BRAND,
  Fact,
  Footer,
  Masthead,
  generatedLabel,
  readLogo,
  registerFonts,
  styles,
} from '../pdf/chrome';
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
 *
 * The paper it is printed on lives in lib/pdf/chrome: palette, fonts, styles,
 * masthead and footer, shared with the organization terms and the volunteer
 * waiver. What stays here is the part that is only true of this document, which
 * is the rich run and block structure the vendor agreement is authored in.
 */

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
  const generated = generatedLabel(generatedAt);

  return (
    <Document
      title={`Vendor Participation Agreement ${record.version} — ${row.business_name}`}
      author={record.entity}
      subject={`Signed ${record.version}, executed electronically by ${row.signature_name}`}
      creator="Coyoteville vendor tracker"
      producer="Coyoteville vendor tracker"
    >
      <Page size="LETTER" style={styles.page}>
        <Masthead
          logo={logo}
          title="VENDOR PARTICIPATION AGREEMENT"
          subtitle={
            <>
              Signed record · {record.version} · {row.business_name}
            </>
          }
        />

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

        <Footer
          left={
            <>
              {row.business_name} · {record.version}
            </>
          }
          right={<>Generated {generated}</>}
        />
      </Page>
    </Document>
  );
}

/* ------------------------------------------------------------------- api */

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
