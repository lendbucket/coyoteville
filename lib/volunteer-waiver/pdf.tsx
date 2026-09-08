import 'server-only';
import React from 'react';
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { WaiverDocument } from './types';
import {
  Execution,
  Fact,
  Footer,
  Masthead,
  PlainBlocks,
  generatedLabel,
  readLogo,
  registerFonts,
  styles,
} from '../pdf/chrome';
import {
  birthDateLabel,
  signedAtLabel,
  waiverFileName,
  type SignedWaiverRow,
} from './record';

/**
 * A signed volunteer waiver, as a PDF.
 *
 * The same paper and the same three rules as the vendor agreement: the version
 * on the row rather than the current one, the conspicuous provisions kept
 * conspicuous, and the entity that was releasing when that version was live.
 *
 * The minor case is the reason this document is not just the adult one with an
 * extra field. When a volunteer is under 18 there are two signatures on the
 * record, not one: the volunteer's and their parent or guardian's. Both are
 * printed, both are captioned for what they are, and the guardian's name and
 * phone sit in the facts underneath. A document that showed only the volunteer's
 * name would misstate who agreed to what, on the one document where that
 * question is hardest and matters most.
 */

function WaiverPdf({
  row,
  document: waiver,
  eventName,
  orgName,
  generatedAt,
  logo,
}: {
  row: SignedWaiverRow;
  document: WaiverDocument;
  eventName: string;
  orgName: string | null;
  generatedAt: Date;
  logo: Buffer | null;
}) {
  const generated = generatedLabel(generatedAt);
  const minor = !row.is_adult;

  return (
    <Document
      title={`Volunteer waiver ${waiver.version} — ${row.full_name}`}
      author={waiver.entity}
      subject={`Signed ${waiver.version}, executed electronically by ${row.signature_name}`}
      creator="Coyoteville tracker"
      producer="Coyoteville tracker"
    >
      <Page size="LETTER" style={styles.page}>
        <Masthead
          logo={logo}
          title="VOLUNTEER WAIVER"
          subtitle={
            <>
              Signed record · {waiver.version} · {row.full_name}
            </>
          }
        />

        <View style={styles.panel}>
          <Text style={styles.panelHead}>This waiver is between</Text>
          <View style={styles.columns}>
            <View style={styles.column}>
              <Text style={styles.partyRole}>Released parties</Text>
              <Text style={styles.partyName}>{waiver.entity}</Text>
              <Text style={styles.partyMeta}>150 North Stadium Road, Alice, Texas 78332</Text>
            </View>
            <View style={styles.column}>
              <Text style={styles.partyRole}>Volunteer</Text>
              <Text style={styles.partyName}>{row.full_name}</Text>
              <Text style={styles.partyMeta}>
                {row.phone ?? ''}
                {row.email ? `\n${row.email}` : ''}
                {orgName ? `\nWith ${orgName}` : ''}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelHead}>The shift</Text>
          <Fact label="Volunteer" value={row.full_name} />
          <Fact label="Event" value={eventName} />
          <Fact label="Organization" value={orgName ?? 'None recorded'} />
          <Fact label="Phone" value={row.phone ?? 'Not recorded'} />
          {row.email ? <Fact label="Email" value={row.email} /> : null}
          <Fact label="Date of birth" value={birthDateLabel(row.date_of_birth)} />
          <Fact
            label="Age on the night"
            value={minor ? 'Under 18, guardian signed' : '18 or over'}
          />
          <Fact label="Emergency contact" value={row.emergency_contact_name ?? 'Not recorded'} />
          <Fact label="Emergency phone" value={row.emergency_contact_phone ?? 'Not recorded'} />
        </View>

        {/* Said on the document itself, not only in the terms, because this is
            the page somebody is looking at when they ask why a fifteen year old
            was in the lot. */}
        {minor ? (
          <Text style={styles.note}>
            This volunteer was under 18 on the night of this event. A parent or guardian signed on
            their behalf and confirmed they would be on site for the whole shift. Under the terms
            below, a volunteer under 18 does not direct traffic and does not stand in a traffic lane
            at any time.
          </Text>
        ) : null}

        <Text style={styles.docTitle}>Volunteer waiver and release</Text>

        <PlainBlocks blocks={waiver.blocks} />

        <Execution
          heading="ELECTRONIC SIGNATURE"
          intro="Executed under the Texas Uniform Electronic Transactions Act, Chapter 322 of the Texas Business and Commerce Code."
          signatureName={row.signature_name}
          signatureCaption="Volunteer signature, typed and submitted electronically"
          secondary={
            minor
              ? {
                  name: row.guardian_signature_name ?? 'Not recorded',
                  caption:
                    'Parent or guardian signature, typed and submitted electronically on behalf of the volunteer and on their own behalf',
                  facts: [
                    { label: 'Guardian', value: row.guardian_name ?? 'Not recorded' },
                    { label: 'Guardian phone', value: row.guardian_phone ?? 'Not recorded' },
                    {
                      label: 'Guardian signed',
                      value: row.guardian_signature_name ?? 'Not recorded',
                    },
                  ],
                }
              : undefined
          }
          facts={[
            { label: 'Signed by', value: row.signature_name },
            { label: 'Volunteer', value: row.full_name },
            { label: 'Event', value: eventName },
            { label: 'Signed at', value: signedAtLabel(row.signed_at) },
            { label: 'Version', value: waiver.version },
            { label: 'Signer IP', value: row.signer_ip ?? 'Not recorded' },
            { label: 'User agent', value: row.signer_user_agent ?? 'Not recorded' },
          ]}
          ueta={
            <>
              The name shown above was typed into the signature field of the Coyoteville volunteer
              waiver and submitted, agreeing to this waiver in the version stated.
              {minor
                ? ' A parent or guardian signed on behalf of the volunteer, who was under 18 on the night of the event, and on their own behalf.'
                : ''}{' '}
              Under Tex. Bus. &amp; Com. Code § 322.007, a record or signature may not be denied
              legal effect or enforceability solely because it is in electronic form. The timestamp,
              version, network address and user agent above are the record of that signature as
              captured at the moment of signing and retained by {waiver.entity}.
            </>
          }
        />

        <Footer
          left={
            <>
              {row.full_name} · {waiver.version}
            </>
          }
          right={<>Generated {generated}</>}
        />
      </Page>
    </Document>
  );
}

/** Render one signed waiver. */
export async function renderWaiverPdf(
  row: SignedWaiverRow,
  waiver: WaiverDocument,
  eventName: string,
  orgName: string | null
): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(
    <WaiverPdf
      row={row}
      document={waiver}
      eventName={eventName}
      orgName={orgName}
      generatedAt={new Date()}
      logo={readLogo()}
    />
  );
}

export { waiverFileName };
