import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { storeUpload, validateUpload, UploadError, MAX_PHOTOS } from '@/lib/uploads';
import { currentVendor, VENDOR_COLUMNS } from '@/lib/vendors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Save a vendor's profile.
 *
 * The same server side upload path the application form uses: the file is
 * validated, sniffed and stored by this route into the same private buckets,
 * and the browser never holds a key that could write to storage directly.
 *
 * Files are keyed under the profile id rather than an application id, which is
 * what lets them outlive any one application. An application that reuses them
 * copies the path onto its own row, so it stays frozen when the profile changes.
 */

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return bad('The profile is not connected yet.', 503);

  const vendor = await currentVendor();
  if (!vendor) return bad('Sign in again to save your details.', 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad('That did not arrive in full. Check your signal and try again.');
  }

  const str = (k: string) => String(form.get(k) ?? '').trim();

  const business_name = str('business_name');
  const contact_name = str('contact_name');
  const phone = str('phone');
  const sells = str('sells');
  const serves_food = form.get('serves_food') === 'true';
  const permit_expires_at = str('permit_expires_at');

  if (business_name.length < 2 || business_name.length > 120) return bad('Give us your business name.');
  if (contact_name.length < 2 || contact_name.length > 120) return bad('Give us a contact name.');

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return bad('That phone number does not look right.');
  if (sells.length < 2 || sells.length > 300) return bad('Tell us what you sell.');

  if (permit_expires_at && !DATE_RE.test(permit_expires_at)) {
    return bad('The permit expiry date has to be a real date.');
  }

  const patch: Record<string, unknown> = {
    business_name,
    contact_name,
    phone,
    sells,
    serves_food,
    updated_at: new Date().toISOString(),
  };

  try {
    const logo = form.get('logo');
    if (logo instanceof File && logo.size > 0) {
      patch.logo_path = await storeUpload(await validateUpload(logo, 'logo', 'Your logo'), vendor.id);
    }

    const permit = form.get('permit');
    if (permit instanceof File && permit.size > 0) {
      /* An expiry date is required with a permit, every time, profile or not.
         A stored permit with no expiry is one we cannot vouch for, and this is
         the only place a profile permit can be set. */
      if (!permit_expires_at) {
        return bad('Add the expiry date printed on your health permit.');
      }
      patch.permit_path = await storeUpload(
        await validateUpload(permit, 'permit', 'Your health permit'),
        vendor.id
      );
      patch.permit_expires_at = permit_expires_at;
    } else if (permit_expires_at && vendor.permit_path) {
      // Correcting the date on a permit already on file.
      patch.permit_expires_at = permit_expires_at;
    }

    const photos = form.getAll('photos').filter((p): p is File => p instanceof File && p.size > 0);
    if (photos.length) {
      if (photos.length > MAX_PHOTOS) return bad(`Up to ${MAX_PHOTOS} photos.`);
      const paths: string[] = [];
      let index = 0;
      for (const photo of photos) {
        paths.push(
          await storeUpload(await validateUpload(photo, 'photo', 'A photo'), vendor.id, index)
        );
        index += 1;
      }
      patch.photo_paths = paths;
    }
  } catch (err) {
    if (err instanceof UploadError) return bad(err.message, 422);
    console.error('profile upload failed', vendor.id, err);
    return bad('We could not save that file. Try a different one.', 502);
  }

  const { data, error } = await getSupabaseAdmin()
    .from('vendors')
    .update(patch)
    .eq('id', vendor.id)
    .select(VENDOR_COLUMNS)
    .single();

  if (error) {
    console.error('could not save the vendor profile', vendor.id, error);
    return bad('We could not save your details. Try again in a minute.', 500);
  }

  return NextResponse.json({ ok: true, profile: data });
}
