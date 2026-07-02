import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required on Next 14.2.x so `instrumentation.ts` (server/edge Sentry init) registers.
  // (Stabilized in Next 15; still experimental in 14.2.)
  experimental: { instrumentationHook: true },
};

// No SENTRY_AUTH_TOKEN → source-map upload is skipped (build still succeeds).
export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: { disable: true },
});
