/** @type {import('next').NextConfig} */

const isProd = process.env.NODE_ENV === 'production';

// Next needs inline script for its bootstrap payload, and React refresh needs
// eval in development only.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "font-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self' https://checkout.stripe.com",
  'frame-src https://js.stripe.com https://checkout.stripe.com',
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

module.exports = nextConfig;
