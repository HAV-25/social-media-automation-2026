import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  outputFileTracingIncludes: {
    "/*": ["../../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2"],
  },
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
