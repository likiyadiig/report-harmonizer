import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Server Actions reject bodies over 1 MB by default. Uploads can be
      // 25 MB, plus some room for the multipart form overhead.
      bodySizeLimit: "26mb",
    },
  },
};

export default nextConfig;
