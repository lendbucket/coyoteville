import type { Metadata } from 'next';
import VolunteerWaiverForm from '@/components/VolunteerWaiverForm';
import { WAIVER, WAIVER_VERSION } from '@/lib/volunteer-waiver/current';
import { getEventBySlug, getEvents } from '@/lib/events-source';
import { endsAtMs } from '@/lib/events-source';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { PROGRAM_NAME, VOLUNTEER_MINIMUM } from '@/lib/parking-fundraiser';
import { supportEmail } from '@/lib/support';
import type { EventConfig } from '@/lib/seo';

/**
 * The volunteer waiver, reached from a QR code taped to the table.
 *
 * /volunteer?event=<slug>&org=<org_application_id>
 *
 * Dynamic, and it has to be: the whole page is about one specific night, the
 * event comes off the query string, and the organization name is read from the
 * database. Nothing here is cacheable and nothing here is public in the sense
 * the rest of the site is. It is a form for eleven people standing in a lot.
 *
 * Not in the sitemap and marked noindex. This is not a page anybody should
 * arrive at from a search: the link is a QR code, and a waiver for a game that
 * finished last month indexed under "Coyoteville volunteer" helps nobody.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Volunteer waiver',
  description: 'Sign the volunteer waiver before you work a game at Coyoteville.',
  robots: { index: false, follow: false },
};

/**
 * The event this waiver is for.
 *
 * The slug from the QR when it names one we know about, otherwise the soonest
 * game that has not finished. The fallback is what makes a hand typed
 * /volunteer work at all, and on the night there is only one plausible answer
 * to which game somebody standing in the lot means.
 */
async function resolveEvent(slug: string | undefined): Promise<EventConfig | null> {
  if (slug) {
    const named = await getEventBySlug(slug);
    if (named) return named;
  }

  const now = Date.now();
  const upcoming = (await getEvents())
    .filter((e) => endsAtMs(e) > now)
    .sort((a, b) => Date.parse(a.startISO) - Date.parse(b.startISO));

  return upcoming[0] ?? null;
}

/** The organization the QR named, so the page can say who they are with. */
async function resolveOrg(id: string | undefined): Promise<{ id: string; name: string } | null> {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !isSupabaseConfigured()) return null;

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('org_applications')
      .select('id, org_name')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    return { id: (data as { id: string }).id, name: (data as { org_name: string }).org_name };
  } catch (err) {
    /* A name is a nicety. A read that fails must not stop somebody signing. */
    console.error('could not read the organization for a waiver', err);
    return null;
  }
}

export default async function VolunteerPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const one = (k: string) => {
    const v = searchParams[k];
    return (Array.isArray(v) ? v[0] : v) ?? undefined;
  };

  const [event, org] = await Promise.all([resolveEvent(one('event')), resolveOrg(one('org'))]);

  /* No game to sign for. Said plainly rather than shown as an empty form: a
     waiver that files against nothing is worse than a sentence explaining
     there is nothing to file against. */
  if (!event) {
    return (
      <main className="vol" id="main">
        <div className="vol__shell">
          <p className="vol__eyebrow">Coyoteville</p>
          <h1 className="vol__title">Volunteer waiver</h1>
          <p className="lede">
            There is no game scheduled to sign for right now. Find Coyoteville staff, or email{' '}
            <a href={`mailto:${supportEmail()}`}>{supportEmail()}</a>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="vol" id="main">
      <div className="vol__shell">
        <p className="vol__eyebrow">Coyoteville {PROGRAM_NAME}</p>
        <h1 className="vol__title">Volunteer waiver</h1>

        <p className="vol__event">
          <b>{event.name}</b>
          <span className="vol__event-date">{event.displayDate}</span>
        </p>

        {org ? (
          <p className="vol__org">
            You are signing as a volunteer with <b>{org.name}</b>.
          </p>
        ) : (
          <p className="vol__org vol__org--none">
            Signing without an organization against your name. If you are here with a group, ask
            them for their QR code instead.
          </p>
        )}

        <p className="hint vol__intro">
          Everybody who works tonight signs this before they start. It takes about a minute. Adults
          count toward the {VOLUNTEER_MINIMUM} your organization promised.
        </p>

        <VolunteerWaiverForm
          waiver={WAIVER}
          waiverVersion={WAIVER_VERSION}
          eventSlug={event.slug}
          eventName={event.name}
          eventDate={event.displayDate}
          eventDay={event.date}
          orgId={org?.id ?? null}
          orgName={org?.name ?? null}
          supportEmail={supportEmail()}
        />
      </div>
    </main>
  );
}
