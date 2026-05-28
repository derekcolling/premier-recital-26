import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  basePath,
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.104.184", "192.168.104.214", "192.168.104.129"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
