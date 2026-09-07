import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import VendorProfileForm, { type ProfileView } from '@/components/VendorProfileForm';
import { currentVendor, permitRefusal, permitStanding } from '@/lib/vendors';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your vendor details',
  description: 'Your saved Coyoteville vendor details.',
  robots: { index: false, follow: false },
};

export default async function VendorProfilePage() {
  const profile = await currentVendor();
  if (!profile) redirect('/vendor/login');

  /* Checked against today rather than any one event, because this page is not
     booking anything. The application form re-checks it against the date being
     booked, which is the check that actually gates a signup. */
  const standing = permitStanding(profile, null);

  const view: ProfileView = {
    email: profile.email,
    business_name: profile.business_name ?? '',
    contact_name: profile.contact_name ?? '',
    phone: profile.phone ?? '',
    sells: profile.sells ?? '',
    serves_food: Boolean(profile.serves_food),
    hasLogo: Boolean(profile.logo_path),
    photoCount: (profile.photo_paths ?? []).length,
    hasPermit: Boolean(profile.permit_path),
    permitExpiresAt: profile.permit_expires_at ?? '',
    permitProblem: profile.permit_path ? permitRefusal(standing, 'today') : null,
  };

  return (
    <>
      <Nav />
      <main id="main" className="section vprofile">
        <div className="shell">
          <h1>Your details</h1>
          <p className="muted vprofile__lede">
            Saved for next time. When you apply while signed in, this fills the form in for you and
            you keep the files you have already uploaded.
          </p>

          {/* Rule one, said out loud where the vendor can see it, because it is
              the thing somebody would otherwise assume a profile does. */}
          <p className="formnote" role="note">
            Your signature is not saved here. You sign the vendor agreement fresh on every
            application, which is what makes it a signature.
          </p>

          <VendorProfileForm profile={view} />

          <form method="POST" action="/api/vendor/logout" className="vprofile__out">
            <button className="btn btn--ghost btn--sm" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </main>
      <Footer />
    </>
  );
}
