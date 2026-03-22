import type { NextConfig } from "next";

const backend = "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  }
};

export default nextConfig;
