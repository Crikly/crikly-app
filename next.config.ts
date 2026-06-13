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
    // Fix-LOCAL-IMAGE-02: bypass the Next.js image optimizer in dev. The
    // optimizer refuses to fetch 127.0.0.1 (private-IP SSRF guard), so local
    // Supabase Storage gallery images fail to render. Production keeps
    // optimization ON (Supabase is a public IP there).
    unoptimized: process.env.NODE_ENV !== 'production',
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
        // Dev / staging Supabase project.
        protocol: 'https',
        hostname: 'gzehxfnlfogkhadejowo.supabase.co',
      },
      {
        // Fix-LOCAL-IMAGE-01: production Supabase project (was missing —
        // production-served Storage images were blocked by next/image).
        protocol: 'https',
        hostname: 'smwvtaeivmqaldvrbycm.supabase.co',
      },
      // Fix-LOCAL-IMAGE-01: local Supabase Storage (http://127.0.0.1:54321).
      // Dev/test only — gated out of production builds via NODE_ENV.
      ...(process.env.NODE_ENV !== 'production'
        ? [{ protocol: 'http' as const, hostname: '127.0.0.1', port: '54321' }]
        : []),
    ],
  },
};

export default nextConfig;
