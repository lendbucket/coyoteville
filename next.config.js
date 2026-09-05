/** @type {import('next').NextConfig} */

const isProd = process.env.NODE_ENV === 'production';

/**
 * Square's Web Payments SDK, which is what puts the card field on the permanent
 * monthly application.
 *
 * The SDK is loaded from Square's CDN by components/CardOnFile, renders the card
 * input in a cross origin iframe so the card number never touches our DOM, and
 * posts to Square's PCI endpoint to tokenise. Those are three separate CSP
 * directives and all three were missing: script-src blocked the loader, so
 * window.Square was never defined, no card field rendered, and every monthly
 * signup was refused for having no card. It typechecked, it built, it rendered,
 * and it was dead.
 *
 * These three origins are the whole list, and they were read off the network log
 * of a real session with the SDK loading rather than from memory.
 *
 * One thing this policy does not and cannot cover: once the card iframe is up,
 * it is a cross origin document running under Square's own CSP, and its requests
 * are not ours to allow or refuse. It was observed beaconing to a Sentry ingest
 * host from in there. Nothing can be done about that from this file, and naming
 * the host here would achieve nothing; it is recorded because it is the kind of
 * thing worth knowing is happening on a page that takes card details.
 *
 * A host allowlist rather than a nonce on purpose. A nonce would not help: it
 * says nothing about frame-src or connect-src, which are host based only, and
 * the dynamic script tag CardOnFile injects would need 'strict-dynamic', which
 * lets anything Square's bundle loads run too. That is wider than naming three
 * origins, not tighter.
 *
 * Keyed off NEXT_PUBLIC_SQUARE_ENVIRONMENT rather than NODE_ENV, because that is
 * the variable deciding which host CardOnFile loads, by the identical rule. A
 * production build pointed at Square sandbox is an ordinary thing to want and
 * would otherwise get a policy for the wrong pair of hosts.
 */
const squareProduction = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production';

/** The SDK bundle, and the origin of the iframe it puts the card input in. */
const SQUARE_SDK = squareProduction
  ? 'https://web.squarecdn.com'
  : 'https://sandbox.web.squarecdn.com';

/** Where the SDK posts the card to be tokenised. */
const SQUARE_API = squareProduction
  ? 'https://pci-connect.squareup.com'
  : 'https://pci-connect.squareupsandbox.com';

// Next needs inline script for its bootstrap payload, and React refresh needs
// eval in development only.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline' ${SQUARE_SDK}${isProd ? '' : " 'unsafe-eval'"}`,
  "font-src 'self' data:",
  `connect-src 'self' ${SQUARE_API}`,
  // Square hosted checkout lives on square.link and checkout.square.site.
  // Sandbox links come from sandbox.square.link.
  "form-action 'self' https://square.link https://sandbox.square.link https://checkout.square.site",
  `frame-src https://square.link https://sandbox.square.link https://checkout.square.site ${SQUARE_SDK}`,
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  /**
   * Runtime assets the PDF routes read that nothing imports, so the tracer
   * never sees them and the function deploys without them.
   *
   * Two separate problems, both of which only show up in the deployed bundle:
   *
   * 1. Our own brand fonts and the logo, read off disk by lib/agreement/pdf.
   *
   * 2. pdfkit's standard fonts. Those are not required by path but through a
   *    Node subpath import, "#standard-fonts/Helvetica", resolved against
   *    pdfkit's own package.json at runtime. Static analysis cannot follow
   *    that, so the tracer bundles pdfkit's entry and package.json and none of
   *    the fonts, and the route 500s with MODULE_NOT_FOUND on the first
   *    render. Every text run in these documents is set in a registered font,
   *    but pdfkit still loads Helvetica as the document default, so the path
   *    is reached on every PDF.
   *
   *    The whole directory is included rather than the faces we expect to
   *    need. The import map resolves to .cjs under `require` and .mjs under
   *    `import`, the traced entry here is pdfkit.node.mjs while production
   *    failed asking for Helvetica.cjs, and the .cjs files pull a shared
   *    chunk of their own. Picking a face and an extension would be guessing
   *    at which condition wins in an environment we cannot inspect, which is
   *    the mistake that produced the outage. It is 190KB for all fourteen.
   *
   * The ICC profile is named explicitly. The tracer does currently resolve it
   * out of a `new URL('./data/...', __filename)`, but that is a heuristic and
   * this is three kilobytes. The .afm files next to it are deliberately not
   * included: the metrics are inlined in the standard-fonts modules and
   * nothing reads them at runtime.
   *
   * Listed per route rather than globally so the rest of the site does not
   * carry any of it.
   */
  experimental: {
    outputFileTracingIncludes: {
      '/api/admin/agreement': [
        './lib/agreement/fonts/**',
        './public/logo.png',
        './node_modules/pdfkit/js/standard-fonts/**',
        './node_modules/pdfkit/js/data/sRGB_IEC61966_2_1.icc',
      ],
      '/api/admin/agreements': [
        './lib/agreement/fonts/**',
        './public/logo.png',
        './node_modules/pdfkit/js/standard-fonts/**',
        './node_modules/pdfkit/js/data/sRGB_IEC61966_2_1.icc',
      ],
    },
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },

  async redirects() {
    return [
      { source: '/vendor', destination: '/#apply', permanent: true },
      { source: '/vendors', destination: '/#vendors', permanent: true },
      { source: '/apply', destination: '/#apply', permanent: true },
      { source: '/food-trucks', destination: '/', permanent: true },
    ];
  },
};

/* Build time only, and off unless ANALYZE=true. It is a devDependency and
   contributes nothing to any shipped bundle. */
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer(nextConfig);
