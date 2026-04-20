import type { NextConfig } from "next";

// WARNING: Do NOT add reactCompiler: true — causes silent build hang.
// Do NOT add experimental Turbopack flags — not compatible with Node 20.
// Any config changes need explicit approval from Lasith first.
const nextConfig: NextConfig = {
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
