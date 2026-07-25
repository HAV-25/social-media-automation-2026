import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  outputFileTracingIncludes: {
    "/*": ["../../packages/image-compositor/assets/Inter-Bold.ttf"],
  },
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
