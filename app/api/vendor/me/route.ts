import { NextResponse } from 'next/server';
import { currentVendor } from '@/lib/vendors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The signed in vendor's details, for prefilling the application form.
 *
 * Fetched by the form after mount rather than rendered into the page, and that
 * is the whole reason this route exists. Reading the session cookie on the
 * homepage would opt it out of ISR and put a database round trip in front of
 * every anonymous visitor, to prefill a form almost none of them can use. The
 * homepage stays static at revalidate 60 and only a signed in vendor pays.
 *
 * Returns what the form needs and nothing else. No storage paths, because the
 * browser cannot read the private buckets anyway, and nothing about a
 * signature, because a profile holds none.
 */
export async function GET() {
  const vendor = await currentVendor();
  if (!vendor) return NextResponse.json({ ok: true, profile: null });

  return NextResponse.json({
    ok: true,
    profile: {
      businessName: vendor.business_name ?? '',
      contactName: vendor.contact_name ?? '',
      phone: vendor.phone ?? '',
      email: vendor.email,
      sells: vendor.sells ?? '',
      servesFood: Boolean(vendor.serves_food),
      hasLogo: Boolean(vendor.logo_path),
      photoCount: (vendor.photo_paths ?? []).length,
      hasPermit: Boolean(vendor.permit_path),
      permitExpiresAt: vendor.permit_expires_at ?? '',
    },
  });
}
