import type { NextConfig } from "next";

// WARNING: Do NOT add reactCompiler: true — causes silent build hang.
// WARNING: Do NOT run `rm -rf .next` — destroys Turbopack RocksDB cache
//   while the dev server holds live handles, requiring full npm install
//   to recover. Banned per L-07 in docs/09_WORKING_ETHICS.md v1.10.
// Any config changes need explicit approval from Lasith first.
const nextConfig: NextConfig = {
  experimental: {
    // FIX-TURBOPACK-CACHE: persistent Turbopack filesystem cache disabled
    // to prevent RocksDB SST corruption on macOS / Next.js 16.x
    // (12 May 2026). Trade-off: dev restart compiles are not warmed from
    // disk, costing ~3-8s per restart. HMR + first-compile unchanged.
    // Production builds unaffected — turbopackFileSystemCacheForBuild is
    // opt-in and remains unset.
    turbopackFileSystemCacheForDev: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'gzehxfnlfogkhadejowo.supabase.co',
      },
    ],
  },
};

export default nextConfig;
