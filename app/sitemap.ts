import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';
import { RACE_SLUG } from '@/lib/race';
import { getRace } from '@/lib/races';

/**
 * The sitemap.
 *
 * The two race pages are listed only once the race is published. Both carry
 * noindex while it is not, and a sitemap entry for a page that tells crawlers
 * not to index it is a contradiction: it asks to be crawled and then refuses.
 * One flag decides both, so they cannot disagree.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const base: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/parking-fundraiser`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ];

  const race = await getRace(RACE_SLUG);
  if (!race?.isPublished) return base;

  return [
    ...base,
    /* High priority while the race is the thing being searched for. The
       sponsorship page is listed separately rather than left to be found
       through a link: it targets its own phrase and wants its own entry. */
    {
      url: `${SITE_URL}/turkey-trot`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/turkey-trot/sponsors`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ];
}
