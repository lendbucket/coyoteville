/**
 * Coyoteville Vendor Participation Agreement, as the signing page shows it.
 *
 * The words themselves are no longer written here. They live in
 * lib/agreement/versions, one file per version, and this renders the current
 * one. That split exists because a signed row stores the version it agreed to,
 * and the admin tracker produces a PDF of that version years later: two copies
 * of the text, one for the screen and one for the PDF, is exactly how a signed
 * record and the document it points at drift apart.
 *
 * IMPORTANT: bumping the agreement means adding a new file under
 * lib/agreement/versions, pointing lib/agreement/current.ts at it, and adding
 * it to lib/agreement/registry.ts. Never edit a version file in place. Old
 * signatures keep pointing at the language that was actually on screen.
 *
 * The constants below are re-exported from lib/agreement/current so the form
 * and the two application routes keep importing them from one place.
 */
import { Fragment } from 'react';
import { currentDocument } from '@/lib/agreement/current';
import type { AgreementBlock, AgreementRun } from '@/lib/agreement/types';

export {
  AGREEMENT_VERSION,
  AGREEMENT_SECTION_COUNT,
  CONTRACTING_ENTITY,
  CONTRACTING_ENTITY_FULL,
  AUTHORIZED_SIGNER,
  ENTITY_ADDRESS,
} from '@/lib/agreement/current';

import {
  CONTRACTING_ENTITY_FULL as ENTITY_FULL,
  ENTITY_ADDRESS as ADDRESS,
} from '@/lib/agreement/current';

/** Bold runs become <strong>, a break run becomes <br />. */
function Runs({ runs }: { runs: AgreementRun[] }) {
  return (
    <>
      {runs.map((run, i) => (
        <Fragment key={i}>
          {run.break ? <br /> : run.bold ? <strong>{run.text}</strong> : run.text}
        </Fragment>
      ))}
    </>
  );
}

function Blocks({ blocks, vendorName }: { blocks: AgreementBlock[]; vendorName?: string }) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.kind === 'heading') return <h4 key={i}>{block.text}</h4>;

        if (block.kind === 'paragraph') {
          return (
            <p key={i} className={block.lead ? 'agreement__intro' : undefined}>
              <Runs runs={block.runs} />
            </p>
          );
        }

        if (block.kind === 'list') {
          return (
            <ol key={i}>
              {block.items.map((item, j) => (
                <li key={j}>
                  <Runs runs={item} />
                </li>
              ))}
            </ol>
          );
        }

        /* The conspicuous provisions. .agreement__box is what makes them
           conspicuous under Texas law, so the class is not optional styling.
           See the comment above the rule in globals.css. */
        if (block.kind === 'conspicuous') {
          return (
            <div key={i} className="agreement__box">
              {block.heading ? <p className="agreement__boxhd">{block.heading}</p> : null}
              <Blocks blocks={block.blocks} vendorName={vendorName} />
            </div>
          );
        }

        return <Counterparty key={i} vendorName={vendorName} />;
      })}
    </>
  );
}

/* Execution block. Sits above the electronic signature language so the
   counterparty is established before the clause that makes a typed name
   binding. Styled to read as a signature block rather than body copy. */
function Counterparty({ vendorName }: { vendorName?: string }) {
  return (
    <div className="agreement__signing">
      <p className="agreement__signinghd">This agreement is between</p>

      <div className="agreement__parties">
        <div className="agreement__party">
          <span className="agreement__partyrole">Vendor</span>
          <span className="agreement__partyname">
            {vendorName || 'The vendor named in this application'}
          </span>
          <span className="agreement__partymeta">
            As entered on this application, signed electronically below.
          </span>
        </div>

        <div className="agreement__party">
          <span className="agreement__partyrole">Coyoteville</span>
          <span className="agreement__partyname agreement__partyname--signature">
            Robert Reyna
          </span>
          <span className="agreement__partymeta">
            Chief Executive Officer, Authorized Signer
            <br />
            {ENTITY_FULL}
            <br />
            {ADDRESS}
          </span>
        </div>
      </div>
    </div>
  );
}

export function VendorAgreement({ vendorName }: { vendorName?: string } = {}) {
  return (
    <div className="agreement">
      <Blocks blocks={currentDocument.blocks} vendorName={vendorName} />
    </div>
  );
}
