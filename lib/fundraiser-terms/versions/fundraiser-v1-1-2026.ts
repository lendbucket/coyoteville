/**
 * The program terms, live now, under the name Parking Fundraiser.
 *
 * Identical to fnf-v1.0-2026 in substance. Exactly one block differs, the one
 * that says the program's name out loud, which is why the rename got a version
 * of its own rather than editing the text under rows that had already signed it.
 *
 * Frozen, like every file in this directory. NEVER EDIT IT. A change to the
 * terms is a new file, a new version string, and two lines in current.ts and
 * registry.ts.
 */
import type { TermsDocument } from '../types';

const blocks: TermsDocument['blocks'] = [
  {
    kind: "paragraph",
    text: "This is an agreement between Coyoteville and your organization for services at a Coyoteville event. It is not a gift, a grant or a donation. Your organization works the event and is paid a share of the parking money it helps collect.",
  },
  {
    kind: "heading",
    text: "1. What your organization agrees to do",
  },
  {
    kind: "paragraph",
    text: "For the game you are selected for, your organization will run parking, keep the lot clean during and after the event, and help keep the crowd in good order. Coyoteville will tell you where to be and when, and someone from Coyoteville is on site the whole time.",
  },
  {
    kind: "list",
    items: [
      "Bring at least 6 adults, aged 18 or over, for the whole shift.",
      "Arrive when Coyoteville asks, which is normally before gates open, and stay until the lot is clear.",
      "Direct vehicles, collect the parking fee, and hand every dollar to Coyoteville as collected.",
      "Pick up litter across the lot during the event and walk it once more at the end.",
      "Point people to Coyoteville staff for anything involving alcohol, a dispute or an injury. Your volunteers do not handle those.",
    ],
  },
  {
    kind: "heading",
    text: "2. Volunteers, adults and anyone under 18",
  },
  {
    kind: "paragraph",
    text: "Every individual who works the event signs a waiver on the night, before they start. Coyoteville provides the form. A volunteer who has not signed one does not work.",
  },
  {
    kind: "conspicuous",
    text: "ANYONE UNDER 18 MAY HELP ONLY WITH A PARENT OR GUARDIAN PRESENT ON SITE FOR THE WHOLE SHIFT, AND MAY NOT DIRECT TRAFFIC OR STAND IN A TRAFFIC LANE AT ANY TIME. MINORS DO NOT COUNT TOWARD THE 6 ADULT MINIMUM.",
  },
  {
    kind: "heading",
    text: "3. What your organization is paid",
  },
  {
    kind: "paragraph",
    text: "Your organization receives 50 percent of the gross parking revenue for that game. Gross means every vehicle counted at the gate at $10 per vehicle, before any expense of any kind is taken out. Nothing is deducted before the split.",
  },
  {
    kind: "paragraph",
    text: "Coyoteville counts the vehicles and determines the parking revenue for the game. That figure is published on the Parking Fundraiser page alongside your organization's name and the amount paid, so the arithmetic is visible to anyone who wants to check it.",
  },
  {
    kind: "paragraph",
    text: "Payment is made within 7 days of the game, by check or by whatever method the two of us agree.",
  },
  {
    kind: "heading",
    text: "4. If your organization does not turn up",
  },
  {
    kind: "conspicuous",
    text: "IF YOUR ORGANIZATION DOES NOT ARRIVE WITH AT LEAST 6 ADULTS AT THE AGREED TIME, IT FORFEITS ITS SHARE FOR THAT GAME IN FULL. COYOTEVILLE WILL STILL RUN PARKING AND WILL OWE YOUR ORGANIZATION NOTHING FOR THAT NIGHT.",
  },
  {
    kind: "paragraph",
    text: "Tell us as early as you can if something has gone wrong. A game you withdraw from in advance does not count against you and we will put you back in the draw for a later one. Not turning up without telling us does.",
  },
  {
    kind: "heading",
    text: "5. How organizations are selected",
  },
  {
    kind: "paragraph",
    text: "One organization works each home game. The organization is drawn at random from the eligible applications for that game. Until every applicant has had a game, an organization that has already been awarded one is left out of the draw, so the first game an organization works is not the last.",
  },
  {
    kind: "paragraph",
    text: "Applying does not guarantee a game. Coyoteville may decline any application, and may end this program or change these terms for future games at any time. Neither affects a game you have already been awarded.",
  },
  {
    kind: "heading",
    text: "6. Insurance, conduct and liability",
  },
  {
    kind: "paragraph",
    text: "Your volunteers are your organization's people, not Coyoteville's employees, and your organization is responsible for their conduct. Coyoteville is not responsible for injury to or loss suffered by your volunteers, beyond what the law requires of it as the operator of the site.",
  },
  {
    kind: "paragraph",
    text: "Coyoteville may ask any individual to stop working the event at any time, for any reason. If that leaves your organization below 6 adults, the forfeit in Section 4 does not apply.",
  },
  {
    kind: "heading",
    text: "7. Weather and cancellation",
  },
  {
    kind: "paragraph",
    text: "Events run rain or shine. If Coyoteville shortens or cancels a game, the parking revenue for that game is whatever was actually collected, and your organization is paid half of it on the same terms. If no parking was collected there is nothing to split, and your organization goes back into the draw for a later game.",
  },
  {
    kind: "heading",
    text: "8. Disputes",
  },
  {
    kind: "conspicuous",
    text: "WHERE THE TWO OF US DISAGREE ABOUT WHAT WAS COLLECTED, WHAT WAS OWED, OR WHETHER THE OBLIGATIONS IN THIS AGREEMENT WERE MET, COYOTEVILLE MAKES THE FINAL DETERMINATION. THIS AGREEMENT IS GOVERNED BY THE LAWS OF THE STATE OF TEXAS.",
  },
  {
    kind: "heading",
    text: "9. Signature",
  },
  {
    kind: "paragraph",
    text: "Typing your name below is your signature, and is intended to have the same effect as a signature on paper under the Texas Uniform Electronic Transactions Act. You confirm you are authorized to enter into this agreement for your organization.",
  },
];

const document: TermsDocument = {
  version: "fundraiser-v1.1-2026",
  entity: "Coyoteville Alice LLC",
  programName: "Parking Fundraiser",
  blocks,
};

export default document;
