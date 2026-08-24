import 'server-only';
import Stripe from 'stripe';

/** Server-only Stripe client. Lazily built so a missing key never breaks the build. */

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.');
  }

  cached = new Stripe(key, {
    apiVersion: '2024-06-20',
    typescript: true,
    appInfo: { name: 'Coyoteville', url: 'https://coyoteville.com' },
  });

  return cached;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
