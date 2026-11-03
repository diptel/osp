import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Disajikan di satu domain bareng PocketBase, di path /app
  // (root "/" dipakai untuk web profile, /console & /_ untuk PocketBase admin).
  basePath: "/app",
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
