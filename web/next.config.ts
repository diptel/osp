import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Disajikan di satu domain bareng PocketBase, di path /app
  // (root "/" dipakai untuk web profile, /console & /_ untuk PocketBase admin).
  basePath: "/app",
  // nginx 1Panel menambahkan trailing slash otomatis (pseudo-static) ke path
  // tanpa titik; samakan dengan Next supaya tidak redirect loop /app <-> /app/.
  trailingSlash: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
