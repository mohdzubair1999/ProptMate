import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
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
