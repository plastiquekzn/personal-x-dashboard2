import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  outputFileTracingIncludes: {
    "/api/extract-from-url": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
};

export default nextConfig;
