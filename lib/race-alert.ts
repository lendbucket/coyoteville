import 'server-only';
import { SITE, SITE_URL } from './seo';
import { renderRaceAlert, type RaceAlert } from './email/race-alert';
import { renderRaceConfirmation, type RaceConfirmation } from './email/race-confirmation';
import { sendReminderEmail } from './notify';

/**
 * The two race emails, both unable to fail a registration.
 *
 * Same three rules as the parking and vendor alerts, for the same reason: the
 * rows are already written by the time either of these runs, and a mailer that
 * is down must not turn a saved registration into an error a runner sees.
 * Callers fire these without awaiting and cannot be reached by anything that
 * goes wrong in here.
 */

export async function sendRaceAlert(input: Omit<RaceAlert, 'trackerUrl'>): Promise<boolean> {
  try {
    const message = renderRaceAlert({ ...input, trackerUrl: `${SITE_URL}/admin` });
    return await sendReminderEmail(SITE.ownerEmail, message);
  } catch (err) {
    console.error('could not send the race alert', err);
    return false;
  }
}

export async function sendRaceConfirmation(
  to: string,
  input: Omit<RaceConfirmation, 'raceUrl'>
): Promise<boolean> {
  try {
    const message = renderRaceConfirmation({ ...input, raceUrl: `${SITE_URL}/turkey-trot` });
    return await sendReminderEmail(to, message);
  } catch (err) {
    console.error('could not send the race confirmation', err);
    return false;
  }
}

/**
 * The owner alert when a race payment settles.
 *
 * Reads the row back rather than taking it from the webhook, because the
 * webhook knows a reference and an amount and nothing about who it was. Never
 * awaited by the caller and incapable of failing it.
 */
export async function sendRaceSettledAlert(reference: {
  kind: 'registration' | 'group' | 'sponsor';
  raceSlug: string;
  id: string;
}): Promise<boolean> {
  try {
    const { getSupabaseAdmin, isSupabaseConfigured } = await import('./supabase');
    if (!isSupabaseConfigured()) return false;

    const supabase = getSupabaseAdmin();

    if (reference.kind === 'sponsor') {
      const { data } = await supabase
        .from('race_sponsors')
        .select('business_name, contact_name, email, phone, level, amount_cents')
        .eq('id', reference.id)
        .maybeSingle();

      const row = data as {
        business_name: string;
        contact_name: string | null;
        email: string | null;
        phone: string | null;
        level: string;
        amount_cents: number | null;
      } | null;

      if (!row) return false;

      return await sendRaceAlert({
        stage: 'paid',
        raceName: reference.raceSlug,
        what: `Sponsorship, ${row.level}`,
        leadName: row.business_name,
        email: row.email ?? '',
        phone: row.phone ?? '',
        runners: [],
        amountCents: row.amount_cents ?? 0,
        paymentStatus: 'paid',
        taken: 0,
        capacity: 0,
      });
    }

    const table = reference.kind === 'group' ? 'race_groups' : 'race_registrations';
    const columns =
      reference.kind === 'group'
        ? 'captain_name, captain_email, captain_phone, group_name, runner_count, amount_cents'
        : 'first_name, last_name, email, phone, age_on_race_day, shirt_size, is_minor, amount_cents';

    const { data } = await supabase
      .from(table)
      .select(columns)
      .eq('id', reference.id)
      .maybeSingle();

    if (!data) return false;

    if (reference.kind === 'group') {
      const row = data as unknown as {
        captain_name: string;
        captain_email: string;
        captain_phone: string;
        group_name: string;
        runner_count: number;
        amount_cents: number | null;
      };

      return await sendRaceAlert({
        stage: 'paid',
        raceName: reference.raceSlug,
        what: `${row.group_name}, ${row.runner_count} runners`,
        leadName: row.captain_name,
        email: row.captain_email,
        phone: row.captain_phone,
        runners: [],
        amountCents: row.amount_cents ?? 0,
        paymentStatus: 'paid',
        taken: 0,
        capacity: 0,
      });
    }

    const row = data as unknown as {
      first_name: string;
      last_name: string;
      email: string;
      phone: string;
      age_on_race_day: number | null;
      shirt_size: string | null;
      is_minor: boolean | null;
      amount_cents: number | null;
    };

    return await sendRaceAlert({
      stage: 'paid',
      raceName: reference.raceSlug,
      what: 'Just me',
      leadName: `${row.first_name} ${row.last_name}`,
      email: row.email,
      phone: row.phone,
      runners: [
        {
          name: `${row.first_name} ${row.last_name}`,
          age: row.age_on_race_day,
          shirt: row.shirt_size,
          minor: row.is_minor === true,
        },
      ],
      amountCents: row.amount_cents ?? 0,
      paymentStatus: 'paid',
      taken: 0,
      capacity: 0,
    });
  } catch (err) {
    console.error('could not send the settled race alert', err);
    return false;
  }
}
