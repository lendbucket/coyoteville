import 'server-only';
import { SITE_URL } from './seo';
import { SITE } from './seo';
import { eventNameFor } from './events-source';
import { getAwardedOrg, getParkingTotals } from './parking';
import { renderParkingAlert } from './email/parking-alert';
import { sendReminderEmail } from './notify';

/**
 * The alert for one payment, sent after the row is already written.
 *
 * Every read in here happens after the insert and none of them can affect it.
 * The whole function is one try/catch returning a boolean: it has no failure
 * mode the caller has to handle, because the caller is the Square webhook and
 * the only thing that matters there is that the row landed and Square got a
 * 200.
 *
 * It is a separate file from lib/parking.ts on purpose. lib/parking.ts is
 * imported by the page that records a payment; nothing on that path should be
 * able to reach the mailer at all.
 */
export async function sendParkingAlert(input: {
  eventSlug: string;
  kind: 'parking' | 'donation';
  amountCents: number;
  /** Overridable for tests. Defaults to now. */
  at?: Date;
}): Promise<boolean> {
  try {
    /* Read after the write, so the running totals in the message include the
       payment that triggered it. */
    const [totals, org, eventName] = await Promise.all([
      getParkingTotals(input.eventSlug),
      getAwardedOrg(input.eventSlug),
      eventNameFor(input.eventSlug),
    ]);

    const at = (input.at ?? new Date()).toLocaleTimeString('en-US', {
      timeZone: 'America/Chicago',
      hour: 'numeric',
      minute: '2-digit',
    });

    const message = renderParkingAlert({
      kind: input.kind,
      amountCents: input.amountCents,
      at,
      orgName: org?.name ?? null,
      eventName,
      totals: {
        cents: totals.cents,
        vehicles: totals.vehicles,
        donationCents: totals.donationCents,
        donations: totals.donations,
        owedCents: totals.owedCents,
      },
      trackerUrl: `${SITE_URL}/admin`,
    });

    return await sendReminderEmail(SITE.ownerEmail, message);
  } catch (err) {
    console.error('could not send the parking alert', err);
    return false;
  }
}
