/**
 * The volunteer waiver, approved by counsel and live on the site.
 *
 * Signed on a phone at the lot before a shift starts. Reviewed and approved;
 * the released party is Coyoteville Alice LLC, confirmed. The text is identical
 * to vol-v0.1-DRAFT-2026, which stays in this directory unsigned because the
 * directory keeps every version by rule and not only the ones somebody used.
 *
 * Section 9 covers volunteers under 18: a parent or guardian signs, confirms
 * they will be on site for the whole shift, and indemnifies separately from the
 * release. Texas limits pre injury releases signed by a parent on a minor's
 * behalf, which is why the section does more than release and why it says on
 * screen that the guardian stays on site.
 *
 * Section 5 is drafted for the Texas fair notice doctrine: express negligence
 * stated inside the clause, and conspicuousness, which the rendering supplies
 * by marking those blocks so they cannot be skimmed past on a phone.
 *
 * NEVER EDIT THIS FILE. People have signed it. A change to the waiver is a new
 * file with the next version string, pointed at from current.ts and added to
 * registry.ts. Rows already signed keep naming this one and it has to keep
 * existing for them.
 *
 * Frozen, like every file in this directory: no imports beyond the type, and
 * every number written out, so nothing a volunteer agreed to can be restated by
 * somebody changing a constant elsewhere.
 *
 * House style, enforced by scripts/check-email-copy.js, which scans this
 * directory: no em dashes, no en dashes, no emoji. Plain hyphens only.
 */
import type { WaiverDocument } from '../types';

/** The entity, the people, and the landowner, as the vendor agreement defines them. */
const RELEASED_PARTIES =
  'Coyoteville Alice LLC, a Texas limited liability company, doing business as Coyoteville, ' +
  'together with its owners, members, managers, officers, employees, agents, contractors, ' +
  'volunteers, affiliated and related entities, and the owner of the real property located at ' +
  '150 North Stadium Road, Alice, Texas';

