import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe webhook.
 *
 * The raw body is required for signature verification, so read it as text and
 * never touch request.json() here.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret || !isStripeConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header.' }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    console.error('stripe webhook signature verification failed', err);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const applicationId =
          session.metadata?.application_id || session.client_reference_id || null;

        if (!applicationId) {
          console.warn('checkout.session.completed with no application id', session.id);
          break;
        }

        const paymentIntent =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id || null;

        const { error } = await supabase
          .from('vendor_applications')
          .update({
            payment_status: 'paid',
            approval_status: 'approved',
            stripe_session_id: session.id,
            stripe_payment_intent: paymentIntent,
            paid_at: new Date().toISOString(),
            amount_cents: session.amount_total ?? undefined,
          })
          .eq('id', applicationId);

        if (error) {
          console.error('failed to mark application paid', applicationId, error);
          // Non 2xx tells Stripe to retry, which is what we want here.
          return NextResponse.json({ error: 'Database update failed.' }, { status: 500 });
        }

        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        const applicationId =
          session.metadata?.application_id || session.client_reference_id || null;

        if (applicationId) {
          await supabase
            .from('vendor_applications')
            .update({ payment_status: 'expired' })
            .eq('id', applicationId)
            .eq('payment_status', 'unpaid');
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntent =
          typeof charge.payment_intent === 'string' ? charge.payment_intent : null;

        if (paymentIntent) {
          await supabase
            .from('vendor_applications')
            .update({ payment_status: 'refunded' })
            .eq('stripe_payment_intent', paymentIntent);
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error('stripe webhook handler error', event.type, err);
    return NextResponse.json({ error: 'Handler error.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
