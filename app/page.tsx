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
import Gallery from '@/components/Gallery';
import VendorSpotlight from '@/components/VendorSpotlight';
import Pricing from '@/components/Pricing';
import HowItWorks from '@/components/HowItWorks';
import EventCountdownSection from '@/components/EventCountdownSection';
import PastVendors from '@/components/PastVendors';
import VendorForm from '@/components/VendorForm';
import Faq from '@/components/Faq';
import EmailCapture from '@/components/EmailCapture';
import Visit from '@/components/Visit';
import Footer from '@/components/Footer';
import JsonLd from '@/components/JsonLd';
import { homeSchemaGraph, isSignupClosed } from '@/lib/seo';
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

export default function HomePage() {
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
        <Gallery />
        <Pricing />
        <HowItWorks />
        <EventCountdownSection />
        <PastVendors />
        <VendorForm signupClosed={isSignupClosed()} supportEmail={supportEmail()} />
        <Faq />
        <EmailCapture />
        <Visit />
      </main>

      <Footer />
    </>
  );
}
