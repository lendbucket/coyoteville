/**
 * The executed race waiver. Final, not a draft.
 *
 * Transcribed from docs/legal/Coyoteville Turkey Trot 5K Release and Waiver.pdf
 * on 2026-10-22. The extraction it was transcribed from is committed alongside
 * it at docs/legal/turkey-trot-waiver-v1.0-2026.extracted.txt, produced by
 * scripts/extract-pdf-text.js, so the transcription can be diffed against its
 * source by anybody who doubts it.
 *
 * THREE DOCUMENTS, ONE INSTRUMENT. The PDF contains the Participant Agreement
 * (Articles 1 to 16), the Photograph, Video, and Media Release (sections 1 to
 * 9), and the Parent or Legal Guardian Addendum (items 1 to 10). Article 1.1
 * incorporates all three by reference and Article 10 incorporates the Media
 * Release specifically, but each carries its own signature block in the paper
 * document, so each is executed by its own acknowledgment here and the Media
 * Release has its own columns on the row.
 *
 * THE ALL CAPS IS NOT SHOUTING. Article 2.2 recites that the release and
 * indemnity provisions "are set forth in bold capital letters so as to be
 * conspicuous". Their capitalisation is doing legal work under the Texas fair
 * notice doctrine, so it is preserved exactly and those blocks are marked
 * conspicuous so the rendering sets them apart on screen as well.
 *
 * ============================================================================
 * SECTION 1.4 CONTAINS AN ERROR IN THE SOURCE DOCUMENT, TRANSCRIBED AS IS.
 * ============================================================================
 *
 * Section 1.4 and item 4 of the Released Parties list both place the venue at
 * "150 S. Stadium Road". The correct address is 150 N. Stadium Road, and that
 * is what the live site, its structured data, the footer, the directions
 * section and the geocoded route all say. Robert confirmed on 2026-10-22 that
 * North is correct and that South is a typo in the source.
 *
 * It is NOT corrected here, deliberately. This file is the record of what was
 * executed, and a transcription that quietly fixes its source is not a
 * transcription: a signed row pointing at this version has to be able to
 * produce the document the signer actually agreed to. A corrected v1.1 is
 * expected, and when it arrives it gets its own file and this one stays exactly
 * as it is.
 *
 * Every other N Stadium Rd in the repo is correct and was left alone.
 *
 * WHAT WAS NOT TRANSCRIBED, both print furniture rather than text:
 *
 *   The running footer, "Coyoteville Alice LLC | Turkey Trot 5K Release |
 *   Page n", which appears fourteen times.
 *
 *   The runs of underscores that form the paper signature rules. The field
 *   labels beside them are transcribed, because what the document asks for is
 *   substantive; a blank line to write on is not, and this instrument is
 *   executed electronically under Article 14.2.
 *
 * Frozen. Never edit a version file in place: add a new one.
 */
import type { WaiverDocument } from '../types';

