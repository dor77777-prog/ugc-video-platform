/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@ugc-video/shared', '@ugc-video/prompts'],
  reactStrictMode: true,
  // In Next.js 15 the client-side router cache stores dynamic page RSC payloads
  // for 30s by default. Setting dynamic to 0 means every navigation to a
  // server-rendered page (dashboard, projects, scripts, scenes, etc.) gets fresh
  // data from the server, so UI updates are visible immediately without a
  // manual F5 after Server Actions or API calls.
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
  // ffmpeg-static + ffprobe-static ship platform-specific binaries inside
  // node_modules. Next.js's file tracer skips these because the path is
  // resolved at runtime via a string export. Force-include them so Vercel
  // bundles the binaries with any function that mux's audio (the scene
  // clip API route).
  outputFileTracingIncludes: {
    '/api/scenes/[id]/clip': [
      './node_modules/ffmpeg-static/**',
      './node_modules/ffprobe-static/**',
      '../../node_modules/ffmpeg-static/**',
      '../../node_modules/ffprobe-static/**',
    ],
  },
};

export default nextConfig;
