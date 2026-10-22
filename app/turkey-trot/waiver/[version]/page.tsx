import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { getRaceWaiverVersion, RACE_WAIVER_VERSIONS } from '@/lib/race-waiver/registry';
import { waiverParts } from '@/lib/race-waiver/types';
import { OG_IMAGE, SITE_URL } from '@/lib/seo';
import { HAS_OG, OG_SIZE, RACE_ASSETS } from '@/lib/race-assets';

/**
 * One permanent page per waiver version.
 *
 * A signed row carries a waiver_version, and until now that string resolved to
 * text rendered inside a registration form: present while the form was on
 * screen and nowhere else. Here it resolves to a URL that keeps working, which
 * is a better record than inline text and a better answer to "what exactly did
 * I agree to" than asking somebody to re-open a form.
 *
 * Server rendered, every version, including the ones no longer offered. A
 * version directory that only serves the current document is not a record.
 */

export const revalidate = 86400;

export function generateStaticParams() {
  /* Every version ever issued, so each is a static page rather than a lookup. */
  return RACE_WAIVER_VERSIONS.map((doc) => ({ version: doc.version }));
}

export async function generateMetadata({
  params,
}: {
  params: { version: string };
}): Promise<Metadata> {
  const doc = getRaceWaiverVersion(decodeURIComponent(params.version));
  if (!doc) return { title: { absolute: 'Waiver not found | Coyoteville' } };

  const title = `Turkey Trot waiver ${doc.version} | Coyoteville`;

  return {
    title: { absolute: title },
    description: `The full Participant Agreement, Media Release and Parent or Legal Guardian Addendum for the Coyoteville 1st Annual Turkey Trot, version ${doc.version}.`,
    alternates: { canonical: `${SITE_URL}/turkey-trot/waiver/${doc.version}` },
    /* The same share card as the rest of the race. A document page shared
       without one shows whatever the platform guesses, which for a wall of
       legal text is nothing. */
    openGraph: {
      title,
      url: `${SITE_URL}/turkey-trot/waiver/${doc.version}`,
      type: 'article',
      images: HAS_OG
        ? [{ url: `${SITE_URL}${RACE_ASSETS.og}`, ...(OG_SIZE ?? {}) }]
        : [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      images: HAS_OG ? [`${SITE_URL}${RACE_ASSETS.og}`] : [OG_IMAGE],
    },
    /* Indexable: a participant looking for what they signed should be able to
       find it, and a draft should be findable as a draft. */
    robots: { index: true, follow: true },
  };
}

export default function WaiverVersionPage({ params }: { params: { version: string } }) {
  const doc = getRaceWaiverVersion(decodeURIComponent(params.version));
  if (!doc) notFound();

  const parts = waiverParts(doc);

  return (
    <>
      <Nav />
      <main id="main">
        <section className="section section--char">
          <div className="shell">
            <p className="eyebrow">Version {doc.version}</p>
            <h1 className="racehero__h1 waiverpage__h1">
              {parts.length === 1 ? 'The waiver' : 'The documents you sign'}
            </h1>

            <p className="lede">
              {doc.isDraft
                ? 'This version is a draft and has not been reviewed by a lawyer. It is published so it can be read in full.'
                : `The complete text of ${doc.entity}'s race documents as executed, in ${
                    parts.length === 1 ? 'one document' : `${parts.length} documents`
                  }.`}
            </p>

            {/* A table of contents, because this is fourteen pages and
                somebody arriving from an acknowledgment checkbox wants the
                document that checkbox named. */}
            {parts.length > 1 ? (
              <ol className="waiverpage__toc">
                {parts.map((part) => (
                  <li key={part.id}>
                    <a href={`#${part.id}`}>{part.title}</a>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        </section>

        <div className="stripeband" aria-hidden="true" />

        <section className="section section--cream">
          <div className="shell waiverpage">
            {parts.map((part) => (
              <article key={part.id} id={part.id} className="waiverpage__doc">
                {part.title ? <h2 className="waiverpage__title">{part.title}</h2> : null}

                {part.blocks.map((block, i) => {
                  if (block.kind === 'heading') {
                    return (
                      <h3 key={i} className="waiverpage__h">
                        {block.text}
                      </h3>
                    );
                  }

                  /* Article 2.2 recites that the release and indemnity
                     provisions are set in capital letters so as to be
                     conspicuous. The capitals come from the document; setting
                     them apart on screen is the half the rendering owes. */
                  if (block.kind === 'conspicuous') {
                    return (
                      <p key={i} className="waiverpage__conspicuous">
                        {block.text}
                      </p>
                    );
                  }

                  if (block.kind === 'list') {
                    return (
                      <ol key={i} className="waiverpage__list">
                        {(block.items ?? []).map((item, j) => (
                          <li key={j}>{item}</li>
                        ))}
                      </ol>
                    );
                  }

                  return <p key={i}>{block.text}</p>;
                })}
              </article>
            ))}

            {/* Article 14.4, in the document's own terms. */}
            <p className="waiverpage__paper">
              Participant may obtain a paper copy of this Agreement at no charge by written
              request to the Organizer through the contact information published at
              coyoteville.com, and may withdraw consent to electronic records before signing by
              declining to register online and signing a paper form at packet pickup.
            </p>

            <p className="race__cta">
              <a className="btn btn--primary" href="/turkey-trot#register">
                Back to registration
              </a>
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
