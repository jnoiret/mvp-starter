import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  /** Native / non-ECM chunks: must not be bundled into API routes (Turbopack). */
  serverExternalPackages: ["@napi-rs/canvas", "tesseract.js"],
};

export default nextConfig;