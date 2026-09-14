import 'server-only';
import { PRICING, SITE, SITE_URL } from './seo';
import { renderApplicationAlert, type ApplicationAlert } from './email/application-alert';
import { sendReminderEmail } from './notify';

/**
 * Tell Robert a vendor applied, and never at the cost of the application.
 *
 * Same three rules as the parking alert, for the same reason: the row is the
 * thing that matters and the email is a nicety. The caller fires this after the
 * insert, does not await it, and cannot be reached by anything that goes wrong
 * in here. check-booking-shape drives it with a sender that throws.
 *
 * A separate file from the route so nothing on the save path imports a mailer.
 */

export function spotLabelFor(spotType: string): string {
  if (spotType === 'truck') return PRICING.truck.label;
  if (spotType === 'booth') return PRICING.booth.label;
  if (spotType === 'free') return PRICING.free.label;
  return spotType;
}

export async function sendApplicationAlert(
  input: Omit<ApplicationAlert, 'trackerUrl'>
): Promise<boolean> {
  try {
    const message = renderApplicationAlert({
      ...input,
      trackerUrl: `${SITE_URL}/admin`,
    });

    return await sendReminderEmail(SITE.ownerEmail, message);
  } catch (err) {
    console.error('could not send the application alert', err);
    return false;
  }
}
