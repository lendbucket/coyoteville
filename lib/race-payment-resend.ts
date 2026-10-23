import 'server-only';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { isSquareConfigured } from './square';
import { createRacePaymentLink, raceGroupReferenceId, raceReferenceId } from './race-payment-link';
import { renderRacePaymentLink } from './email/race-payment-link';
import { sendReminderEmail } from './notify';
import { appendNote, lastPayLinkFrom, payLinkNote } from './race-notes';
import { dollars } from './race';
import { supportEmail } from './support';

/**
 * Send a runner the payment link for a registration that already exists.
 *
 * The gap this closes: a complete, signed registration with no way to pay.
 * Square can refuse to create a link after the row is written, and before this
 * existed the only way back to checkout was to fill the whole form again,
 * which produces a second registration and a second waiver for one runner.
 *
 * It reuses the row. Same id, same reference, same amount. It inserts nothing
 * and it does not reprice: the amount is read off the row, because the row is
 * what the runner agreed to, and recomputing it here would let a later change
 * to the pricing constants quietly change a debt somebody already owes.
 *
 * WHERE THE MONEY LIVES. A runner in a family or a team has amount_cents 0 and
 * their money sits on the race_groups row, so for those this sends the group
 * link to the captain for the group amount. Offering that runner a link for
 * their own zero would be a $0 checkout, which Square will not make and which
 * would be the wrong ask anyway.
 *
 * race_groups has no admin_notes column, so a group send is stamped onto every
 * member registration instead. That keeps the record on columns that exist,
 * and whichever member the admin looks at shows that the link went out.
 */

export type ResendResult =
  | { ok: true; sentTo: string; sentAt: string; amountCents: number; grouped: boolean }
  | { ok: false; error: string; status: number };

function refuseReason(status: string | null): string | null {
  if (status === 'paid') return 'That entry is already paid.';
  if (status === 'not_required') return 'That entry is free, so there is nothing to charge.';
  if (status === 'refunded') {
    return 'That entry was refunded. Mailing a payment link to somebody who was refunded is the worst message to send by accident, so this refuses rather than guesses.';
  }
  if (status !== 'unpaid') {
    return `That entry is marked '${status ?? 'unknown'}', not unpaid. Fix the row first if that is wrong.`;
  }
  return null;
}

export async function sendRacePaymentLink(
  registrationId: string,
  race: { slug: string; name: string; displayDate: string; displayTime: string }
): Promise<ResendResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Database is not connected.', status: 503 };
  }

  const supabase = getSupabaseAdmin();

  const { data: row, error } = await supabase
    .from('race_registrations')
    .select(
      'id, race_slug, group_id, first_name, last_name, email, is_minor, guardian_name, guardian_email, amount_cents, payment_status, admin_notes'
    )
    .eq('id', registrationId)
    .maybeSingle();

  if (error || !row) {
    return { ok: false, error: 'That registration was not found.', status: 404 };
  }

  const grouped = Boolean(row.group_id);

  let amountCents = Number(row.amount_cents ?? 0);
  let payTo: string | null = row.is_minor ? (row.guardian_email ?? row.email) : row.email;
  let greetingName: string = row.is_minor ? (row.guardian_name ?? 'Hello') : row.first_name;
  let runnerName: string | null = row.is_minor ? `${row.first_name} ${row.last_name}`.trim() : null;
  let referenceId = raceReferenceId(row.race_slug, row.id);
  let status = row.payment_status as string | null;

  if (grouped) {
    const { data: group, error: groupError } = await supabase
      .from('race_groups')
      .select('id, group_name, captain_name, captain_email, amount_cents, payment_status')
      .eq('id', row.group_id)
      .maybeSingle();

    if (groupError || !group) {
      return {
        ok: false,
        error:
          'That runner belongs to a group that could not be read, so there is no amount to charge.',
        status: 404,
      };
    }

    amountCents = Number(group.amount_cents ?? 0);
    payTo = group.captain_email;
    greetingName = group.captain_name ?? 'Hello';
    runnerName = group.group_name ?? 'Your group';
    referenceId = raceGroupReferenceId(row.race_slug, group.id);
    status = group.payment_status as string | null;
  }

  const refusal = refuseReason(status);
  if (refusal) return { ok: false, error: refusal, status: 409 };

  if (!amountCents || amountCents <= 0) {
    return { ok: false, error: 'There is no amount recorded on that entry to charge.', status: 409 };
  }

  if (!payTo) {
    return {
      ok: false,
      error: grouped
        ? 'That group has no captain email, so there is nowhere to send it.'
        : 'There is no email address on that registration, so there is nowhere to send it.',
      status: 409,
    };
  }

  if (!isSquareConfigured()) {
    return {
      ok: false,
      error: 'Square is not connected, so no payment link can be created.',
      status: 503,
    };
  }

  /* The link first, and its failure carries whatever Square actually said. A
     generic "that did not work" here is how the original bug stayed invisible:
     the admin needs to know whether this is a bad amount, a dead token or an
     outage, and only Square knows which. */
  let payUrl: string;
  try {
    payUrl = await createRacePaymentLink({
      referenceId,
      amountCents,
      lineName: `${race.name}, entry`,
      note: `${race.name}, ${race.displayDate}.`,
      buyerEmail: payTo,
      redirectPath: '/turkey-trot/registered',
    });
  } catch (err) {
    const detail = err instanceof Error && err.message ? err.message : 'Square gave no reason.';
    return {
      ok: false,
      error: `Square did not create the link, so nothing was sent. ${detail}`,
      status: 502,
    };
  }

  const message = renderRacePaymentLink({
    firstName: row.first_name,
    greetingName,
    runnerName,
    raceName: race.name,
    displayDate: race.displayDate,
    displayTime: race.displayTime,
    amountLabel: dollars(amountCents),
    payUrl,
    supportEmail: supportEmail(),
  });

  const sent = await sendReminderEmail(payTo, message);

  if (!sent) {
    return {
      ok: false,
      error:
        'The payment link was created but the email did not go out. Nothing was recorded on the row, so tap again.',
      status: 502,
    };
  }

  /* Recorded only once the send succeeded, and appended, so a second tap reads
     as a second send rather than looking like the first. */
  const stamp = payLinkNote();

  if (grouped) {
    const { data: members } = await supabase
      .from('race_registrations')
      .select('id, admin_notes')
      .eq('group_id', row.group_id);

    for (const member of members ?? []) {
      const { error: memberError } = await supabase
        .from('race_registrations')
        .update({
          admin_notes: appendNote(member.admin_notes, stamp),
          updated_at: new Date().toISOString(),
        })
        .eq('id', member.id);
      if (memberError) console.error('[race] pay link sent but not logged', member.id, memberError);
    }
  } else {
    const { error: noteError } = await supabase
      .from('race_registrations')
      .update({
        admin_notes: appendNote(row.admin_notes, stamp),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (noteError) console.error('[race] pay link sent but not logged', row.id, noteError);
  }

  return {
    ok: true,
    sentTo: payTo,
    sentAt: lastPayLinkFrom(stamp) ?? new Date().toISOString(),
    amountCents,
    grouped,
  };
}
