import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Playwright runs the Next.js dev server on localhost; explicitly allow
  // its development client origin so HMR requests are not rejected.
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default nextConfig;
