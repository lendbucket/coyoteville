import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * Standard crawl rules plus explicit allows for the answer engines. Getting
 * quoted by an assistant when somebody asks about food trucks in Alice is
 * worth as much as a blue link now.
 */
const AI_CRAWLERS = ['GPTBot', 'PerplexityBot', 'ClaudeBot', 'OAI-SearchBot', 'Claude-User'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/vendors/confirmed'],
      },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: ['/api/', '/vendors/confirmed'],
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
