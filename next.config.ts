import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A second dev server (e.g. for tests on another port) needs its own build folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
