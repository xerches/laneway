import type { NextConfig } from "next";

// The host tells the build which addresses this deploy will be served from.
// Sign-in needs to know them, so they are baked in here (see src/lib/auth.ts).
// Vercel gives bare host names; Netlify gives full addresses.
const withHttps = (host?: string) => (host ? `https://${host}` : undefined);
const deployUrls = [
  withHttps(process.env.VERCEL_PROJECT_PRODUCTION_URL),
  withHttps(process.env.VERCEL_BRANCH_URL),
  withHttps(process.env.VERCEL_URL),
  process.env.URL,
  process.env.DEPLOY_PRIME_URL,
  process.env.DEPLOY_URL,
]
  .filter((url): url is string => Boolean(url && url.startsWith("http")))
  .join(",");

const nextConfig: NextConfig = {
  env: { LANEWAY_DEPLOY_URLS: deployUrls },
  // The Docker image (self-hosting) runs Next's small standalone server.
  output: process.env.LANEWAY_STANDALONE === "1" ? "standalone" : undefined,
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
