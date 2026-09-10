import type { Metadata } from 'next';
import ParkThanks from '@/components/ParkThanks';

/** Where Square sends a driver after they pay for parking. */
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Parked',
  robots: { index: false, follow: false },
};

export default async function ParkThanksPage() {
  return <ParkThanks />;
}
