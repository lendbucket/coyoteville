/**
 * Coyoteville Vendor Participation Agreement
 * Single source of truth for the agreement text shown and signed on the site.
 *
 * IMPORTANT: bump AGREEMENT_VERSION whenever any word of this changes.
 * Signed rows store the version they agreed to, which is what keeps old
 * signatures pointing at the language that was actually on screen.
 */

/**
 * v3.0-2026 changed the contracting entity from Reyna Title LLC d/b/a
 * Coyoteville to Coyoteville Alice LLC. That is a different legal counterparty,
 * which is precisely what this version string exists to record: anything signed
 * under v2.0-2026 contracted with the old entity and must keep pointing there.
 *
 * v4.0-2026 adds section 3, Application Review, Cancellation, and Refunds, and
 * with it the rule that payment buys a place in the review queue rather than a
 * spot. That changes what a vendor is actually buying when they pay, so it is a
 * major bump and nothing signed under v3.1-2026 is treated as having agreed to
 * it. Sections 3 through 18 shifted down to 4 through 19; the text of those
 * sections is unchanged apart from the cross reference added to section 2.
 *
 * v5.0-2026 adds section 4, Recurring Monthly Spots, for the permanent spot
 * billed as a Square subscription. It is a major bump because it introduces an
 * ongoing payment obligation that no earlier version described, and because the
 * cancellation rule for a subscription is genuinely different from the one for
 * a single date: a monthly vendor who cancels keeps the spot to the end of the
 * period they have paid for, where a single date vendor who cancels simply
 * forfeits the fee. Sections 4 through 19 shifted down to 5 through 20.
 */
export const AGREEMENT_VERSION = "v5.0-2026";

/**
 * How many numbered sections the agreement has. The form tells the vendor to
 * read all of them and says the number out loud, in two places, so it is read
 * from here rather than typed in as a literal that goes stale the next time a
 * section is added.
 */
export const AGREEMENT_SECTION_COUNT = 20;

export const CONTRACTING_ENTITY = "Coyoteville Alice LLC";
export const CONTRACTING_ENTITY_FULL =
  "Coyoteville Alice LLC, a Texas limited liability company";
export const AUTHORIZED_SIGNER = "Robert Reyna, Chief Executive Officer";
export const ENTITY_ADDRESS = "150 North Stadium Road, Alice, Texas 78332";

