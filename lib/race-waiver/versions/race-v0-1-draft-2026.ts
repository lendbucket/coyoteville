/**
 * ============================================================================
 * DRAFT. NOT REVIEWED BY COUNSEL. DO NOT TREAT AS LEGAL ADVICE.
 * ============================================================================
 *
 * The race waiver, signed by every runner at registration.
 *
 * This text has NOT been reviewed by a lawyer. It was drafted to mirror the
 * volunteer waiver's structure, to use the same Released Parties wording word
 * for word, and to give counsel something concrete to mark up rather than a
 * blank page. Nothing in it should be relied on as enforceable until a Texas
 * attorney has read it and said so. The page says the same thing on screen,
 * from isDraft below, so a runner can see it too.
 *
 * WHAT COUNSEL NEEDS TO LOOK AT, in rough order of how much it matters:
 *
 *   1. Section 9, minors. See the comment on that block. This is the clause
 *      most likely not to do what it appears to do.
 *   2. Section 5, the release. Drafted for the Texas fair notice doctrine:
 *      express negligence, stated inside the clause itself, and
 *      conspicuousness, which the rendering handles by marking these blocks so
 *      they are set apart on screen. Counsel should confirm both are satisfied
 *      as rendered on a phone, not only as written here.
 *   3. Section 2, the hazards. A road race on streets the city closes is a
 *      different risk profile from a lot: traffic at intersections the closure
 *      does not cover, pavement, and no medical staff on the course. Counsel
 *      should say whether naming them helps or whether the list needs to be
 *      exhaustive to be useful.
 *   4. Section 7, no refunds. Enforceable as a term of sale, but counsel
 *      should say whether a weather cancellation with no refund is a term a
 *      Texas court would read the way it is written.
 *   5. Whether the operation needs event insurance naming the city as an
 *      additional insured before the streets are closed, which is a question
 *      about the permit rather than about this document, and is the kind of
 *      thing that is cheaper to ask now than in November.
 *
 * Frozen once signed. Never edit a version file in place: add a new one.
 */
import type { WaiverDocument } from '../types';

