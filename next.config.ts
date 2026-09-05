import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    authInterrupts: true,
  },
  allowedDevOrigins: [
    "dev.martinruzek.eu"
  ]
};

export default nextConfig;
