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
  // ffmpeg-static ships a platform-specific binary inside node_modules.
  // Next.js's file tracer skips it because the path is resolved at runtime
  // via a string export. Force-include the binary so Vercel bundles it
  // with the scene clip API route (which calls muxVoiceOntoVideo).
  //
  // We deliberately do NOT include ffprobe-static here — duration probing
  // moved to the pure-JS music-metadata package (~300KB) so we can stay
  // under Vercel's 250MB function size limit.
  outputFileTracingIncludes: {
    '/api/scenes/[id]/clip': [
      './node_modules/ffmpeg-static/ffmpeg',
      './node_modules/ffmpeg-static/index.js',
      './node_modules/ffmpeg-static/package.json',
      '../../node_modules/ffmpeg-static/ffmpeg',
      '../../node_modules/ffmpeg-static/index.js',
      '../../node_modules/ffmpeg-static/package.json',
    ],
  },
};

export default nextConfig;
