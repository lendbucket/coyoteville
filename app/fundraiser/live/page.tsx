import type { Metadata } from 'next';
import Brand from '@/components/Brand';
import StringLights from '@/components/StringLights';
import FundraiserLive from '@/components/FundraiserLive';
import { parkingLogoUrl } from '@/components/ParkingOrgBlock';
import { LIVE_PURPOSE, verifyDocumentToken } from '@/lib/doc-token';
import { dateLabel, feeSentence, getLiveSnapshot, timeLabel } from '@/lib/fundraiser-live';
import { PROGRAM_NAME } from '@/lib/parking-fundraiser';
import { supportEmail } from '@/lib/support';

/**
 * The page the organization watches while the game is on.
 *
 * Full brand, unlike /park. This one is opened by the people who worked for the
 * money, on a link they were sent, and shown to the parents standing next to
 * them. It should look like the thing they signed up for.
 *
 * Dynamic, because it is keyed by a token in the URL and there is nothing to
 * cache: two organizations opening this page see two different pages, and the
 * numbers on it are the point.
 *
 * No login. The organization's contact gets the link by text and opens it in a
 * stand; asking them to hold an account for one night means nobody looks at it.
 * The token is unguessable, it is signed against one organization id, and it
 * opens aggregates and a ledger that says nothing about any payer.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your parking fundraiser, live',
  /* A link that gets forwarded to parents and pasted into group chats. It has
     no business in a search index. */
  robots: { index: false, follow: false, nocache: true },
};

function Invalid() {
  return (
    <main className="live" id="main">
      <div className="live__shell">
        <p className="live__eyebrow">Coyoteville {PROGRAM_NAME}</p>
        <h1 className="live__title">This link is not valid</h1>
        <p className="lede">
          It may have been mistyped or replaced. Email{' '}
          <a href={`mailto:${supportEmail()}`}>{supportEmail()}</a> and we will send a new one.
        </p>
      </div>
    </main>
  );
}

export default async function FundraiserLivePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const one = (k: string) => {
    const v = searchParams[k];
    return (Array.isArray(v) ? v[0] : v) ?? '';
  };

  const id = one('id');
  const token = one('t');

  if (!/^[0-9a-f-]{36}$/i.test(id) || !verifyDocumentToken(LIVE_PURPOSE, id, token)) {
    return <Invalid />;
  }

  const snapshot = await getLiveSnapshot(id);
  if (!snapshot) return <Invalid />;

  const logo = await parkingLogoUrl(snapshot.org.logoPath);

  return (
    <main className="live" id="main">
      <StringLights tone="dark" variant="top" swags={5} sag={28} bulbsPerSwag={7} id="live-lights" />

      <div className="live__shell">
        {/* Both marks, theirs first. It is their night and their money; we ran
            the lot. */}
        <div className="live__marks">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="live__orglogo" src={logo} alt={snapshot.org.name} />
          ) : null}
          <span className="live__with">with</span>
          <Brand size={112} />
        </div>

        <p className="live__eyebrow">{PROGRAM_NAME}</p>
        <h1 className="live__title">{snapshot.org.name}</h1>
        <p className="live__event">
          {snapshot.event.name}, {snapshot.event.displayDate}
        </p>

        <FundraiserLive
          id={id}
          token={token}
          endsAtISO={snapshot.event.endsAtISO}
          initial={{
            cents: snapshot.totals.cents,
            vehicles: snapshot.totals.vehicles,
            feeCents: snapshot.totals.feeCents,
            donationCents: snapshot.totals.donationCents,
            donations: snapshot.totals.donations,
            shareCents: snapshot.totals.shareCents,
            owedCents: snapshot.totals.owedCents,
            basis: snapshot.totals.basis,
          }}
          initialLedger={snapshot.ledger.map((line) => ({
            id: line.id,
            time: timeLabel(line.at),
            amountCents: line.amountCents,
            label: line.label,
          }))}
          initialPaidAtISO={snapshot.paidAtISO}
          payByLabel={dateLabel(snapshot.payByISO)}
          feeNote={feeSentence(snapshot.totals.basis)}
          supportEmail={supportEmail()}
        />
      </div>
    </main>
  );
}
