import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getSquare, getSquareLocationId, isSquareConfigured } from '@/lib/square';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { AGREEMENT_VERSION } from '@/components/VendorAgreement';
import { EVENTS, PRICING, SITE_URL, priceForSpot } from '@/lib/seo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Payload = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Server side validation. The client checks are a courtesy, this is the gate. */
function validate(body: Payload) {
  const errors: string[] = [];

  const business_name = str(body.business_name);
  const contact_name = str(body.contact_name);
  const phone = str(body.phone);
  const email = str(body.email).toLowerCase();
  const spot_type = str(body.spot_type);
  const event_slug = str(body.event_slug);
  const sells = str(body.sells);
  const notes = str(body.notes);
  const signature_name = str(body.signature_name);
  const signed_date = str(body.signed_date);

  const waiver_accepted = body.waiver_accepted === true;
  const permits_confirmed = body.permits_confirmed === true;

  if (business_name.length < 2 || business_name.length > 120) {
    errors.push('Give us your business name.');
  }
  if (contact_name.length < 2 || contact_name.length > 120) {
    errors.push('Give us a contact name.');
  }

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15 || phone.length > 32) {
    errors.push('That phone number does not look right.');
  }

  if (!EMAIL_RE.test(email) || email.length > 180) {
    errors.push('That email does not look right.');
  }

  if (!['booth', 'truck', 'free'].includes(spot_type)) {
    errors.push('Pick a spot type.');
  }

  if (!EVENTS.some((e) => e.slug === event_slug)) {
    errors.push('Pick an event.');
  }

  if (sells.length < 2 || sells.length > 300) {
    errors.push('Tell us what you sell.');
  }

  if (notes.length > 2000) {
    errors.push('Trim the notes down a little.');
  }

  if (!waiver_accepted) {
    errors.push('You have to agree to the Vendor Participation Agreement before we can take your application.');
  }

  if (!permits_confirmed) {
    errors.push('You have to confirm you carry your own permits and insurance.');
  }

  if (signature_name.length < 2 || signature_name.length > 120) {
    errors.push('Type your full name in the signature field to sign.');
  }

  return {
    errors,
    value: {
      business_name,
      contact_name,
      phone,
      email,
      spot_type,
      event_slug,
      sells,
      notes: notes || null,
      signature_name,
      signed_date,
      waiver_accepted,
      permits_confirmed,
    },
  };
}

/** Trust the browser date only if it is sane. Otherwise stamp it here. */
function resolveSignedDate(clientDate: string): string {
  const serverDate = new Date();
  const serverISO = serverDate.toISOString().slice(0, 10);

  if (!DATE_RE.test(clientDate)) return serverISO;

  const parsed = Date.parse(`${clientDate}T12:00:00Z`);
  if (Number.isNaN(parsed)) return serverISO;

  const driftDays = Math.abs(parsed - serverDate.getTime()) / 86_400_000;
  return driftDays <= 2 ? clientDate : serverISO;
}

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const userAgent = request.headers.get('user-agent')?.slice(0, 500) || 'unknown';

  // Five applications per ten minutes per address is plenty for a real vendor.
  const limit = rateLimit(`vendor:${ip}`, 5, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many tries. Give it a few minutes and go again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  let body: Payload;
  try {
    body = (await request.json()) as Payload;
  } catch {
    return bad('We could not read that submission.');
  }

  const { errors, value } = validate(body);
  if (errors.length) {
    return bad(errors[0]);
  }

  if (!isSupabaseConfigured()) {
    return bad('The application form is not connected yet. Email us and we will get you set.', 503);
  }

  const amountCents = priceForSpot(value.spot_type);
  if (amountCents === null) {
    return bad('Pick a spot type.');
  }

  const isFree = amountCents === 0;
  const signedDate = resolveSignedDate(value.signed_date);
  const supabase = getSupabaseAdmin();

  const { data: inserted, error: insertError } = await supabase
    .from('vendor_applications')
    .insert({
      business_name: value.business_name,
      contact_name: value.contact_name,
      phone: value.phone,
      email: value.email,
      spot_type: value.spot_type,
      event_slug: value.event_slug,
      sells: value.sells,
      notes: value.notes,

      // Signed agreement record. Version is stamped server side from the constant
      // this deployment actually rendered, never from the client payload.
      waiver_accepted: true,
      permits_confirmed: true,
      signature_name: value.signature_name,
      signed_date: signedDate,
      signed_at: new Date().toISOString(),
      agreement_version: AGREEMENT_VERSION,
      signer_ip: ip,
      signer_user_agent: userAgent,

      amount_cents: amountCents,
      payment_status: isFree ? 'not_required' : 'unpaid',
      approval_status: isFree ? 'approved' : 'pending',
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('vendor_applications insert failed', insertError);
    return bad('We could not save that. Try again in a minute.', 500);
  }

  // Free spots for Coyote groups, booster clubs and nonprofits skip checkout.
  if (isFree) {
    return NextResponse.json({ ok: true, id: inserted.id, checkoutUrl: null });
  }

  if (!isSquareConfigured()) {
    return bad('Payment is not connected yet. Email us and we will get you set.', 503);
  }

  const event = EVENTS.find((e) => e.slug === value.event_slug);
  const spotLabel = value.spot_type === 'truck' ? PRICING.truck.label : PRICING.booth.label;

  try {
    const square = getSquare();
    const locationId = getSquareLocationId();

    // A full order rather than quickPay, because only an order carries
    // referenceId. That id is the application UUID and it is how the webhook
    // maps a completed payment back to the right row.
    const response = await square.checkout.paymentLinks.create({
      idempotencyKey: randomUUID(),
      description: `${spotLabel} at Coyoteville`,
      order: {
        locationId,
        referenceId: inserted.id,
        lineItems: [
          {
            name: `${spotLabel}, ${event ? event.name : 'Coyoteville event'}`,
            quantity: '1',
            basePriceMoney: {
              amount: BigInt(amountCents),
              currency: 'USD',
            },
            note: `${event ? event.displayDate : ''} at Coyoteville, Alice TX. Flat rate, no commission.`.trim(),
          },
        ],
      },
      checkoutOptions: {
        redirectUrl: `${SITE_URL}/vendors/confirmed`,
        askForShippingAddress: false,
        allowTipping: false,
      },
      prePopulatedData: {
        buyerEmail: value.email,
      },
      paymentNote: `Coyoteville vendor spot, application ${inserted.id}`,
    });

    const paymentLink = response.paymentLink;
    const checkoutUrl = paymentLink?.url || paymentLink?.longUrl || null;

    if (!checkoutUrl) {
      throw new Error('Square returned no payment link URL.');
    }

    await supabase
      .from('vendor_applications')
      .update({
        square_order_id: paymentLink?.orderId ?? null,
        square_payment_link_id: paymentLink?.id ?? null,
      })
      .eq('id', inserted.id);

    return NextResponse.json({ ok: true, id: inserted.id, checkoutUrl });
  } catch (err) {
    console.error('square payment link creation failed', err);
    // The application is saved. Only the payment handoff failed.
    return bad(
      'We saved your application but could not start checkout. Email us and we will send a payment link.',
      502
    );
  }
}
