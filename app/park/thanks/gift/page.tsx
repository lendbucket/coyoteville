import type { Metadata } from 'next';
import ParkThanks from '@/components/ParkThanks';

/**
 * Where Square sends a driver after a gift.
 *
 * Its own route rather than a query string on /park/thanks, so both stay
 * static. Square is told which URL each kind of payment redirects to, which it
 * has to be told anyway.
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Thank you',
  robots: { index: false, follow: false },
};

export default async function ParkGiftThanksPage() {
  return <ParkThanks gift />;
}
