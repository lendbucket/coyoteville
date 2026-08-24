import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Hero from '@/components/Hero';
import Ticker from '@/components/Ticker';
import Split from '@/components/Split';
import Stats from '@/components/Stats';
import About from '@/components/About';
import Gallery from '@/components/Gallery';
import Pricing from '@/components/Pricing';
import PastVendors from '@/components/PastVendors';
import VendorForm from '@/components/VendorForm';
import Faq from '@/components/Faq';
import EmailCapture from '@/components/EmailCapture';
import Visit from '@/components/Visit';
import Footer from '@/components/Footer';
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
        <Ticker />
        <Split />
        <Stats />
        <About />
        <Gallery />
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