export function VendorAgreement({ vendorName }: { vendorName?: string } = {}) {
  return (
    <div className="agreement">
      <p className="agreement__intro">
        This Vendor Participation Agreement, referred to as this Agreement, is entered into
        between <strong>Coyoteville Alice LLC, a Texas limited liability company, doing business
        as Coyoteville</strong>, together with its owners, members, managers, officers, employees,
        agents, contractors, volunteers, affiliated and related entities, and the owner of the real
        property located at 150 North Stadium Road, Alice, Texas, all of whom are collectively
        referred to as the <strong>Released Parties</strong>, and the vendor identified in this
        application, referred to as <strong>Vendor</strong>. This Agreement governs Vendor&apos;s
        participation in any event held at Coyoteville and remains in effect for every event
        Vendor participates in unless replaced by a later version.
      </p>

      <h4>1. Independent Business Relationship</h4>
      <p>
        Vendor is an independent business operating for its own account and at its own risk.
        Nothing in this Agreement creates a partnership, joint venture, employment, agency,
        franchise, or landlord and tenant relationship between Vendor and Coyoteville. Vendor
        controls its own operations, personnel, pricing, products, hours of service, and methods of
        work. Vendor is solely responsible for its own taxes, employment obligations, workers
        compensation coverage, and regulatory compliance. Coyoteville provides space only and does
        not supervise, direct, or control Vendor&apos;s business.
      </p>

      <h4>2. Space, Fees, and Placement</h4>
      <p>
        Coyoteville grants Vendor a revocable, non exclusive, non transferable license to occupy an
        assigned space for the duration of the event only. This is a license to occupy, not a
        lease, and conveys no tenancy, possessory interest, or property right of any kind. Space
        assignment, size, and location are determined solely by Coyoteville and may be changed at
        any time. Fees are due in advance. Payment does not reserve or confirm a space; it places
        Vendor&apos;s application into the review queue described in Section 3, and a space exists
        only once Coyoteville has approved that application. Except as expressly provided in
        Section 3, fees are non refundable. Coyoteville charges no commission and takes no
        percentage of Vendor&apos;s sales. Vendor may not sublet, share, transfer, or assign its
        space to any other business without prior written consent.
      </p>

      <h4>3. Application Review, Cancellation, and Refunds</h4>
      <div className="agreement__box">
        <p className="agreement__boxhd">Read this before you pay</p>
        <p>
          <strong>
            Payment reserves Vendor&apos;s place in the review queue. It does not confirm a spot.
          </strong>{" "}
          Every application is reviewed by Coyoteville, ordinarily within forty eight hours of
          payment. Vendor has a space only when Coyoteville sends written approval. Until then no
          space is held for Vendor, no placement is assigned, and Vendor should not rely on
          participating in the event.
        </p>
        <p>
          <strong>
            If Coyoteville denies an application, the fee is refunded in full, automatically.
          </strong>{" "}
          Vendor does not have to request it. The refund is issued to the original payment method
          and typically takes five to ten business days to appear, which is a function of
          Vendor&apos;s card issuer and bank rather than of Coyoteville.{" "}
          <strong>
            Approval is at the sole discretion of Coyoteville and no reason is required.
          </strong>{" "}
          Coyoteville may decline any application for any reason or for no reason, including the
          mix of vendors already accepted for a date, and a denial is not a statement about
          Vendor&apos;s business.
        </p>
      </div>
      <p>
        <strong>If Vendor cancels, the fee is not refunded, for any reason.</strong> That includes
        illness, staffing, weather, vehicle or equipment failure, a competing booking, a change of
        mind, and simply not attending. This applies however far in advance Vendor cancels.
      </p>
      <p>
        <strong>
          A spot is sold for one specific date and carries no credit, transfer, or rain check
          toward any other date.
        </strong>{" "}
        A paid space is held out of a limited number for that date and is not resold once Vendor
        cancels, so the fee is not moved to a future event, is not held on account, is not
        exchanged for a different spot type, and is not transferable to another business.
      </p>
      <p>
        The two rules in this section are distinct and are not in conflict. A refund arises only
        where Coyoteville declines to accept Vendor, which is Coyoteville&apos;s decision. No
        refund arises where Vendor withdraws after being accepted, which is Vendor&apos;s decision.
        Nothing in this section entitles Vendor to a refund in any circumstance addressed by
        Section 5, Section 10, or Section 15, under which fees are not refunded.
      </p>
      <p>
        This section governs a single date, whether an event date or an ordinary open day.
        Recurring monthly spots are governed by Section 4, which sets out its own cancellation
        rule, and where the two differ Section 4 controls for a monthly spot.
      </p>

      <h4>4. Recurring Monthly Spots</h4>
      <div className="agreement__box">
        <p className="agreement__boxhd">Read this before you start a monthly spot</p>
        <p>
          A permanent spot is a <strong>recurring monthly subscription</strong>. Vendor authorizes
          Coyoteville, through its payment processor, to store Vendor&apos;s card and{" "}
          <strong>
            charge the monthly fee automatically to that card every month, without further notice or
            further authorization, until Vendor cancels.
          </strong>{" "}
          The fee is stated on the signup form before Vendor authorizes it, and the first charge is
          taken when the application is approved, not when it is submitted.
        </p>
        <p>
          The term is one month and{" "}
          <strong>renews automatically for a further month on each billing date</strong> until
          cancelled. Each renewal is charged to the card on file on the same day of the month,
          falling back to the last day of a shorter month.
        </p>
      </div>
      <p>
        <strong>A permanent spot is a license to occupy, renewed monthly.</strong> It is not a
        lease, a rental agreement, a tenancy, or any possessory or property interest in the
        premises, and it creates no landlord and tenant relationship of any kind. Vendor acquires no
        right of occupancy beyond the month it has paid for, no right to any particular space, and
        no right to remain on the premises after this Agreement ends. Everything in Section 2 about
        placement being determined solely by Coyoteville applies to a permanent spot in the same
        way.
      </p>
      <p>
        <strong>
          Cancellation takes effect at the end of the paid period and never in the middle of one.
        </strong>{" "}
        Vendor may cancel at any time by emailing or telephoning Coyoteville using the contact
        details on the site. Cancelling stops the next renewal. Vendor keeps the spot for the
        remainder of the month already paid for and{" "}
        <strong>no partial month is refunded, prorated, or credited</strong>, whatever date within
        the month Vendor cancels on. Coyoteville may likewise end a monthly spot at the end of any
        paid period.
      </p>
      <p>
        <strong>If a monthly charge fails</strong>, Coyoteville and its payment processor may
        reattempt the charge over the following days. Vendor remains responsible for the fee.
        Coyoteville will notify Vendor at the email address on the application so the card can be
        corrected, and Vendor keeps the spot through the period already paid for while the failure
        is resolved. If payment is not completed, Coyoteville may suspend or end the monthly spot
        at the end of the paid period and release the space to another vendor. Coyoteville is not
        obliged to hold a space against unpaid fees.
      </p>
      <p>
        Section 3 continues to apply to a monthly application in every respect other than
        cancellation: it goes through the same review, no space exists until it is approved, and{" "}
        <strong>
          if Coyoteville denies a monthly application no charge is ever taken and the stored card is
          released
        </strong>
        , so there is nothing to refund. The two rules do not conflict. A denial by Coyoteville
        means Vendor was never billed. A cancellation by Vendor means Vendor was billed for the
        month it cancelled in and keeps that month.
      </p>
      <p>
        Coyoteville may change the monthly fee on thirty days written notice to the email address on
        the application. Vendor&apos;s remedy if it does not accept a change is to cancel before the
        next renewal, which Vendor may do at any time under this section.
      </p>

      <h4>5. Permits, Licenses, and Food Handler Certification</h4>
      <p>
        Vendor is solely responsible for obtaining, maintaining, and producing on demand every
        permit, license, certification, and registration required for its operation by the City of
        Alice, Jim Wells County, the Texas Department of State Health Services, the Texas
        Comptroller of Public Accounts, and any other authority with jurisdiction. Without
        limitation, Vendor represents and warrants that it holds all of the following that apply to
        its operation:
      </p>
      <ol>
        <li>
          <strong>
            A current health permit issued by the Texas Department of State Health Services for
            every mobile food unit.
          </strong>{" "}
          Any Vendor operating a food truck or other mobile food unit must hold a current DSHS
          mobile food unit permit, must upload it as a condition of registering, and must have it
          physically present at the event. A temporary food establishment permit issued by the
          applicable health authority is required for any other Vendor preparing, handling, or
          serving food or beverages.
        </li>
        <li>
          <strong>
            A valid Texas accredited food handler certificate for every individual who handles food
            at the event.
          </strong>{" "}
          Vendor will have proof of certification physically present at the event for each such
          person and will produce it immediately upon request by Coyoteville or any health or code
          official.
        </li>
        <li>
          A Certified Food Manager certification where required by the applicable health authority
          for the type of operation Vendor conducts.
        </li>
        <li>
          A Texas Sales and Use Tax Permit, with Vendor solely responsible for collecting and
          remitting all applicable sales tax on its own sales.
        </li>
        <li>
          Any commissary agreement, fire marshal inspection, propane inspection, or vehicle
          registration required for a mobile food unit.
        </li>
      </ol>
      <p>
        Vendor understands and agrees that Coyoteville does not verify, review, approve, or assume
        any responsibility for Vendor&apos;s permits or certifications, and that Coyoteville&apos;s
        failure to request or inspect them does not waive Vendor&apos;s obligation to hold them.{" "}
        <strong>
          Vendor may not operate without every required permit and certification, and Coyoteville
          may immediately remove any Vendor found operating without them, with no refund of fees.
        </strong>
      </p>

      <h4>6. Insurance</h4>
      <p>
        Vendor will obtain and maintain at its own expense, for the entire time it is on the
        premises, commercial general liability insurance covering bodily injury, property damage,
        personal injury, and products and completed operations arising out of Vendor&apos;s
        operations, with limits of not less than{" "}
        <strong>one million dollars per occurrence and two million dollars in the aggregate</strong>
        . Vendor will also maintain any auto liability coverage required for its vehicles and
        trailers, and workers compensation coverage as required by law for its employees. Upon
        request, Vendor will provide a certificate of insurance naming Coyoteville Alice LLC and
        the property owner as additional insureds. Vendor&apos;s insurance is primary and non
        contributory as to any coverage held by the Released Parties. Vendor waives all rights of
        subrogation against the Released Parties to the extent permitted by its policies.
        Vendor&apos;s failure to maintain insurance does not relieve Vendor of any obligation under
        this Agreement, including its indemnification obligations.
      </p>

      <h4>7. Equipment, Fire Safety, and Utilities</h4>
      <p>
        Vendor supplies all of its own equipment, including tent, canopy, weights or anchors,
        tables, chairs, signage, lighting, generator, fuel, potable water, refrigeration, cooking
        appliances, and serving supplies. Coyoteville supplies space only and provides no power,
        water, refrigeration, ice, propane, waste disposal, tables, or equipment of any kind unless
        separately agreed in writing.
      </p>
      <p>
        Vendor will comply with all fire safety requirements and will maintain on site, at its own
        space, a current and properly rated fire extinguisher appropriate to its cooking method,
        including a Class K extinguisher where the operation involves cooking oils or fats. Vendor
        is solely responsible for the safe transport, storage, connection, and use of propane, fuel,
        and any open flame or heat producing equipment, for maintaining safe clearances from tents,
        structures, vehicles, and the public, and for securing all canopies and tents against wind.
        Vendor will comply immediately with any direction from Coyoteville, the fire marshal, or any
        code official concerning the safety of its setup.
      </p>

      <h4>8. Food Safety and Sanitation</h4>
      <p>
        Vendor is solely responsible for the safety, handling, temperature control, storage,
        preparation, labeling, and service of every product it sells or distributes, including
        compliance with the Texas Food Establishment Rules. Vendor will maintain handwashing
        capability and sanitizer at its space as required for its operation.{" "}
        <strong>
          Vendor bears sole and complete responsibility for any foodborne illness, allergic
          reaction, contamination, injury, or claim arising from any product Vendor sells, prepares,
          samples, gives away, or serves, and the Released Parties bear none.
        </strong>
      </p>

      <h4>9. Waste, Gray Water, and Grease</h4>
      <p>
        Discharging gray water, wastewater, grease, cooking oil, ice melt containing food residue,
        or any other liquid waste onto the ground, into storm drains, or anywhere on or near the
        premises is strictly prohibited. Vendor will contain and remove all such waste from the
        premises for lawful disposal off site. Vendor will remove all trash, packaging, food waste,
        and debris from its space at the end of each event and leave the space in the condition it
        was found. Vendor is responsible for the full cost of any cleanup, remediation,
        environmental response, or repair necessitated by its operation, including any fine or
        penalty assessed against Coyoteville as a result.
      </p>

      <h4>10. Conduct, Compliance, and Removal</h4>
      <p>
        Vendor and its personnel will conduct themselves professionally and lawfully at all times,
        will comply with all applicable federal, state, and local laws and ordinances, including
        noise, signage, and health regulations, and will follow all reasonable directions from
        Coyoteville staff. Vendor will not sell, distribute, or possess alcohol, cannabis or hemp
        derived intoxicants, tobacco or vape products, weapons, fireworks, counterfeit merchandise,
        or any unlawful item, and will not sell alcohol under any circumstance without prior written
        approval from Coyoteville and all required TABC permitting.{" "}
        <strong>
          Coyoteville may remove any Vendor from the premises at any time, with no refund, for any
          violation of this Agreement, any unsafe condition, any conduct Coyoteville reasonably
          determines is disruptive or harmful to the event, or any failure to hold required permits
          or certifications.
        </strong>
      </p>

      <h4>11. Security and Personal Property</h4>
      <p>
        Coyoteville provides no security, surveillance, storage, or safekeeping of any kind. All
        property Vendor brings to the premises, including inventory, equipment, cash, vehicles, and
        trailers, remains at Vendor&apos;s sole risk.{" "}
        <strong>
          The Released Parties are not liable for theft, vandalism, loss, or damage to Vendor&apos;s
          property or the property of Vendor&apos;s employees, contractors, guests, or customers,
          from any cause whatsoever.
        </strong>
      </p>

      <h4>12. Assumption of Risk</h4>
      <div className="agreement__box">
        <p className="agreement__boxhd">Assumption of Risk</p>
        <p>
          Vendor acknowledges that participation involves an outdoor event held on unimproved or
          partially improved ground and that inherent risks include, without limitation: uneven,
          soft, muddy, dusty, or unpaved terrain; gravel, caliche, or millings surfaces; open holes,
          ruts, and debris; heat, sun exposure, rain, lightning, high wind, and severe weather;
          insects and animals; crowds and pedestrian congestion; moving vehicles, trailers, and
          forklifts; temporary electrical equipment and generators; propane, open flame, hot oil,
          and cooking equipment; temporary structures and canopies; limited or no lighting; the
          acts, omissions, and negligence of other vendors, attendees, and third parties; and the
          absence of on site medical or security personnel.
        </p>
        <p>
          Vendor knowingly, freely, and voluntarily assumes all such risks, both known and unknown,
          on behalf of itself, its owners, employees, contractors, volunteers, family members,
          guests, and invitees, and accepts full responsibility for any resulting injury, illness,
          death, property damage, or loss.
        </p>
      </div>

      <h4>13. Release of Liability</h4>
      <div className="agreement__box">
        <p className="agreement__boxhd">Release and Waiver of Claims</p>
        <p>
          To the fullest extent permitted by Texas law, Vendor hereby fully releases, waives,
          discharges, and covenants not to sue the Released Parties from and against any and all
          claims, demands, actions, causes of action, damages, losses, costs, and expenses of any
          kind, whether known or unknown, arising out of or in any way related to Vendor&apos;s
          participation, presence, or operation at Coyoteville, including but not limited to claims
          for personal injury, illness, death, property damage, economic loss, lost profits, or
          business interruption.
        </p>
        <p>
          This release expressly includes claims caused in whole or in part by the ordinary
          negligence of any of the Released Parties, including negligence in the design, condition,
          maintenance, inspection, layout, staffing, supervision, lighting, or operation of the
          premises or the event. This release does not extend to gross negligence or willful
          misconduct.
        </p>
      </div>

      <h4>14. Indemnification</h4>
      <div className="agreement__box">
        <p className="agreement__boxhd">Indemnity, Including Indemnitee&apos;s Own Negligence</p>
        <p>
          Vendor shall defend, indemnify, and hold harmless the Released Parties from and against
          any and all claims, demands, suits, judgments, liabilities, losses, fines, penalties,
          damages, and expenses, including reasonable attorneys fees, expert fees, and court costs,
          brought by or on behalf of any person or entity, including Vendor&apos;s own employees,
          contractors, guests, and customers, arising out of or relating in any way to:
          Vendor&apos;s participation or presence at Coyoteville; Vendor&apos;s products, food,
          beverages, equipment, vehicles, or signage; Vendor&apos;s acts or omissions; Vendor&apos;s
          failure to hold or comply with any required permit, license, certification, or insurance;
          or Vendor&apos;s breach of this Agreement.
        </p>
        <p>
          This indemnity obligation expressly applies to and includes claims caused in whole or in
          part by the negligence of the Released Parties themselves, whether that negligence is
          sole, joint, concurrent, or comparative. Vendor and Coyoteville agree that this paragraph
          satisfies the express negligence doctrine and the conspicuousness requirement under Texas
          law. This indemnity does not extend to the gross negligence or willful misconduct of a
          Released Party.
        </p>
      </div>

      <h4>15. Weather, Cancellation, and Force Majeure</h4>
      <p>
        Events are held rain or shine. Coyoteville may delay, suspend, relocate, shorten, or cancel
        any event, in whole or in part, for weather, safety, public health, governmental order,
        utility failure, or any cause beyond its reasonable control, and may direct Vendor to cease
        operating or evacuate at any time. Fees are non refundable in all such circumstances, and
        the refund in Section 3 does not apply, because it arises only where Coyoteville declines an
        application. Where Coyoteville itself cancels a date it will make a reasonable effort, but
        is not obligated, to credit that fee toward a future event; the bar in Section 3 on credit
        and transfer applies to a cancellation by Vendor and does not limit what Coyoteville may
        choose to do here.{" "}
        <strong>
          The Released Parties are not liable for any lost profits, lost sales, spoiled inventory,
          wasted labor, travel costs, or other loss Vendor incurs as a result of any delay,
          cancellation, low attendance, or event outcome.
        </strong>
      </p>

      <h4>16. No Guarantee of Attendance or Sales</h4>
      <p>
        Coyoteville makes no representation, warranty, or guarantee regarding event attendance, foot
        traffic, weather, sales volume, revenue, the number or type of other vendors present, or the
        presence or absence of competing products. Vendor acknowledges it has made its own
        independent business judgment in deciding to participate.
      </p>

      <h4>17. Media and Photo Release</h4>
      <p>
        Vendor grants Coyoteville and its assigns an irrevocable, royalty free, perpetual right to
        photograph, film, record, and reproduce images and recordings of Vendor, its space,
        personnel, products, and signage at any event, and to use them in any medium for
        advertising, promotional, editorial, and commercial purposes without further notice,
        approval, or compensation. Vendor is responsible for obtaining any consent required from its
        own employees and personnel.
      </p>

      <h4>18. Governing Law, Venue, and Attorney Fees</h4>
      <p>
        This Agreement is governed by the laws of the State of Texas without regard to conflict of
        law principles. Exclusive venue for any dispute lies in the state courts of Jim Wells
        County, Texas, and Vendor consents to personal jurisdiction there and waives any objection
        to venue. In any action to enforce this Agreement, the prevailing party is entitled to
        recover its reasonable attorneys fees and costs.
      </p>

      <h4>19. General Provisions</h4>
      <p>
        If any provision of this Agreement is held unenforceable, it will be modified to the minimum
        extent necessary to be enforceable, or severed, and the remainder will continue in full
        force. The release and indemnification provisions survive the conclusion of any event and
        the termination of this Agreement, and are binding on Vendor&apos;s heirs, successors,
        assigns, and legal representatives. This Agreement is the entire agreement between the
        parties on this subject and supersedes all prior discussions. No waiver of any breach is a
        waiver of any other breach. Coyoteville may update this Agreement, and the version in effect
        at the time of each event governs that event.
      </p>

      <h4>20. Acknowledgment and Electronic Signature</h4>
      <div className="agreement__box">
        <p>
          Vendor has read this entire Agreement, understands it fully, and signs it freely and
          voluntarily. Vendor understands that this Agreement contains a release of liability, an
          assumption of risk, and an indemnification obligation that covers the Released Parties own
          negligence, and that by signing, Vendor is giving up substantial legal rights, including
          the right to sue.
        </p>
        <p>
          The person signing represents that they are at least eighteen years of age and are
          authorized to bind the Vendor business named in this application.
        </p>
      </div>
      {/* Execution block. Sits above the electronic signature language so the
          counterparty is established before the clause that makes a typed name
          binding. Styled to read as a signature block rather than body copy. */}
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
              {CONTRACTING_ENTITY_FULL}
              <br />
              {ENTITY_ADDRESS}
            </span>
          </div>
        </div>
      </div>

      <p>
        The parties agree that a typed name submitted electronically constitutes a valid and legally
        binding signature under the Texas Uniform Electronic Transactions Act, Chapter 322 of the
        Texas Business and Commerce Code, and consent to conduct this transaction by electronic
        means.
      </p>
    </div>
  );
}
