/**
 * ============================================================================
 * DRAFT. NOT REVIEWED BY COUNSEL. DO NOT TREAT AS LEGAL ADVICE.
 * ============================================================================
 *
 * The sponsorship agreement, accepted by a business before it pays.
 *
 * This is not a waiver and it is not a release. Nobody is assuming a risk of
 * injury here: a business is buying placement and this says what the placement
 * is, by when, and what happens if either side does not deliver. It is in a
 * versions directory from the first commit for the same reason the waivers are,
 * which is that a business committing fifteen hundred dollars is entitled to
 * produce the exact document it agreed to, a year later, unchanged.
 *
 * WHAT COUNSEL NEEDS TO LOOK AT:
 *
 *   1. Section 3, the shirt deadline. This is the term most likely to be
 *      argued about and it is the reason this document exists rather than an
 *      email. A title sponsor who pays on November 5 cannot be on a shirt
 *      already at the printer. Counsel should confirm that stating it before
 *      payment, in a document the sponsor accepts, is enough, and whether the
 *      refund rule in section 5 is the right remedy.
 *
 *      The date in the clause is the end of Sunday November 1, 2026, Central,
 *      which is what races.shirt_deadline_at actually holds: the column is
 *      2026-11-02T05:59:59Z, and at that instant Central has already gone back
 *      to CST, so it is 11:59:59 PM on the first. This was drafted as
 *      "November 2" and corrected before anybody signed it. A deadline clause
 *      that is a day out is the clause that causes the argument it exists to
 *      prevent, and it was off in the sponsor's favour, which is the direction
 *      that costs money.
 *   2. Section 4, what we are promising. These are deliverables rather than
 *      outcomes: a banner at the finish, not a number of impressions. Counsel
 *      should say whether anything here reads as a guarantee of attendance or
 *      of exposure, because none of it is meant to.
 *   3. Section 5, cancellation and refunds. A sponsor pays months ahead for an
 *      outdoor event in November. Counsel should say whether the weather rule
 *      is enforceable as written and whether a pro rata refund would be the
 *      safer position than the credit offered here.
 *   4. Section 6, approval of marks. We are putting somebody else's logo on a
 *      shirt and a banner. Counsel should confirm the licence granted is wide
 *      enough to do that and narrow enough that a sponsor is comfortable.
 *   5. Whether a sponsorship over some threshold should be a signed contract
 *      rather than an accepted online agreement, and where that threshold is.
 *
 * Frozen once accepted. Never edit a version file in place: add a new one.
 */
import type { SponsorshipDocument } from '../types';

