import type { Metadata } from 'next';
import DeadlineBarMount from '@/components/DeadlineBarMount';
import Nav from '@/components/Nav';
import Hero from '@/components/Hero';
import Ticker from '@/components/Ticker';
import EventsSection from '@/components/EventsSection';
import Split from '@/components/Split';
import Mission from '@/components/Mission';
import GameNight from '@/components/GameNight';
import Stats from '@/components/Stats';
import About from '@/components/About';
import VendorSpotlight from '@/components/VendorSpotlight';
import Pricing from '@/components/Pricing';
import PermanentSpot from '@/components/PermanentSpot';
import HowItWorks from '@/components/HowItWorks';
import EventCountdownSection from '@/components/EventCountdownSection';
import PastVendors from '@/components/PastVendors';
import Faq from '@/components/Faq';
import EmailCapture from '@/components/EmailCapture';
import Visit from '@/components/Visit';
import Footer from '@/components/Footer';
import JsonLd from '@/components/JsonLd';
import { homeSchemaGraph } from '@/lib/seo';
import { getDefaultEvent, getSelectableEvents } from '@/lib/event-schedule';
import { supportEmail } from '@/lib/support';

/**
 * The apply form, split out of the initial JavaScript.
 *
 * It is the largest client component on the site by a wide margin: the form
 * itself, the waitlist form, the day picker, the card on file fields, the
 * fireworks, and the full text of the current vendor agreement, which together
 * were about nineteen of the page's twenty two kilobytes of client code. All of
 * it sits roughly four fifths of the way down a long marketing page, behind a
 * scroll nobody makes before the hero has painted.
 *
 * ssr is deliberately left on. The form has to be in the prerendered HTML: it
 * is the page's conversion point and its content is indexed, and somebody with
 * JavaScript off still gets a rendered form rather than a hole. This only
 * defers the hydration bundle, not the markup.
 *
 * Not the LCP element and not above the fold. The LCP is the hero photograph,
 * which is preloaded at high priority in Hero.tsx and is untouched by this.
 */
import ApplySectionLazy from '@/components/ApplySectionLazy';

/**
 * Revalidated on an interval so the live spot counts stay fresh without a
 * database read on every request. lib/spots also caches briefly in process, so
 * a burst of traffic hits Postgres once, not once per visitor.
 *
 * This is also what retires a finished event without a deploy. Event state is
 * computed from the clock inside the render, so the next revalidation after an
 * event ends drops it from the cards, the form's dropdown and the structured
 * data: a minute at worst, on a thing that changes at three in the morning.
 *
 * Deliberately not force-dynamic. This is the marketing page and it is the one
 * that takes real traffic; making it dynamic would put a database round trip on
 * every visitor to save at most sixty seconds on a transition nobody is
 * watching.
 */
export const revalidate = 60;

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default async function HomePage() {
  // The picker offers every published event, closed and full ones included,
  // because those are the ones a vendor joins the waitlist for. Only the live
  // state travels to the browser; the rest of ScheduledEvent stays server side.
  const [selectable, defaultEvent] = await Promise.all([
    getSelectableEvents(),
    getDefaultEvent(),
  ]);

  const eventOptions = selectable.map((e) => ({
    slug: e.slug,
    name: e.name,
    displayDate: e.displayDate,
    lifecycle: e.lifecycle,
    isOpen: e.isOpen,
    deadlinePassed: e.deadlinePassed,
    isFull: e.isFull,
    signupClosesDisplay: e.signupClosesDisplay,
    remaining: e.remaining,
    boothOpen: e.boothOpen,
    truckOpen: e.truckOpen,
  }));

  return (
    <>
      <JsonLd schemas={homeSchemaGraph(supportEmail())} />
      <DeadlineBarMount />
      <Nav />

      <main id="main">
        <Hero />
        <Ticker />
        <EventsSection />
        <Split />
        <Mission />
        <GameNight />
        <Stats />
        <About />
        <VendorSpotlight />
        <Pricing />
        {/* Straight after the per event prices, because the argument for a
            permanent spot is entirely a comparison against them. */}
        <PermanentSpot />
        <HowItWorks />
        <EventCountdownSection />
        <PastVendors />
        <ApplySectionLazy
          events={eventOptions}
          defaultSlug={defaultEvent?.slug ?? ''}
          supportEmail={supportEmail()}
        />
        <Faq />
        <EmailCapture />
        <Visit />
      </main>

      <Footer />
    </>
  );
}
