import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't bundle @arcgis/core on the server (reduces build time and memory on Vercel).
  // The map is loaded only on the client via dynamic import.
  serverExternalPackages: ["@arcgis/core"],
};

export default nextConfig;
