/**
 * Shared shape for the registration emails.
 *
 * Kept out of notify.ts so the templates can import it without pulling in
 * 'server-only' or the Resend client, which lets them be rendered to disk and
 * previewed without any of the send machinery.
 */
export type RegistrationEmail = {
  id: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  spot_type: string;
  event_slug: string;
  event_name: string;
  sells: string;
  notes: string | null;
  serves_food: boolean;
  permit_uploaded: boolean;
  signature_name: string;
  signed_at: string | null;
  agreement_version: string | null;
  amount_cents: number;
  payment_status: string;
  payment_method: 'online' | 'offline' | null;
  /**
   * 'event', 'day' or 'monthly'. Optional so the older callers that only ever
   * dealt with events do not have to be touched, and absent means 'event'.
   */
  booking_kind?: string;
  /**
   * When they are actually setting up, written out: an event date, one
   * ordinary day, or "every day". The confirmation email used to take this
   * from the next event on the calendar, which is right for an event booking
   * and wrong for the other two, so it is passed in rather than assumed.
   */
  booking_when?: string;
};