const document: WaiverDocument = {
  version: 'race-v1.0-2026',
  entity: 'Coyoteville Alice LLC',
  isDraft: false,
  blocks: [
    /* ======================================================================
       1. THE PARTICIPANT AGREEMENT
       ====================================================================== */
    { kind: 'document', id: 'participant-agreement', text: 'Participant Agreement' },

    { kind: 'heading', text: 'COYOTEVILLE 1ST ANNUAL TURKEY TROT 5K' },
    {
      kind: 'paragraph',
      text: 'Participant Agreement, Release of Liability, Waiver of Claims, Assumption of Risk, and Indemnity Agreement',
    },
    {
      kind: 'paragraph',
      text: 'Saturday, November 14, 2026, 8:00 a.m., Alice, Jim Wells County, Texas',
    },
    {
      kind: 'paragraph',
      text: 'Organized and conducted by Coyoteville Alice LLC, a Texas limited liability company',
    },
    {
      kind: 'conspicuous',
      text: 'READ THIS DOCUMENT CAREFULLY. IT IS A LEGALLY BINDING CONTRACT. BY SIGNING IT YOU GIVE UP SUBSTANTIAL LEGAL RIGHTS, INCLUDING THE RIGHT TO SUE THE RELEASED PARTIES FOR THEIR OWN NEGLIGENCE, AND YOU AGREE TO INDEMNIFY THEM. DO NOT SIGN IT UNLESS YOU HAVE READ IT IN FULL, UNDERSTAND IT, AND AGREE TO EVERY TERM.',
    },

    { kind: 'heading', text: 'Article 1. Definitions' },
    {
      kind: 'paragraph',
      text: 'Capitalized terms used in this Agreement have the meanings set forth below, and each definition applies equally to the singular and plural forms of the term defined.',
    },
    {
      kind: 'paragraph',
      text: '1.1 “Agreement” means this Participant Agreement, Release of Liability, Waiver of Claims, Assumption of Risk, and Indemnity Agreement, together with the Photograph, Video, and Media Release and, where applicable, the Parent or Legal Guardian Addendum, each of which is incorporated herein by reference as though fully set forth.',
    },
    {
      kind: 'paragraph',
      text: '1.2 “Organizer” means Coyoteville Alice LLC, a Texas limited liability company, and its successors and assigns.',
    },
    {
      kind: 'paragraph',
      text: '1.3 “Event” means the Coyoteville 1st Annual Turkey Trot 5K, including the timed 5 kilometer run and walk, any fun run, kids run, or untimed division, packet pickup, check in, warm up, the start and finish area, the course, the post race festival, awards, food and beverage service, entertainment, and every other activity conducted in connection therewith, whether occurring before, during, or after the race, and including any rescheduled, postponed, relocated, shortened, or modified version thereof.',
    },
    {
      /* "150 S. Stadium Road" is the source document's typo. See the header. */
      kind: 'paragraph',
      text: '1.4 “Event Premises” means every location used in connection with the Event, including without limitation the real property at 150 S. Stadium Road, Alice, Texas, known as Coyoteville; every public street, road, highway, alley, sidewalk, curb, shoulder, parkway, drainage way, parking area, and right of way on or adjacent to the course; any property owned or controlled by the City of Alice, Alice Independent School District, Jim Wells County, or the State of Texas; and every staging, parking, vendor, and spectator area.',
    },
    {
      kind: 'paragraph',
      text: '1.5 “Participant” means the individual registering for or taking part in the Event and, where the Participant is a minor, also means the minor’s parent or legal guardian signing on the minor’s behalf, each of whom is bound jointly and severally.',
    },
    {
      kind: 'paragraph',
      text: '1.6 “Released Parties” means each and all of the following, individually and collectively, together with each of their respective past, present, and future parents, subsidiaries, affiliates, members, managers, partners, shareholders, owners, directors, officers, elected and appointed officials, council members, trustees, board members, commissioners, employees, staff, agents, representatives, contractors, subcontractors, volunteers, insurers, sureties, attorneys, heirs, successors, and assigns:',
    },
    {
      kind: 'list',
      items: [
        'Coyoteville Alice LLC;',
        'Robert Reyna, individually and in every representative capacity;',
        'Reyna Holdings, 36 West Holdings, and every other entity owned or controlled, directly or indirectly, by Robert Reyna;',
        /* Again the source document's "S. Stadium Road". See the header. */
        'the record owner of the real property at 150 S. Stadium Road, Alice, Texas, known as Coyoteville, and every other owner, lessor, lessee, or occupant of any portion of the Event Premises;',
        'the City of Alice, Texas, including its police department, fire department, emergency medical services, public works department, and every other department, division, board, and commission thereof;',
        'Alice Independent School District, including its board of trustees and athletic department;',
        'Jim Wells County, Texas, including its sheriff’s office and every other department thereof;',
        'the State of Texas and every agency and political subdivision thereof having jurisdiction over any portion of the Event Premises, including without limitation the Texas Department of Transportation;',
        'every Event sponsor, whether or not identified in Event materials;',
        'every provider of emergency medical, ambulance, timing, scoring, registration, equipment, staging, sound, barricade, traffic control, security, photography, or other services to the Event;',
        'every food truck operator, vendor, exhibitor, and entertainer at the Event;',
        'every community organization, school group, club, or nonprofit that provides volunteers, course marshals, or other services to the Event; and',
        'every individual volunteer, course marshal, water station worker, and official of the Event.',
      ],
    },
    {
      kind: 'paragraph',
      text: '1.7 “Claims” means any and all claims, demands, actions, causes of action, suits, proceedings, liabilities, obligations, losses, damages of every kind (including actual, compensatory, consequential, incidental, special, exemplary, and punitive damages), judgments, settlements, liens, fines, penalties, costs, expenses, and attorney’s fees, whether known or unknown, suspected or unsuspected, foreseen or unforeseen, accrued or unaccrued, whether sounding in contract, tort, negligence, premises liability, negligent hiring, negligent supervision, negligent training, negligent course design, negligent traffic control, negligent rescue, strict liability, products liability, breach of warranty, statute, or any other theory of law or equity, including without limitation Claims for bodily injury, illness, disease, emotional distress, mental anguish, disability, disfigurement, paralysis, death, wrongful death, survival, loss of consortium, loss of services, medical expenses, lost wages, lost earning capacity, and property loss or damage.',
    },

    { kind: 'heading', text: 'Article 2. Voluntary Participation and Fair Notice' },
    {
      kind: 'paragraph',
      text: '2.1 Participant’s participation in the Event is entirely voluntary. Participant is under no compulsion to enter, and Participant may decline to sign this Agreement and decline to participate.',
    },
    {
      kind: 'paragraph',
      text: '2.2 Participant acknowledges that this Agreement contains provisions that release and indemnify the Released Parties from the consequences of their own negligence, that those provisions are set forth in bold capital letters so as to be conspicuous, that Participant has actual knowledge of those provisions, and that Participant has had a full and fair opportunity to read this Agreement, to ask questions, and to consult an attorney of Participant’s choosing before signing. Participant expressly agrees that this Agreement satisfies the express negligence doctrine and the fair notice requirements recognized under Texas law.',
    },
    {
      kind: 'paragraph',
      text: '2.3 Participant acknowledges that the Organizer would not permit Participant to participate in the Event, and that the entry fee would be substantially greater, but for Participant’s agreement to every term of this Agreement, and that this Agreement is supported by good, valuable, and sufficient consideration, the receipt and adequacy of which are hereby acknowledged.',
    },

    { kind: 'heading', text: 'Article 3. Express Assumption of Specific Risks' },
    {
      kind: 'paragraph',
      text: '3.1 General acknowledgment. Participant understands that a 5 kilometer run or walk on public streets in South Texas is a physically strenuous activity that carries inherent and other risks, including the risk of serious bodily injury, permanent disability, paralysis, and death. Participant does not rely on any general statement that running is dangerous; Participant specifically acknowledges, understands, and assumes each of the particular hazards described in Sections 3.2 through 3.10 below.',
    },
    {
      kind: 'paragraph',
      text: '3.2 Public roads and motor vehicle traffic. The course runs on public streets in the City of Alice. Participant understands that although the City of Alice may close or restrict certain streets, closures may be partial, temporary, or incomplete; that barricades, cones, and signage may be missing, displaced, misread, or ignored; that motorists may enter, cross, or travel along the course in disregard of closures, traffic control, or law enforcement direction, whether through inattention, impairment, intoxication, medical emergency, or intentional misconduct; that vehicles may exit driveways, parking lots, and side streets onto the course; that parked vehicles, delivery vehicles, school buses, emergency vehicles, law enforcement vehicles, Event support vehicles, golf carts, bicycles, and motorcycles may be present on or near the course; and that being struck by a motor vehicle can cause catastrophic injury or death. Participant assumes all risk of injury arising from vehicle traffic on or near the course.',
    },
    {
      kind: 'paragraph',
      text: '3.3 Uneven pavement and road surface conditions. Participant understands that the course surface has not been inspected, repaired, or graded for racing and includes or may include potholes, cracks, seams, ruts, raised and sunken pavement, broken asphalt, loose gravel, asphalt millings, crushed rock, sand, caliche, dirt, mud, standing water, oil and fuel residue, curbs, gutters, medians, speed bumps, reflectors, painted markings, manhole and utility covers, water meter boxes, drainage grates, storm drains, railroad crossings, landscaping, tree roots, debris, litter, glass, nails, animal waste, and surfaces made slick by rain, dew, or spills. Participant understands that the start and finish area at Coyoteville may be an unpaved or partially paved lot surfaced with gravel or asphalt millings. Participant understands that trips, slips, falls, twisted ankles, fractures, sprains, abrasions, head injuries, and dental injuries are foreseeable consequences of these conditions, and Participant assumes all such risks.',
    },
    {
      kind: 'paragraph',
      text: '3.4 Heat, humidity, sun, and weather. Participant understands that weather in Alice, Texas in November is unpredictable and may include high heat, high humidity, intense sun, sudden cold fronts, high wind, rain, fog, and lightning, and that conditions may change rapidly during the Event. Participant understands that exertion in these conditions can cause dehydration, heat cramps, heat exhaustion, exertional heat stroke, hyponatremia (low blood sodium from overconsumption of water), sunburn, hypothermia, respiratory distress, organ failure, and death. Participant understands that water stations, if any, may be few, may run out, and may be unattended, and that Participant alone is responsible for proper hydration, clothing, sun protection, pacing, and stopping when Participant feels unwell.',
    },
    {
      kind: 'paragraph',
      text: '3.5 Other runners, walkers, and spectators. Participant understands that the Event involves a mass start and a crowded course shared with runners and walkers of widely varying ages, speeds, and abilities, together with children, strollers, wheelchairs, pets where permitted, and spectators. Participant understands that other people may suddenly stop, slow, change direction, trip, fall, push, cut off, collide with, or otherwise endanger Participant, and that Participant may be injured by the acts or omissions of other participants and spectators, for whom the Released Parties are not responsible.',
    },
    {
      kind: 'conspicuous',
      text: '3.6 LIMITS OF MEDICAL AND EMERGENCY RESPONSE. PARTICIPANT UNDERSTANDS THAT ALTHOUGH THE ORGANIZER HAS ARRANGED FOR EMERGENCY MEDICAL SERVICES AND LAW ENFORCEMENT PERSONNEL TO BE PRESENT AT THE EVENT, SUCH PERSONNEL WILL BE STATIONED AT LIMITED LOCATIONS SELECTED BY THE ORGANIZER AND THOSE AGENCIES, AND CANNOT BE PRESENT AT EVERY POINT ON THE COURSE OR OBSERVE EVERY PARTICIPANT. RESPONSE TO ANY INJURY OR MEDICAL EMERGENCY MAY BE DELAYED BY DISTANCE, STREET CLOSURES, CROWDS, COMMUNICATION FAILURES, OR SIMULTANEOUS EMERGENCIES ON OR OFF THE COURSE, AND EMERGENCY PERSONNEL MAY BE CALLED AWAY FROM THE EVENT. THE PRESENCE OF EMS AND POLICE DOES NOT GUARANTEE THAT ANY PARTICULAR TREATMENT, EQUIPMENT, OR TRANSPORT WILL BE AVAILABLE, OR THAT ANY INJURY WILL BE PREVENTED. EMS PROVIDERS AND LAW ENFORCEMENT AGENCIES ARE INDEPENDENT OF THE ORGANIZER AND ACT UNDER THEIR OWN PROTOCOLS AND JUDGMENT. EVENT VOLUNTEERS ARE NOT MEDICALLY TRAINED AND HAVE NO DUTY TO RENDER AID. PARTICIPANT UNDERSTANDS THAT A DELAY IN MEDICAL CARE MAY WORSEN AN INJURY OR RESULT IN DEATH, AND PARTICIPANT ASSUMES THAT RISK.',
    },
    {
      kind: 'paragraph',
      text: '3.7 Cardiac and medical events. Participant understands that strenuous exercise can trigger or aggravate cardiac arrhythmia, sudden cardiac arrest, heart attack, stroke, asthma attack, seizure, diabetic emergency, allergic reaction, and other medical events, whether or not Participant has a known preexisting condition, and that such events can be fatal.',
    },
    {
      kind: 'paragraph',
      text: '3.8 Start, finish, and festival area hazards. Participant understands that the Coyoteville start, finish, and festival area may include food trucks, cooking equipment, open flames, hot surfaces, hot oil, propane tanks, generators, extension cords, cables, tents, stakes, canopies, stage and sound equipment, temporary structures, portable restrooms, vehicles entering and leaving, parking traffic, uneven ground, and large crowds, and that food and beverages served by independent vendors may cause foodborne illness or allergic reaction.',
    },
    {
      kind: 'paragraph',
      text: '3.9 Other hazards. Participant further understands and assumes the risks of stinging insects, fire ants, mosquitoes, snakes, loose or aggressive dogs and other animals; poor visibility in early morning light; course marking errors, wrong turns, mismeasured distance, and timing errors; acts of volunteers and officials; crime, theft, assault, and other wrongful acts of third parties; communicable disease, including influenza and COVID-19; and noise, music, and amplified sound.',
    },
    {
      kind: 'conspicuous',
      text: '3.10 RISKS ARISING FROM NEGLIGENCE. PARTICIPANT UNDERSTANDS THAT THE RISKS DESCRIBED IN THIS ARTICLE MAY BE CAUSED, INCREASED, OR MADE WORSE BY THE ORDINARY NEGLIGENCE OF THE RELEASED PARTIES, INCLUDING WITHOUT LIMITATION NEGLIGENCE IN SELECTING, DESIGNING, MEASURING, MARKING, INSPECTING, OR MAINTAINING THE COURSE; IN PLANNING OR IMPLEMENTING STREET CLOSURES AND TRAFFIC CONTROL; IN WARNING OR FAILING TO WARN OF HAZARDS; IN HIRING, TRAINING, OR SUPERVISING STAFF AND VOLUNTEERS; IN PROVIDING OR FAILING TO PROVIDE WATER, MEDICAL CARE, OR EMERGENCY RESPONSE; AND IN DECIDING WHETHER TO CONDUCT, DELAY, MODIFY, OR CANCEL THE EVENT. PARTICIPANT KNOWINGLY AND VOLUNTARILY ASSUMES ALL SUCH RISKS, BOTH KNOWN AND UNKNOWN, EVEN IF ARISING FROM THE NEGLIGENCE OF THE RELEASED PARTIES, AND ASSUMES FULL RESPONSIBILITY FOR PARTICIPANT’S PARTICIPATION.',
    },

    { kind: 'heading', text: 'Article 4. Release and Waiver of Claims' },
    {
      kind: 'conspicuous',
      text: '4.1 RELEASE. IN CONSIDERATION OF BEING PERMITTED TO PARTICIPATE IN THE EVENT, PARTICIPANT, FOR PARTICIPANT AND FOR PARTICIPANT’S SPOUSE, CHILDREN, PARENTS, HEIRS, NEXT OF KIN, BENEFICIARIES, EXECUTORS, ADMINISTRATORS, PERSONAL REPRESENTATIVES, INSURERS, SUBROGEES, ASSIGNS, AND ESTATE, HEREBY FULLY, FINALLY, AND FOREVER RELEASES, WAIVES, ACQUITS, AND DISCHARGES EACH AND ALL OF THE RELEASED PARTIES FROM ANY AND ALL CLAIMS ARISING OUT OF OR RELATING IN ANY WAY TO PARTICIPANT’S REGISTRATION FOR, TRAVEL TO OR FROM, PRESENCE AT, OR PARTICIPATION IN THE EVENT, OR PARTICIPANT’S USE OF THE EVENT PREMISES, INCLUDING WITHOUT LIMITATION CLAIMS FOR BODILY INJURY, ILLNESS, DEATH, AND PROPERTY DAMAGE.',
    },
    {
      kind: 'conspicuous',
      text: '4.2 EXPRESS RELEASE OF THE RELEASED PARTIES’ OWN NEGLIGENCE. PARTICIPANT EXPRESSLY INTENDS AND AGREES THAT THE RELEASE IN SECTION 4.1 INCLUDES, AND RELEASES THE RELEASED PARTIES FROM, ALL CLAIMS CAUSED OR ALLEGED TO BE CAUSED IN WHOLE OR IN PART BY THE SOLE, JOINT, CONCURRENT, COMPARATIVE, OR CONTRIBUTORY NEGLIGENCE OF ANY ONE OR MORE OF THE RELEASED PARTIES, BY PREMISES CONDITIONS, AND BY STRICT LIABILITY, TO THE FULLEST EXTENT PERMITTED BY TEXAS LAW.',
    },
    {
      kind: 'paragraph',
      text: '4.3 Unknown Claims. Participant understands that injuries and damages may exist that Participant does not know or suspect at the time of signing, and Participant expressly waives the benefit of any statute, rule, or doctrine that would otherwise preserve unknown Claims.',
    },
    {
      kind: 'paragraph',
      text: '4.4 Exclusions required by law. This release does not apply to any Claim that Texas law does not permit to be released by contract, which may include Claims for gross negligence or intentional misconduct; any such Claim shall be excluded only to the minimum extent required by law, and all other Claims remain fully released.',
    },

    { kind: 'heading', text: 'Article 5. Covenant Not to Sue' },
    {
      kind: 'conspicuous',
      text: 'PARTICIPANT COVENANTS AND AGREES, FOR PARTICIPANT AND EVERY PERSON CLAIMING THROUGH PARTICIPANT, NEVER TO INSTITUTE, PROSECUTE, OR VOLUNTARILY AID IN ANY ACTION, ARBITRATION, OR PROCEEDING AGAINST ANY RELEASED PARTY ON ANY CLAIM RELEASED BY THIS AGREEMENT.',
    },
    {
      kind: 'paragraph',
      text: 'If Participant or anyone claiming through Participant breaches this covenant, Participant shall pay all attorney’s fees, expert fees, court costs, and other expenses incurred by every Released Party in defending such action, and this Agreement may be pleaded as a complete bar and defense.',
    },

    { kind: 'heading', text: 'Article 6. Indemnification, Defense, and Hold Harmless' },
    {
      kind: 'conspicuous',
      text: '6.1 INDEMNITY. PARTICIPANT SHALL INDEMNIFY, DEFEND, AND HOLD HARMLESS EACH AND ALL OF THE RELEASED PARTIES FROM AND AGAINST ANY AND ALL CLAIMS, INCLUDING REASONABLE ATTORNEY’S FEES, EXPERT FEES, AND COSTS OF INVESTIGATION AND DEFENSE, THAT ARE ASSERTED BY ANY PERSON OR ENTITY, INCLUDING PARTICIPANT’S SPOUSE, CHILDREN, PARENTS, HEIRS, ESTATE, INSURERS, HEALTH PLANS, MEDICAL PROVIDERS, LIENHOLDERS, AND SUBROGEES, OR ANY OTHER PARTICIPANT, SPECTATOR, OR THIRD PARTY, AND THAT ARISE OUT OF OR RELATE TO (A) PARTICIPANT’S PRESENCE AT OR PARTICIPATION IN THE EVENT; (B) ANY INJURY, DEATH, OR DAMAGE TO PARTICIPANT; (C) ANY INJURY, DEATH, OR DAMAGE CAUSED BY PARTICIPANT TO ANY OTHER PERSON OR PROPERTY; (D) PARTICIPANT’S BREACH OF THIS AGREEMENT OR OF ANY EVENT RULE; OR (E) ANY MISREPRESENTATION BY PARTICIPANT.',
    },
    {
      kind: 'conspicuous',
      text: '6.2 INDEMNITY INCLUDES THE RELEASED PARTIES’ OWN NEGLIGENCE. PARTICIPANT EXPRESSLY INTENDS AND AGREES THAT THE INDEMNITY AND DEFENSE OBLIGATIONS IN THIS ARTICLE APPLY EVEN IF THE CLAIM IS CAUSED OR ALLEGED TO BE CAUSED IN WHOLE OR IN PART BY THE SOLE, JOINT, CONCURRENT, COMPARATIVE, OR CONTRIBUTORY NEGLIGENCE OF ANY ONE OR MORE OF THE RELEASED PARTIES, TO THE FULLEST EXTENT PERMITTED BY TEXAS LAW.',
    },
    {
      kind: 'paragraph',
      text: '6.3 Defense. Each Released Party may select its own counsel, and Participant shall pay that counsel’s reasonable fees as incurred. No settlement binding a Released Party shall be made without its written consent.',
    },
    {
      kind: 'paragraph',
      text: '6.4 Subrogation and liens. Participant waives, and shall cause Participant’s insurers and health plans to waive, every right of subrogation and reimbursement against the Released Parties, and Participant shall satisfy and discharge every medical, hospital, and governmental lien arising from Participant’s injury.',
    },

    { kind: 'heading', text: 'Article 7. Medical Matters' },
    {
      kind: 'paragraph',
      text: '7.1 Certification of fitness. Participant represents and warrants that Participant is physically fit and sufficiently trained to complete a 5 kilometer run or walk; that a licensed physician has not advised Participant against participating; that Participant has no medical condition, injury, or impairment that makes participation unsafe; that Participant has consulted a physician, or has knowingly and voluntarily chosen not to do so; and that Participant will immediately stop participating and seek help if Participant experiences chest pain, dizziness, shortness of breath, confusion, or any other distress. The Released Parties rely on these representations and have no duty to screen, examine, or verify the fitness of any Participant.',
    },
    {
      kind: 'paragraph',
      text: '7.2 Consent to emergency treatment. Participant consents to receive, and authorizes any Released Party, law enforcement officer, first responder, or bystander to summon, any first aid, emergency medical treatment, ambulance transport, and hospital care that any of them believes in good faith is needed, and authorizes any licensed provider to render such treatment, including treatment Participant is unable to consent to at the time because of injury or incapacity.',
    },
    {
      kind: 'conspicuous',
      text: '7.3 Financial responsibility. PARTICIPANT IS SOLELY RESPONSIBLE FOR ALL COSTS OF ANY FIRST AID, AMBULANCE TRANSPORT, EMERGENCY ROOM, HOSPITAL, PHYSICIAN, AND OTHER MEDICAL CARE RENDERED TO PARTICIPANT, WHETHER OR NOT REQUESTED BY PARTICIPANT, AND THE RELEASED PARTIES SHALL HAVE NO OBLIGATION TO PAY OR REIMBURSE ANY SUCH COSTS.',
    },
    {
      kind: 'paragraph',
      text: 'The Released Parties do not provide medical, accident, or health insurance for Participants.',
    },
    {
      kind: 'paragraph',
      text: '7.4 No duty to render aid; release for aid rendered. No Released Party assumes any duty to render medical aid. Any aid voluntarily rendered is a courtesy, and Participant releases every Released Party from any Claim arising from aid rendered, aid not rendered, or delay in aid.',
    },
    {
      kind: 'paragraph',
      text: '7.5 Authorization to disclose. Participant authorizes any treating provider to disclose to the Organizer and its insurers information about Participant’s condition and treatment arising from the Event, to the extent needed to respond to the emergency, notify Participant’s emergency contact, and administer any insurance or Claim matter.',
    },

    { kind: 'heading', text: 'Article 8. Event Rules and Conduct' },
    {
      kind: 'paragraph',
      text: '8.1 Participant shall obey all Event rules, all instructions of Event officials, course marshals, and volunteers, and all directions of law enforcement and emergency personnel; shall remain on the designated course; shall obey all traffic laws when on any portion of a street not closed to traffic; and shall not use wheeled devices, bicycles, scooters, or skates on the course unless expressly permitted.',
    },
    {
      kind: 'paragraph',
      text: '8.2 Participant’s race bib is personal and nontransferable. Any person who transfers a bib, or who participates under another person’s bib or without a bib, does so in breach of this Agreement, and the transferring Participant shall indemnify the Released Parties under Article 6 for any Claim by or concerning the unregistered person.',
    },
    {
      kind: 'paragraph',
      text: '8.3 Participant who uses headphones, earbuds, or mobile devices on the course does so at Participant’s sole risk and acknowledges that such devices reduce Participant’s ability to hear vehicles, officials, and other participants.',
    },
    {
      kind: 'paragraph',
      text: '8.4 Participant who brings a stroller, a child, or a pet (where permitted) assumes full responsibility for that person or animal and for any injury it causes or suffers.',
    },
    {
      kind: 'paragraph',
      text: '8.5 The Organizer may, in its sole discretion and without refund, disqualify, stop, or remove any Participant from the course or the Event Premises for any conduct it considers unsafe, disruptive, or in breach of this Agreement, or for any apparent medical distress.',
    },

    {
      kind: 'heading',
      text: 'Article 9. No Refunds; Cancellation, Postponement, and Modification',
    },
    {
      kind: 'conspicuous',
      text: '9.1 No refunds. ALL ENTRY FEES, DONATIONS, AND OTHER AMOUNTS PAID ARE FINAL AND NONREFUNDABLE, AND ARE NOT TRANSFERABLE TO ANOTHER PERSON OR A FUTURE EVENT EXCEPT AS THE ORGANIZER MAY ELECT IN WRITING IN ITS SOLE DISCRETION.',
    },
    {
      kind: 'paragraph',
      text: 'No refund will be issued for Participant’s illness, injury, schedule conflict, failure to appear, disqualification, or removal.',
    },
    {
      kind: 'paragraph',
      text: '9.2 Cancellation and modification. The Organizer may, in its sole discretion and without liability, delay, shorten, reroute, relocate, postpone, suspend, convert to an untimed or virtual format, or cancel the Event in whole or in part, before or during the Event, because of weather, lightning, heat index, wind, flooding, air quality, road or surface conditions, traffic, the withdrawal or modification of any permit or street closure, the direction or request of the City of Alice, law enforcement, or any governmental authority, emergency, public health order, civil unrest, act of terrorism, threat, fire, power failure, insufficient volunteers or vendors, or any other cause beyond the Organizer’s reasonable control, or for any reason the Organizer determines in good faith bears on safety.',
    },
    {
      kind: 'paragraph',
      text: '9.3 No liability for cancellation. In any such event, no entry fee shall be refunded, and the Released Parties shall have no liability for any travel, lodging, lost time, or other expense or loss incurred by Participant.',
    },

    { kind: 'heading', text: 'Article 10. Photograph, Video, and Media' },
    {
      kind: 'paragraph',
      text: 'Participant grants the rights, releases, and waivers set forth in the Photograph, Video, and Media Release that accompanies this Agreement, which is incorporated herein and which survives any termination of this Agreement.',
    },

    { kind: 'heading', text: 'Article 11. Personal Property' },
    {
      kind: 'paragraph',
      text: 'The Released Parties are not bailees of, and assume no responsibility for, any personal property of Participant, including property left at any bag check, tent, vehicle, or unattended location. Participant releases all Claims for loss, theft, or damage to personal property.',
    },

    { kind: 'heading', text: 'Article 12. Limitation of Liability' },
    {
      kind: 'conspicuous',
      text: 'TO THE EXTENT ANY CLAIM AGAINST ANY RELEASED PARTY SURVIVES THIS AGREEMENT FOR ANY REASON, THE AGGREGATE LIABILITY OF ALL RELEASED PARTIES SHALL NOT EXCEED THE ENTRY FEE PAID BY PARTICIPANT, AND NO RELEASED PARTY SHALL BE LIABLE FOR ANY CONSEQUENTIAL, INCIDENTAL, SPECIAL, EXEMPLARY, OR PUNITIVE DAMAGES, TO THE FULLEST EXTENT PERMITTED BY TEXAS LAW.',
    },

    { kind: 'heading', text: 'Article 13. Governing Law, Venue, and Jury Waiver' },
    {
      kind: 'paragraph',
      text: '13.1 Governing law. This Agreement and every Claim arising out of or relating to the Event shall be governed by and construed in accordance with the laws of the State of Texas, without regard to its conflict of laws principles.',
    },
    {
      kind: 'paragraph',
      text: '13.2 Venue. Participant agrees that exclusive venue for any action arising out of or relating to this Agreement or the Event shall lie in the state courts of competent jurisdiction sitting in Jim Wells County, Texas, and Participant irrevocably submits to the personal jurisdiction of those courts and waives any objection based on inconvenient forum.',
    },
    {
      kind: 'conspicuous',
      text: '13.3 JURY WAIVER. TO THE FULLEST EXTENT PERMITTED BY LAW, PARTICIPANT KNOWINGLY, VOLUNTARILY, AND INTENTIONALLY WAIVES ANY RIGHT TO A TRIAL BY JURY IN ANY ACTION ARISING OUT OF OR RELATING TO THIS AGREEMENT OR THE EVENT.',
    },
    {
      kind: 'paragraph',
      text: '13.4 Time to sue. To the extent permitted by law, any Claim not released by this Agreement must be filed within one (1) year after it accrues or be forever barred.',
    },

    { kind: 'heading', text: 'Article 14. Electronic Signature and Records' },
    {
      kind: 'paragraph',
      text: '14.1 Participant agrees that this Agreement is a transaction governed by the Texas Uniform Electronic Transactions Act, Chapter 322 of the Texas Business and Commerce Code, and the federal Electronic Signatures in Global and National Commerce Act, 15 U.S.C. § 7001 et seq.',
    },
    {
      kind: 'paragraph',
      text: '14.2 Participant consents to conduct this transaction by electronic means and agrees that checking the acknowledgment boxes, typing Participant’s full legal name, and clicking the submit or register button together constitute Participant’s electronic signature, adopted with the intent to sign this Agreement, and that this electronic signature has the same legal force and effect as a handwritten signature.',
    },
    {
      kind: 'paragraph',
      text: '14.3 Participant agrees that the electronic record of this Agreement maintained by the Organizer or its registration provider, including the date, time, IP address, and document version associated with Participant’s signature, is an original, accurate, and complete record admissible in any proceeding, and Participant waives any objection to it on the ground that it is electronic.',
    },
    {
      kind: 'paragraph',
      text: '14.4 Participant may obtain a paper copy of this Agreement at no charge by written request to the Organizer through the contact information published at coyoteville.com, and may withdraw consent to electronic records before signing by declining to register online and signing a paper form at packet pickup.',
    },

    { kind: 'heading', text: 'Article 15. General Provisions' },
    {
      kind: 'paragraph',
      text: '15.1 Severability. This Agreement is intended to be as broad and inclusive as Texas law permits. If any provision or portion of a provision is held invalid or unenforceable, it shall be reformed to the minimum extent necessary to make it enforceable, and the remainder shall continue in full force and effect.',
    },
    {
      kind: 'paragraph',
      text: '15.2 Third party beneficiaries. Each Released Party that is not a signatory is an intended third party beneficiary of this Agreement with full right to enforce it.',
    },
    {
      kind: 'paragraph',
      text: '15.3 Binding effect and survival. This Agreement binds Participant and Participant’s spouse, heirs, next of kin, executors, administrators, personal representatives, assigns, and estate, and survives the Event, Participant’s death or incapacity, and any cancellation of the Event.',
    },
    {
      kind: 'paragraph',
      text: '15.4 Entire agreement; no reliance. This Agreement is the entire agreement concerning its subject matter and supersedes all prior statements. Participant has not relied on any oral or written representation by any Released Party not contained herein. No modification is effective unless in a writing signed by the Organizer.',
    },
    {
      kind: 'paragraph',
      text: '15.5 Construction. This Agreement shall be construed fairly according to its plain terms and not strictly for or against any party, regardless of which party drafted it. Headings are for convenience only. The words “including” and “includes” mean “including without limitation.”',
    },
    {
      kind: 'paragraph',
      text: '15.6 Cumulative protection. The protections in this Agreement are cumulative of, and do not limit, any immunity, defense, or limitation available to any Released Party under law, including governmental immunity under the Texas Tort Claims Act, Chapter 101 of the Texas Civil Practice and Remedies Code, none of which is waived.',
    },

    { kind: 'heading', text: 'Article 16. Participant Acknowledgment' },
    {
      kind: 'conspicuous',
      text: 'BY SIGNING, PARTICIPANT ACKNOWLEDGES THAT PARTICIPANT IS AT LEAST 18 YEARS OF AGE (OR IS A PARENT OR LEGAL GUARDIAN SIGNING FOR A MINOR); HAS READ THIS ENTIRE AGREEMENT; UNDERSTANDS THAT IT RELEASES AND REQUIRES INDEMNITY OF THE RELEASED PARTIES FOR THEIR OWN NEGLIGENCE; UNDERSTANDS THE SPECIFIC RISKS DESCRIBED IN ARTICLE 3, INCLUDING THE LIMITS OF ON SITE MEDICAL AND EMERGENCY RESPONSE; WAIVES THE RIGHT TO A JURY TRIAL; AND SIGNS IT FREELY AND VOLUNTARILY, WITHOUT ANY INDUCEMENT, INTENDING TO BE LEGALLY BOUND.',
    },
    {
      kind: 'paragraph',
      text: 'The paper document is executed here with the Participant’s full legal name, signature, and date, together with date of birth, email, and emergency contact name and phone. Registering on this site executes it electronically instead, under Article 14.2.',
    },

    /* ======================================================================
       2. THE MEDIA RELEASE. Incorporated by Article 1.1 and Article 10, and
          executed on its own signature block, which is why it has its own
          acknowledgment and its own columns on the row.
       ====================================================================== */
    { kind: 'document', id: 'media-release', text: 'Photograph, Video, and Media Release' },

    {
      kind: 'heading',
      text: 'COYOTEVILLE 1ST ANNUAL TURKEY TROT 5K: GRANT OF RIGHTS, CONSENT, AND RELEASE',
    },
    {
      kind: 'paragraph',
      text: 'This Photograph, Video, and Media Release (the “Media Release”) is given by the undersigned (“Grantor”) in favor of Coyoteville Alice LLC, a Texas limited liability company, and the other Released Parties defined in the Participant Agreement (collectively, “Grantees”). Capitalized terms not defined here have the meanings given in the Participant Agreement.',
    },

    { kind: 'heading', text: '1. Acknowledgment of Recording' },
    {
      kind: 'paragraph',
      text: 'Grantor acknowledges that the Event is a public event and that the Organizer, its contractors, sponsors, the media, and members of the public will photograph, film, video record, audio record, livestream, and otherwise capture images and sound throughout the Event Premises, including at the start line, on the course, at the finish line, in the festival area, and at awards. Grantor consents to being recorded and agrees that Grantor has no expectation of privacy anywhere on the Event Premises during the Event.',
    },

    { kind: 'heading', text: '2. Grant of Rights' },
    {
      kind: 'conspicuous',
      text: '2.1 GRANTOR HEREBY IRREVOCABLY GRANTS TO GRANTEES, AND TO THEIR LICENSEES, SUCCESSORS, AND ASSIGNS, THE PERPETUAL, WORLDWIDE, ROYALTY FREE, FULLY PAID, SUBLICENSABLE, AND TRANSFERABLE RIGHT AND LICENSE TO RECORD, PHOTOGRAPH, FILM, USE, REPRODUCE, EDIT, CROP, RETOUCH, ALTER, COMBINE WITH OTHER MATERIAL, DISTRIBUTE, DISPLAY, PERFORM, BROADCAST, TRANSMIT, PUBLISH, AND OTHERWISE EXPLOIT GRANTOR’S NAME, IMAGE, LIKENESS, PHOTOGRAPH, PORTRAIT, VOICE, STATEMENTS, BIB NUMBER, FINISH TIME, RESULTS, CITY OF RESIDENCE, AGE GROUP, AND BIOGRAPHICAL INFORMATION (COLLECTIVELY, “LIKENESS”), AS CAPTURED IN CONNECTION WITH THE EVENT.',
    },
    {
      kind: 'paragraph',
      text: '2.2 The rights granted extend to every medium and format now known or later developed, including print, signage, banners, flyers, billboards, websites, email, social media, streaming, television, radio, film, digital advertising, merchandise, and promotional materials, without limitation as to frequency, duration, or territory.',
    },
    {
      kind: 'paragraph',
      text: '2.3 The rights granted extend to every lawful purpose, including advertising, marketing, promotion, publicity, sponsorship recognition, fundraising, trade, and commercial purposes, for the Event, for future Coyoteville events, for Coyoteville Alice LLC, for any sponsor, and for any business affiliated with Grantees.',
    },
    {
      kind: 'paragraph',
      text: '2.4 Grantees may, but are not required to, credit or identify Grantor. Grantees have no obligation to use any Likeness.',
    },

    { kind: 'heading', text: '3. Waiver of Approval and Compensation' },
    {
      kind: 'paragraph',
      text: '3.1 Grantor waives any right to inspect, review, or approve any photograph, recording, edited version, caption, copy, or finished product in which Grantor’s Likeness appears, or the use to which it is put.',
    },
    {
      kind: 'paragraph',
      text: '3.2 Grantor acknowledges that Grantor’s participation in the Event is full and sufficient consideration for this Media Release, and that Grantor is not entitled to and shall not seek any payment, royalty, residual, fee, or other compensation of any kind.',
    },

    { kind: 'heading', text: '4. Ownership' },
    {
      kind: 'paragraph',
      text: 'All photographs, video, audio, and other recordings made by or for Grantees, and all copyrights and other rights in them, are and shall remain the sole and exclusive property of Grantees or their photographers. Grantor claims no ownership interest in them.',
    },

    { kind: 'heading', text: '5. Release of Media Claims' },
    {
      kind: 'conspicuous',
      text: 'GRANTOR, FOR GRANTOR AND GRANTOR’S HEIRS, EXECUTORS, ADMINISTRATORS, PERSONAL REPRESENTATIVES, AND ASSIGNS, HEREBY RELEASES, DISCHARGES, AND AGREES TO HOLD HARMLESS GRANTEES FROM ANY AND ALL CLAIMS ARISING OUT OF OR RELATING TO THE RECORDING OR USE OF GRANTOR’S LIKENESS AS PERMITTED BY THIS MEDIA RELEASE, INCLUDING WITHOUT LIMITATION CLAIMS FOR INVASION OF PRIVACY, INTRUSION UPON SECLUSION, PUBLIC DISCLOSURE OF PRIVATE FACTS, FALSE LIGHT, MISAPPROPRIATION, VIOLATION OF ANY RIGHT OF PUBLICITY, DEFAMATION ARISING FROM ANY CAPTION, EDITING, ALTERATION, DISTORTION, OR COMPOSITE USE, INFLICTION OF EMOTIONAL DISTRESS, AND COPYRIGHT OR MORAL RIGHTS, WHETHER CAUSED BY THE NEGLIGENCE OF GRANTEES OR OTHERWISE.',
    },

    { kind: 'heading', text: '6. Third Party Recordings' },
    {
      kind: 'paragraph',
      text: 'Grantor understands that spectators, other participants, news media, and independent photographers not controlled by the Organizer may record and publish Grantor’s Likeness. Grantees have no control over and no responsibility for such third party recordings, and Grantor releases Grantees from any Claim arising from them.',
    },

    { kind: 'heading', text: '7. Irrevocability and Duration' },
    {
      kind: 'paragraph',
      text: 'This Media Release is irrevocable and perpetual. It survives the Event, any cancellation or modification of the Event, and Grantor’s death or incapacity, and binds Grantor’s heirs and assigns. Grantor may request that the Organizer refrain from future use of a specific identified image by written notice to the Organizer through the contact information published at coyoteville.com; the Organizer may honor such a request in its sole discretion, but no such request obligates the Organizer to recall, remove, or destroy any material already printed, published, distributed, or in production, and no such request revokes this Media Release.',
    },

    { kind: 'heading', text: '8. Minors' },
    {
      kind: 'paragraph',
      text: 'If Grantor is under 18 years of age, the parent or legal guardian signing below grants every right, consent, and release in this Media Release on behalf of the minor and on the signer’s own behalf, represents that the signer has full legal authority to do so, and agrees to indemnify Grantees from any Claim by or on behalf of the minor arising from any use permitted here.',
    },

    { kind: 'heading', text: '9. Governing Law, Venue, and Electronic Signature' },
    {
      kind: 'paragraph',
      text: 'This Media Release is governed by the laws of the State of Texas. Exclusive venue lies in the state courts of Jim Wells County, Texas. This Media Release may be executed electronically under the Texas Uniform Electronic Transactions Act, Chapter 322 of the Texas Business and Commerce Code, and Grantor’s electronic signature has the same force and effect as a handwritten signature. If any part of this Media Release is held unenforceable, the remainder shall be enforced to the fullest extent permitted by law.',
    },
    {
      kind: 'conspicuous',
      text: 'BY SIGNING, GRANTOR ACKNOWLEDGES THAT GRANTOR HAS READ AND UNDERSTANDS THIS MEDIA RELEASE, IS AT LEAST 18 YEARS OF AGE OR IS THE PARENT OR LEGAL GUARDIAN OF THE MINOR PARTICIPANT, AND GRANTS THESE RIGHTS FREELY AND WITHOUT COMPENSATION.',
    },
    {
      kind: 'paragraph',
      text: 'The paper document is executed here with the Grantor’s full legal name, signature, and date. Registering on this site executes it electronically instead.',
    },

    /* ======================================================================
       3. THE GUARDIAN ADDENDUM. Required for every participant under 18, and
          executed on its own signature block.
       ====================================================================== */
    {
      kind: 'document',
      id: 'guardian-addendum',
      text: 'Parent or Legal Guardian Addendum (Participants Under 18)',
    },

    {
      kind: 'conspicuous',
      text: 'THIS ADDENDUM MUST BE SIGNED BY A PARENT OR LEGAL GUARDIAN FOR EVERY PARTICIPANT UNDER 18 YEARS OF AGE. A MINOR MAY NOT REGISTER OR PARTICIPATE WITHOUT IT.',
    },
    {
      kind: 'paragraph',
      text: 'The undersigned (“Guardian”) is the parent or court appointed legal guardian of the minor named in the registration (“Minor”) and agrees as follows, intending to be legally bound.',
    },
    {
      kind: 'paragraph',
      text: '1. Authority. Guardian represents and warrants that Guardian has full legal authority to sign for the Minor, that no court order or custody arrangement restricts that authority, and that no other parent or guardian with equal authority objects. Guardian shall indemnify the Released Parties against any Claim by another parent or guardian challenging that authority.',
    },
    {
      kind: 'paragraph',
      text: '2. Adoption of the Agreement. Guardian has read the Participant Agreement and the Media Release, consents to the Minor’s participation, and signs both on the Minor’s behalf and in Guardian’s own individual capacity, binding Guardian jointly and severally.',
    },
    {
      kind: 'paragraph',
      text: '3. Guardian’s assumption of risk. Guardian understands each specific risk described in Article 3 of the Participant Agreement, including motor vehicle traffic, uneven pavement, heat, other runners, and the limits of on site medical and emergency response, and Guardian has judged that the Minor is physically and mentally capable of participating safely.',
    },
    {
      kind: 'conspicuous',
      text: '4. RELEASE OF GUARDIAN’S OWN CLAIMS. GUARDIAN, IN GUARDIAN’S OWN RIGHT, RELEASES AND WAIVES EVERY CLAIM GUARDIAN HAS OR MAY HAVE AGAINST THE RELEASED PARTIES ARISING FROM THE MINOR’S PARTICIPATION, INCLUDING CLAIMS FOR THE MINOR’S MEDICAL EXPENSES, LOSS OF SERVICES, LOSS OF CONSORTIUM, AND MENTAL ANGUISH, EVEN IF CAUSED BY THE NEGLIGENCE OF THE RELEASED PARTIES.',
    },
    {
      kind: 'conspicuous',
      text: '5. RELEASE ON BEHALF OF THE MINOR. TO THE FULLEST EXTENT PERMITTED BY TEXAS LAW, GUARDIAN, ON BEHALF OF THE MINOR, RELEASES THE RELEASED PARTIES FROM EVERY CLAIM ARISING FROM THE MINOR’S PARTICIPATION, INCLUDING CLAIMS CAUSED BY THE NEGLIGENCE OF THE RELEASED PARTIES.',
    },
    {
      kind: 'conspicuous',
      text: '6. PARENTAL INDEMNITY. GUARDIAN SHALL INDEMNIFY, DEFEND, AND HOLD HARMLESS THE RELEASED PARTIES FROM ANY AND ALL CLAIMS BROUGHT BY OR ON BEHALF OF THE MINOR, INCLUDING ANY CLAIM BROUGHT BY THE MINOR AFTER REACHING THE AGE OF 18, OR BY ANY NEXT FRIEND, GUARDIAN AD LITEM, OR ESTATE OF THE MINOR, ARISING FROM THE MINOR’S PARTICIPATION, EVEN IF CAUSED BY THE NEGLIGENCE OF THE RELEASED PARTIES.',
    },
    {
      kind: 'paragraph',
      text: 'Guardian understands that this obligation means Guardian may be personally responsible to repay the Released Parties for any amount they pay on the Minor’s Claim.',
    },
    {
      kind: 'paragraph',
      text: '7. Supervision. Guardian is solely responsible for supervising the Minor before, during, and after the race. Any Minor under 12 years of age must be accompanied on the course at all times by Guardian or by an adult Participant designated by Guardian. The Released Parties have no duty to supervise any Minor and do not provide childcare.',
    },
    {
      kind: 'paragraph',
      text: '8. Medical consent for the Minor. Guardian consents to emergency first aid, ambulance transport, and medical treatment for the Minor as described in Article 7 of the Participant Agreement if Guardian cannot be reached immediately, and accepts sole financial responsibility for all such care.',
    },
    {
      kind: 'paragraph',
      text: '9. Fitness of the Minor. Guardian certifies that the Minor is in good health, has no condition that makes participation unsafe, and has been instructed to stop and seek help if the Minor feels unwell.',
    },
    {
      kind: 'paragraph',
      text: '10. Media. Guardian grants every right in the Media Release with respect to the Minor’s Likeness.',
    },
    {
      kind: 'conspicuous',
      text: 'GUARDIAN HAS READ THIS ADDENDUM, UNDERSTANDS THAT IT RELEASES AND REQUIRES GUARDIAN TO INDEMNIFY THE RELEASED PARTIES FOR THEIR OWN NEGLIGENCE, AND SIGNS IT VOLUNTARILY.',
    },
    {
      kind: 'paragraph',
      text: 'The paper document is executed here with the Minor’s full legal name and date of birth, and the Guardian’s full legal name, relationship, signature, date, phone, and email. Registering on this site executes it electronically instead.',
    },
  ],
};

export default document;
