import 'server-only';
import React from 'react';
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { TermsDocument } from '../fundraiser-terms/types';
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
  gameNames,
  orgTermsFileName,
  signedAtLabel,
  statusLabel,
  volunteerLabel,
  type SignedOrgRow,
} from './record';

/**
 * An organization's signed program terms, as a PDF.
 *
 * Printed on the same paper as the vendor agreement and held to the same three
 * rules:
 *
 * 1. The body is the version on the organization's row, resolved through
 *    lib/fundraiser-terms/registry. Never the current text. The program was
 *    renamed once already, which changed the wording inside several clauses,
 *    and an organization that signed under the old name is entitled to a copy
 *    of what it signed rather than what the site says today.
 * 2. The conspicuous provisions stay conspicuous. The forfeit clause is the one
 *    that costs an organization its whole share for a night, and it keeps its
 *    box on paper.
 * 3. The counterparty is the entity that was contracting when that version was
 *    live, carried on the document rather than read from today's constants.
 *
 * The games are listed by name. An archive that says home-game-2026-09-18 is an
 * archive somebody has to decode; the organization agreed to work a night, and
 * the night has a name.
 */

function OrgTermsPdf({
  row,
  document: terms,
  games,
  generatedAt,
  logo,
}: {
  row: SignedOrgRow;
  document: TermsDocument;
  games: string[];
  generatedAt: Date;
  logo: Buffer | null;
}) {
  const generated = generatedLabel(generatedAt);
  const signature = row.signature_name ?? 'Not recorded';

  return (
    <Document
      title={`${terms.programName} program terms ${terms.version} — ${row.org_name}`}
      author={terms.entity}
      subject={`Signed ${terms.version}, executed electronically by ${signature}`}
      creator="Coyoteville tracker"
      producer="Coyoteville tracker"
    >
      <Page size="LETTER" style={styles.page}>
        <Masthead
          logo={logo}
          title={`${terms.programName.toUpperCase()} PROGRAM TERMS`}
          subtitle={
            <>
              Signed record · {terms.version} · {row.org_name}
            </>
          }
        />

        <View style={styles.panel}>
          <Text style={styles.panelHead}>These terms are between</Text>
          <View style={styles.columns}>
            <View style={styles.column}>
              <Text style={styles.partyRole}>Coyoteville</Text>
              <Text style={styles.partyName}>{terms.entity}</Text>
              <Text style={styles.partyMeta}>150 North Stadium Road, Alice, Texas 78332</Text>
            </View>
            <View style={styles.column}>
              <Text style={styles.partyRole}>Organization</Text>
              <Text style={styles.partyName}>{row.org_name}</Text>
              <Text style={styles.partyMeta}>
                {row.contact_name}
                {'\n'}
                {row.email}
                {'\n'}
                {row.phone ?? ''}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelHead}>The application</Text>
          <Fact label="Organization" value={row.org_name} />
          <Fact label="Kind" value={row.org_type ?? 'Not stated'} />
          <Fact label="Contact" value={row.contact_name} />
          <Fact label="Email" value={row.email} />
          <Fact label="Phone" value={row.phone ?? 'Not recorded'} />
          <Fact label="Volunteers" value={volunteerLabel(row)} />
          <Fact label="501(c)(3)" value={row.is_501c3 ? 'Yes' : 'Not stated'} />
          {row.ein ? <Fact label="EIN" value={row.ein} /> : null}
          <Fact label="Status" value={statusLabel(row)} />
          <Fact
            label="Games applied for"
            value={games.length ? games.join('\n') : 'None recorded'}
          />
        </View>

        <Text style={styles.docTitle}>{terms.programName} program terms</Text>

        <PlainBlocks blocks={terms.blocks} />

        <Execution
          heading="ELECTRONIC SIGNATURE"
          intro="Executed by the Organization under the Texas Uniform Electronic Transactions Act, Chapter 322 of the Texas Business and Commerce Code."
          signatureName={signature}
          signatureCaption="Organization signature, typed and submitted electronically"
          facts={[
            { label: 'Signed by', value: signature },
            { label: 'On behalf of', value: row.org_name },
            { label: 'Signed at', value: signedAtLabel(row.signed_at) },
            { label: 'Version', value: terms.version },
            { label: 'Signer IP', value: row.signer_ip ?? 'Not recorded' },
            { label: 'User agent', value: row.signer_user_agent ?? 'Not recorded' },
          ]}
          ueta={
            <>
              The person named above typed that name into the signature field of the Coyoteville{' '}
              {terms.programName} application and submitted it, agreeing to these terms in the
              version stated and representing that they were authorized to do so for the
              Organization. Under Tex. Bus. &amp; Com. Code § 322.007, a record or signature may not
              be denied legal effect or enforceability solely because it is in electronic form. The
              timestamp, version, network address and user agent above are the record of that
              signature as captured at the moment of signing and retained by {terms.entity}.
            </>
          }
        />

        <Footer
          left={
            <>
              {row.org_name} · {terms.version}
            </>
          }
          right={<>Generated {generated}</>}
        />
      </Page>
    </Document>
  );
}

/** Render one organization's signed terms. */
export async function renderOrgTermsPdf(
  row: SignedOrgRow,
  terms: TermsDocument
): Promise<Buffer> {
  registerFonts();
  const games = await gameNames(row);
  return renderToBuffer(
    <OrgTermsPdf
      row={row}
      document={terms}
      games={games}
      generatedAt={new Date()}
      logo={readLogo()}
    />
  );
}

export { orgTermsFileName };
