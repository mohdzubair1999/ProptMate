import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
// Browser security headers sent with every page. Chosen so nothing the app does stops working: the microphone and camera stay allowed for this site
// (voice notes, photos), and nothing may embed the app in another site's frame (clickjacking). A full script policy is not set here because it
// would need per-request nonces; the three directives below are the safe, always-on part of one.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(self), usb=(), serial=(), bluetooth=(), accelerometer=(), gyroscope=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const nextConfig = {
  poweredByHeader: false, // do not announce which framework the site runs on
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
  // pdfkit (used internally by @react-pdf/renderer for PDF report generation) loads its
  // standard fonts (Helvetica, etc) dynamically at runtime based on the font name string, not
  // via a static import/require Next.js's file tracer can follow. Without this, those font
  // files exist in node_modules during the build but never make it into what actually gets
  // deployed to the serverless function, so every single PDF report fails in production with
  // "Cannot find module '.../pdfkit/js/standard-fonts/Helvetica.cjs'" regardless of which
  // inspection it's for. See: https://nextjs.org/docs/app/api-reference/config/next-config-js/output
  outputFileTracingIncludes: {
    "/*": ["node_modules/pdfkit/js/standard-fonts/**/*"],
  },
};

export default withSentryConfig(nextConfig, {
  org: "zkm-holdings",
  project: "javascript-nextjs",

  // No SENTRY_AUTH_TOKEN configured yet, so source map upload is skipped for now — stack
  // traces will show minified code until that's set up. Genuinely useful to add later, but
  // it's a separate secret the person hasn't generated yet, not something to block this on.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppress non-CI build output — this only affects local dev/build noise, not Vercel logs.
  silent: !process.env.CI,
});