const document: SponsorshipDocument = {
  version: 'sponsor-v0.1-DRAFT-2026',
  entity: 'Coyoteville Alice LLC',
  isDraft: true,
  blocks: [
    {
      kind: 'paragraph',
      text: 'This is the agreement between your business and Coyoteville Alice LLC for sponsorship of the Coyoteville 1st Annual Turkey Trot. Read it before you pay. Paying is how you accept it.',
    },

    { kind: 'heading', text: '1. The event' },
    {
      kind: 'paragraph',
      text: 'The Coyoteville 1st Annual Turkey Trot, a run of approximately 3.1 miles on Saturday, November 14, 2026, starting and finishing at Coyoteville, 150 N. Stadium Road, Alice, Texas. The course is not certified and the race is not chip timed this year.',
    },

    { kind: 'heading', text: '2. What you are buying' },
    {
      kind: 'paragraph',
      text: 'The level you selected, and the specific items listed against that level on the sponsorship page at the time you paid. Those items are the whole of what is included. Anything discussed in conversation and not on that list is not part of this agreement unless we put it in writing.',
    },

    { kind: 'heading', text: '3. The shirt deadline, which is real' },
    {
      kind: 'conspicuous',
      text: 'SHIRT PLACEMENT DEPENDS ON THE SHIRT ORDER DEADLINE AT THE END OF SUNDAY, NOVEMBER 1, 2026, CENTRAL. IF YOUR PAYMENT CLEARS AFTER THAT DATE, YOUR LOGO CANNOT GO ON THE SHIRTS, BECAUSE THE SHIRTS WILL ALREADY BE AT THE PRINTER.',
    },
    {
      kind: 'paragraph',
      text: 'This is not a formality and it is not something we can make an exception to. The printer needs the artwork and the count on that date to have the shirts here for race day. If your level includes shirt placement and you pay after the deadline, you still get everything else at your level, and we will substitute something of comparable value that does not depend on the print run. We will tell you what that is before we take the money if we can see the timing is going to be tight.',
    },
    {
      kind: 'paragraph',
      text: 'Artwork has to reach us in a usable form by the same date. A vector file or a high resolution PNG with a transparent background. If we do not have usable artwork by then, the same rule applies.',
    },

    { kind: 'heading', text: '4. What we are promising' },
    {
      kind: 'paragraph',
      text: 'We are promising to place your name and logo where the level says, and to do it properly. We are not promising a number of runners, a number of spectators, a level of attention, press coverage, or any particular result for your business. This is placement at an event, not advertising with a guaranteed audience.',
    },
    {
      kind: 'paragraph',
      text: 'Where a level includes a banner, you supply the banner unless we have agreed otherwise in writing. We will put it where the level says and take it down afterwards.',
    },

    { kind: 'heading', text: '5. If the race does not happen' },
    {
      kind: 'paragraph',
      text: 'If we cancel the race entirely, you choose: a full refund, or the same level at the next Coyoteville Turkey Trot at no further cost. Tell us which within thirty days of the cancellation and we will do it.',
    },
    {
      kind: 'paragraph',
      text: 'If the race is delayed, shortened, rerouted or moved to another date for weather, for a road closure that falls through, for a public safety instruction, or for anything else outside our control, this agreement carries over to the event as it actually runs and there is no refund. Anything already printed, produced or installed with your name on it has been delivered.',
    },
    {
      kind: 'paragraph',
      text: 'If you cancel, anything already printed or produced is not refundable. Anything not yet produced is refundable up to the shirt deadline and not after it.',
    },

    { kind: 'heading', text: '6. Your name and your logo' },
    {
      kind: 'paragraph',
      text: 'You give Coyoteville Alice LLC permission to use your business name, logo and marks to promote this race and to record that it happened, in print, online and in social media, for this race and in materials about it afterwards. You confirm you have the right to give that permission.',
    },
    {
      kind: 'paragraph',
      text: 'We will use the artwork you send us and will not alter it beyond resizing and placing it. If you need to approve a specific use, ask before you pay and we will put it in writing.',
    },

    { kind: 'heading', text: '7. What we can decline' },
    {
      kind: 'paragraph',
      text: 'This is a community race with children running in it. We can decline or end a sponsorship whose content is not appropriate for that, and if we do it after you have paid we refund you in full. We do not expect to use this and it is here so that it exists.',
    },

    { kind: 'heading', text: '8. Payment' },
    {
      kind: 'paragraph',
      text: 'Payment is due in full when you accept this. Your sponsorship is confirmed when the payment clears, and the dates in section 3 run from that moment rather than from when you filled in the form.',
    },

    { kind: 'heading', text: '9. Governing law' },
    {
      kind: 'paragraph',
      text: 'This agreement is governed by the laws of the State of Texas. Any dispute about it belongs in the state courts of Jim Wells County, Texas.',
    },

    { kind: 'heading', text: '10. Accepting this electronically' },
    {
      kind: 'paragraph',
      text: 'Typing your name below is your signature under the Texas Uniform Electronic Transactions Act, and you confirm you have the authority to commit the business you are naming. We record the version of this agreement you accepted, the time, and the network address and browser you accepted it from, and we keep that record.',
    },
  ],
};

export default document;