const document: WaiverDocument = {
  version: 'race-v0.1-DRAFT-2026',
  entity: 'Coyoteville Alice LLC',
  isDraft: true,
  blocks: [
    {
      kind: 'paragraph',
      text: 'Read this before you register. It is an agreement between you and Coyoteville Alice LLC about a road race on public streets, and it affects your legal rights.',
    },

    { kind: 'heading', text: '1. What this covers' },
    {
      kind: 'paragraph',
      text: 'This agreement covers the Coyoteville 1st Annual Turkey Trot, a run of approximately 3.1 miles starting and finishing at Coyoteville, 150 N. Stadium Road, Alice, Texas, together with packet pickup, the start and finish areas, and anything else connected with the event. It applies every time you take part, including any future year you register for under this same agreement.',
    },
    {
      kind: 'paragraph',
      text: 'The course is approximately 3.1 miles. It is not certified by USATF or by anybody else, and distances and times are not official for any purpose.',
    },

    { kind: 'heading', text: '2. The risks, named' },
    {
      kind: 'paragraph',
      text: 'Running a road race is dangerous. The risks below are real, they are not a formality, and this is not a complete list of everything that could happen to you.',
    },
    {
      kind: 'list',
      items: [
        'Public roads and vehicle traffic. The city closes streets for the race. A closure is not a guarantee. Vehicles may enter the course at any point, including at intersections, driveways and cross streets, whether or not a volunteer or an officer is standing there.',
        'Uneven and broken pavement, curbs, kerbs, potholes, storm drains, gravel, painted lines, and changes in surface.',
        'Heat, humidity, cold, rain, wind, lightning and sun. A November morning in South Texas can be any of these.',
        'Other runners, walkers, strollers, wheelchairs and anybody else on the course, including collisions and falls caused by somebody else.',
        'Your own physical condition, including conditions you do not know about: heart attack, stroke, heat illness, dehydration, cardiac arrest and death.',
        'No medical staff on the course. There is no physician, no paramedic and no ambulance stationed along the route. If you need help you may have to wait for emergency services to be called and to arrive.',
        'Animals, including loose dogs.',
      ],
    },
    {
      kind: 'paragraph',
      text: 'You are choosing to run anyway. You confirm that you are physically able to take part, that you have trained for it as far as you think necessary, and that no doctor has told you not to.',
    },

    { kind: 'heading', text: '3. Who the Released Parties are' },
    {
      kind: 'paragraph',
      text: 'The Released Parties are Coyoteville Alice LLC and its owners, members, managers, officers, employees, contractors, volunteers, sponsors, vendors, insurers and anybody acting on its behalf, together with the owners and lessees of any property the race crosses or uses.',
    },

    { kind: 'heading', text: '4. Assumption of risk' },
    {
      kind: 'conspicuous',
      text: 'YOU ARE TAKING PART AT YOUR OWN RISK. YOU ACCEPT EVERY RISK OF THIS EVENT, INCLUDING THE RISKS NAMED ABOVE AND RISKS NOT NAMED, KNOWN AND UNKNOWN, AND INCLUDING THE RISK OF SERIOUS INJURY, PERMANENT DISABILITY AND DEATH.',
    },

    { kind: 'heading', text: '5. Release of liability' },
    {
      kind: 'conspicuous',
      text: 'YOU RELEASE, WAIVE AND DISCHARGE THE RELEASED PARTIES FROM ALL CLAIMS, DEMANDS, DAMAGES, LOSSES AND CAUSES OF ACTION OF ANY KIND ARISING OUT OF OR RELATING TO THIS EVENT, INCLUDING CLAIMS CAUSED IN WHOLE OR IN PART BY THE ORDINARY NEGLIGENCE OF THE RELEASED PARTIES THEMSELVES.',
    },
    {
      kind: 'conspicuous',
      text: 'THIS MEANS YOU GIVE UP YOUR RIGHT TO SUE THE RELEASED PARTIES EVEN IF THEIR OWN CARELESSNESS CAUSES YOUR INJURY OR DEATH. THIS RELEASE IS INTENDED TO SATISFY THE TEXAS EXPRESS NEGLIGENCE DOCTRINE AND THE REQUIREMENT THAT SUCH A RELEASE BE CONSPICUOUS.',
    },
    {
      kind: 'paragraph',
      text: 'This release does not cover gross negligence, wilful misconduct, or anything else the law does not permit to be released. If any part of it is held unenforceable, the rest of it still applies.',
    },

    { kind: 'heading', text: '6. Medical consent' },
    {
      kind: 'paragraph',
      text: 'If you are injured or become ill, you consent to emergency medical treatment, including transport by ambulance and treatment at a hospital, and you agree that the cost of it is yours. You agree that the Released Parties may call for emergency help on your behalf and are not responsible for the care that follows or for any delay in it.',
    },
    {
      kind: 'paragraph',
      text: 'Anything you tell us in the medical notes field is for the people running the event. We do not put it in any printed list, and we do not publish it.',
    },

    { kind: 'heading', text: '7. No refunds' },
    {
      kind: 'paragraph',
      text: 'Entry fees are not refundable for any reason. That includes injury, illness, a change of plans, a schedule conflict, and not showing up. It also includes a decision by us to cancel, shorten, delay or reroute the race for weather, for a lightning risk, for a road closure that falls through, for a public safety instruction, or for anything else outside our control.',
    },
    {
      kind: 'paragraph',
      text: 'Entries are not transferable to another person or to another year unless we say so in writing.',
    },

    { kind: 'heading', text: '8. Photographs and media' },
    {
      kind: 'paragraph',
      text: 'You agree that we may photograph and film the event, and that we may use your name, image, voice and likeness from it to promote Coyoteville and this race, in any medium, without payment to you and without a further approval from you. If you would rather we did not, email us and we will take down anything we control.',
    },

    /* ========================================================================
       COUNSEL: THIS IS THE CLAUSE TO READ FIRST.

       Texas has significantly limited the enforceability of a pre injury
       release signed by a parent or guardian on a minor's behalf. The
       assumption behind this section, that an adult can sign away a child's
       own claim, is the assumption most likely to be wrong, and a release that
       does not hold is worse than no release because the operation will have
       planned around it.

       What we need from you:

         Whether the release in section 5 reaches a minor's own claim at all,
         or only the parent's.

         Whether the indemnity below is the instrument that actually carries
         the risk here, and whether it is drafted to do that.

         Whether the operation should accept runners under 18 at all. If the
         honest answer is that none of this holds, that is a product decision
         for Robert, and it is better made in October than discovered in a
         deposition. The site currently collects both signatures so that the
         decision stays open.

       START FROM THE VOLUNTEER WAIVER, NOT FROM A BLANK PAGE.

       vol-v1.0-2026 went through counsel on this same Texas question and came
       back approved. Whatever was decided there about a parent signing on a
       minor's behalf is the starting point for this clause: the facts differ,
       a road race is not a shift in a lot, but the law is the same law and the
       reasoning has already been paid for once.

       Robert's decision, 2026-10-22: minors stay in. The kid tier is where the
       families come from, and the event insurance is the real protection
       rather than this paragraph. That settles the product question above; it
       does not settle the drafting one, which is still yours.

       Do not promote this version out of DRAFT until this clause has been
       answered specifically, not in general.
       ======================================================================== */
    { kind: 'heading', text: '9. Runners under 18' },
    {
      kind: 'paragraph',
      text: 'A runner under 18 on race day must be registered by a parent or legal guardian. That adult signs this agreement in their own name as well, agrees to everything in it on the minor runner\'s behalf and on their own, and confirms they have the legal authority to do so.',
    },
    {
      kind: 'paragraph',
      text: 'The parent or guardian also agrees to indemnify the Released Parties against any claim brought by or for the minor runner arising out of this event, to the extent the law permits.',
    },

    { kind: 'heading', text: '10. Governing law' },
    {
      kind: 'paragraph',
      text: 'This agreement is governed by the laws of the State of Texas. Any dispute about it belongs in the state courts of Jim Wells County, Texas, and you agree to that venue.',
    },

    { kind: 'heading', text: '11. Signing this electronically' },
    {
      kind: 'paragraph',
      text: 'Typing your name below is your signature under the Texas Uniform Electronic Transactions Act. It has the same effect as signing on paper. We record the version of this agreement you signed, the time, and the network address and browser you signed from, and we keep that record.',
    },
    {
      kind: 'paragraph',
      text: 'You confirm you have read all of it, that you understand you are giving up legal rights, and that you are signing it freely.',
    },
  ],
};

export default document;
