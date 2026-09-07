import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import StringLights from '@/components/StringLights';
import VendorLogin from '@/components/VendorLogin';
import { currentVendor } from '@/lib/vendors';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vendor sign in',
  description: 'Sign in to your Coyoteville vendor details.',
  robots: { index: false, follow: false },
};

export default async function VendorLoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  // Already signed in, so there is nothing to ask for.
  if (await currentVendor()) redirect('/vendor/profile');

  return (
    <>
      <Nav />
      <main id="main" className="section vlogin">
        <StringLights tone="dark" variant="top" swags={5} sag={28} bulbsPerSwag={6} id="vlogin-lights" />
        <div className="shell vlogin__inner">
          <h1>Vendor sign in</h1>
          <p className="muted vlogin__lede">
            Save your details once and the next application is a form that is already filled in.
            Your logo, your photos and your permit stay on file so you are not photographing
            paperwork in the parking lot again.
          </p>
          <VendorLogin initialError={searchParams.error} />
          <p className="hint vlogin__note">
            You do not need an account to apply. The application form works exactly as it always
            has without one.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
