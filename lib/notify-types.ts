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
};
