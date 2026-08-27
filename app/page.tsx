import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Hero from '@/components/Hero';
import Ticker from '@/components/Ticker';
import SpotsMeter from '@/components/SpotsMeter';
import Split from '@/components/Split';
import Mission from '@/components/Mission';
import GameNight from '@/components/GameNight';
import Stats from '@/components/Stats';
import About from '@/components/About';
import VendorSpotlight from '@/components/VendorSpotlight';
import Pricing from '@/components/Pricing';
import HowItWorks from '@/components/HowItWorks';
import EventCountdownSection from '@/components/EventCountdownSection';
import PastVendors from '@/components/PastVendors';
import ApplySection from '@/components/ApplySection';
import Faq from '@/components/Faq';
import EmailCapture from '@/components/EmailCapture';
import Visit from '@/components/Visit';
import Footer from '@/components/Footer';
import JsonLd from '@/components/JsonLd';
import { homeSchemaGraph } from '@/lib/seo';
import { getDefaultEvent, getSelectableEvents } from '@/lib/event-schedule';
import { supportEmail } from '@/lib/support';

/**
 * Revalidated on an interval so the live spot counts stay fresh without a
 * database read on every request. lib/spots also caches briefly in process, so
 * a burst of traffic hits Postgres once, not once per visitor.
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
    isOpen: e.isOpen,
    deadlinePassed: e.deadlinePassed,
    isFull: e.isFull,
    signupClosesDisplay: e.signupClosesDisplay,
    remaining: e.remaining,
  }));

  return (
    <>
      <JsonLd schemas={homeSchemaGraph(supportEmail())} />
      <Nav />

      <main id="main">
        <Hero />
        <Ticker />
        <SpotsMeter />
        <Split />
        <Mission />
        <GameNight />
        <Stats />
        <About />
        <VendorSpotlight />
        <Pricing />
        <HowItWorks />
        <EventCountdownSection />
        <PastVendors />
        <ApplySection
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
