import type { MetadataRoute } from 'next';

/**
 * Web app manifest, so the site looks right when someone saves it to a home
 * screen. Icons are PNG because iOS will not use an SVG here.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Coyoteville, Food Truck Park in Alice, Texas',
    short_name: 'Coyoteville',
    description:
      'Outdoor food truck park in Alice, TX, across from the stadium. Local food trucks, live music, free admission.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0B0B0C',
    theme_color: '#0B0B0C',
    /* The emblem, not the full lockup. The lockup is a wide three colour badge
       whose wordmark is unreadable below about 64px, which is every size a tab
       or a home screen actually uses. Cropping to the coyote and the sunset
       keeps the part that survives. The lockup itself is untouched and still
       serves the nav, the footer and the emails. */
    icons: [
      { src: '/mark-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/mark-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/mark-180.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
