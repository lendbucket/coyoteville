import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
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
    /* The race, high priority while it is the thing being searched for. Its
       own sponsorship page is listed separately rather than left to be found
       through a link: it targets a different phrase and wants its own entry. */
    {
      url: `${SITE_URL}/turkey-trot`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];
}