const blocks: WaiverDocument['blocks'] = [
  {
    kind: 'paragraph',
    text: 'Read this before you sign. It is short, and the parts that matter are marked. By signing you give up the right to sue Coyoteville over an injury, including an injury caused by Coyoteville’s own carelessness. If you are not willing to do that, do not sign, and nobody will think worse of you.',
  },

  { kind: 'heading', text: '1. Who this is between' },
  {
    kind: 'paragraph',
    text: `This is an agreement between you, the person signing, and ${RELEASED_PARTIES}. Those people and that company are called the Released Parties throughout this form. You are called the Volunteer.`,
  },
  {
    kind: 'paragraph',
    text: 'You are working this event on behalf of the organization that brought you. This agreement is between you and the Released Parties, and it is separate from whatever arrangement you have with your own organization.',
  },

  { kind: 'heading', text: '2. What you are here to do' },
  {
    kind: 'paragraph',
    text: 'Volunteers run the parking for the night and keep the lot in good order. Somebody from Coyoteville is on site the whole time and will tell you where to be.',
  },
  {
    kind: 'list',
    items: [
      'Direct vehicles into the lot and into spaces.',
      'Collect the parking fee and hand every dollar to Coyoteville as you collect it.',
      'Pick up litter during the event and walk the lot once more at the end.',
      'Be present, be visible, and be helpful to people arriving.',
    ],
  },
  {
    kind: 'conspicuous',
    text: 'YOU ARE NOT SECURITY. YOU DO NOT BREAK UP DISPUTES, HANDLE ALCOHOL, CONFRONT ANYBODY, OR TREAT INJURIES. IF SOMETHING GOES WRONG, YOU FIND COYOTEVILLE STAFF. THAT IS THE WHOLE OF YOUR JOB IN THAT SITUATION.',
  },

  { kind: 'heading', text: '3. You are not an employee' },
  {
    kind: 'paragraph',
    text: 'You are a volunteer. You are not an employee, contractor, agent, partner or joint venturer of Coyoteville, and nothing here creates any of those relationships. Coyoteville pays you nothing, withholds nothing, and provides you no wages, benefits or workers compensation coverage. You are volunteering on behalf of your organization, and any payment your organization receives is between Coyoteville and your organization, not between Coyoteville and you.',
  },
  {
    kind: 'paragraph',
    text: 'Money you collect at the gate is Coyoteville’s money from the moment it is handed to you. You hold it only long enough to pass it on, and you have no claim to any part of it.',
  },

  { kind: 'heading', text: '4. Assumption of risk' },
  {
    kind: 'conspicuous',
    text: 'YOU ARE WORKING OUTDOORS, AT NIGHT, ON UNPAVED GROUND, AROUND MOVING VEHICLES. THIS IS DANGEROUS. YOU COULD BE INJURED OR KILLED. YOU ACCEPT THAT RISK KNOWINGLY AND VOLUNTARILY.',
  },
  {
    kind: 'paragraph',
    text: 'You acknowledge that the risks include, without limitation: moving vehicles, trailers and trucks; uneven, soft, muddy, dusty or unpaved ground; gravel, caliche and millings surfaces; open holes, ruts and debris; limited or no lighting; darkness and reduced visibility; heat, sun exposure, rain, lightning, high wind and severe weather; insects and animals; crowds and pedestrian congestion; temporary electrical equipment and generators; the acts, omissions and negligence of drivers, attendees, other volunteers and other third parties; and the absence of on site medical or security personnel.',
  },
  {
    kind: 'paragraph',
    text: 'You accept these risks whether they are known or unknown to you, whether they are obvious or not, and whether or not they result from the negligence of the Released Parties.',
  },

  { kind: 'heading', text: '5. Release of liability' },
  {
    kind: 'conspicuous',
    text: 'THIS SECTION RELEASES THE RELEASED PARTIES FROM LIABILITY FOR THEIR OWN NEGLIGENCE. READ IT.',
  },
  {
    kind: 'conspicuous',
    text: 'TO THE FULLEST EXTENT PERMITTED BY TEXAS LAW, YOU FULLY RELEASE, WAIVE, DISCHARGE AND COVENANT NOT TO SUE THE RELEASED PARTIES FROM AND AGAINST ANY AND ALL CLAIMS, DEMANDS, ACTIONS, CAUSES OF ACTION, DAMAGES, LOSSES, COSTS AND EXPENSES OF ANY KIND, WHETHER KNOWN OR UNKNOWN, ARISING OUT OF OR IN ANY WAY RELATED TO YOUR PARTICIPATION OR PRESENCE AT COYOTEVILLE, INCLUDING CLAIMS FOR PERSONAL INJURY, ILLNESS, DEATH AND PROPERTY DAMAGE.',
  },
  {
    kind: 'conspicuous',
    text: 'THIS RELEASE EXPRESSLY INCLUDES CLAIMS CAUSED IN WHOLE OR IN PART BY THE ORDINARY NEGLIGENCE OF ANY OF THE RELEASED PARTIES, INCLUDING NEGLIGENCE IN THE DESIGN, CONDITION, MAINTENANCE, INSPECTION, LAYOUT, STAFFING, SUPERVISION, LIGHTING, TRAFFIC CONTROL OR OPERATION OF THE PREMISES OR THE EVENT.',
  },
  {
    kind: 'paragraph',
    text: 'This release does not extend to gross negligence or to willful or wanton misconduct, and nothing in it waives any right that Texas law does not permit you to waive.',
  },

  { kind: 'heading', text: '6. How you conduct yourself' },
  {
    kind: 'list',
    items: [
      'Follow the direction of Coyoteville staff at all times.',
      'Coyoteville may ask you to stop and leave the lot at any time, for any reason or none, and you agree to go.',
      'No alcohol and no drugs before or during your shift. If you have been drinking, you do not work.',
      'Wear closed shoes and whatever high visibility vest or shirt Coyoteville hands you.',
      'Stay out of traffic lanes except where staff has placed you.',
    ],
  },
  {
    kind: 'conspicuous',
    text: 'NOBODY UNDER 18 DIRECTS TRAFFIC OR STANDS IN A TRAFFIC LANE AT ANY TIME, FOR ANY REASON.',
  },

  { kind: 'heading', text: '7. Photographs and video' },
  {
    kind: 'paragraph',
    text: 'You grant Coyoteville and its assigns an irrevocable, royalty free, perpetual right to photograph, film, record and reproduce images and recordings of you at any event, and to use them in any medium for advertising, promotional, editorial and commercial purposes without further notice, approval or compensation.',
  },

  { kind: 'heading', text: '8. Medical' },
  {
    kind: 'paragraph',
    text: 'There is no medical staff on site. If you are injured and cannot consent for yourself, you authorize the Released Parties to arrange emergency medical treatment for you, and you are responsible for the cost of it. The emergency contact you gave on this form is who Coyoteville calls.',
  },
  {
    kind: 'paragraph',
    text: 'You confirm you are physically able to do the work described in section 2, and that you know of no medical condition that makes it unsafe for you to do it.',
  },

  { kind: 'heading', text: '9. Volunteers under 18' },
  {
    kind: 'conspicuous',
    text: 'A PARENT OR LEGAL GUARDIAN SIGNS THIS FORM FOR ANYONE UNDER 18, AND THAT PARENT OR GUARDIAN MUST BE ON SITE FOR THE WHOLE SHIFT. A MINOR WHOSE PARENT OR GUARDIAN LEAVES STOPS WORKING AND LEAVES WITH THEM.',
  },
  {
    kind: 'paragraph',
    text: 'By signing as a parent or legal guardian you confirm that you have that authority, that you have read this entire form, that you agree to it on the minor’s behalf and on your own, that you will be present on site for the whole shift, and that you understand the minor will not direct traffic or stand in a traffic lane.',
  },
  {
    kind: 'paragraph',
    text: 'You also agree, on your own behalf, to indemnify and hold harmless the Released Parties from any claim brought by or on behalf of the minor arising out of the minor’s participation, to the fullest extent permitted by Texas law.',
  },

  { kind: 'heading', text: '10. Governing law and signature' },
  {
    kind: 'paragraph',
    text: 'This agreement is governed by the laws of the State of Texas, without regard to its conflict of laws rules. Venue for any dispute lies exclusively in the state courts of Jim Wells County, Texas.',
  },
  {
    kind: 'paragraph',
    text: 'Typing your name below is your signature under the Texas Uniform Electronic Transactions Act. It has the same effect as signing on paper. Coyoteville records the time, your network address and your device information alongside it.',
  },
  {
    kind: 'conspicuous',
    text: 'YOU HAVE READ THIS ENTIRE FORM, YOU UNDERSTAND IT, AND YOU SIGN IT FREELY. YOU UNDERSTAND IT CONTAINS A RELEASE OF LIABILITY AND AN ASSUMPTION OF RISK THAT COVER THE RELEASED PARTIES OWN NEGLIGENCE, AND THAT BY SIGNING YOU ARE GIVING UP SUBSTANTIAL LEGAL RIGHTS, INCLUDING THE RIGHT TO SUE.',
  },
];

const document: WaiverDocument = {
  version: 'vol-v1.0-2026',
  entity: 'Coyoteville Alice LLC',
  isDraft: false,
  blocks,
};

export default document;
