import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Hero from '@/components/Hero';
import EventBar from '@/components/EventBar';
import About from '@/components/About';
import Pricing from '@/components/Pricing';
import PastVendors from '@/components/PastVendors';
import VendorForm from '@/components/VendorForm';
import Faq from '@/components/Faq';
import EmailCapture from '@/components/EmailCapture';
import Visit from '@/components/Visit';
import Footer from '@/components/Footer';
import StringLights from '@/components/StringLights';
import JsonLd from '@/components/JsonLd';
import { homeSchemaGraph } from '@/lib/seo';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return (
    <>
      <JsonLd schemas={homeSchemaGraph()} />
      <Nav />

      <main id="main">
        <Hero />
        <EventBar />
        <About />

        <StringLights tone="light" variant="divider" swags={4} sag={30} bulbsPerSwag={8} id="divider-one" />

        <Pricing />
        <PastVendors />
        <VendorForm />
        <Faq />
        <EmailCapture />
        <Visit />
      </main>

      <Footer />
    </>
  );
}
