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
  // ffmpeg-static MUST stay external — Next.js's webpack server bundle
  // otherwise tries to copy the binary into .next/server/chunks/ as if
  // it were a JS chunk. At runtime the package's path constant points
  // back to node_modules, but the bundler-rewritten copy under
  // chunks/ffmpeg is what actually ships in the function — so spawn()
  // hits ENOENT. Externalizing keeps the original node_modules path
  // intact and outputFileTracingIncludes below ensures the binary is
  // bundled in the function's filesystem.
  serverExternalPackages: ['ffmpeg-static'],
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
  // public/ contains 159MB of static assets (avatar PNGs, music tracks,
  // voice samples) that Vercel serves directly from its edge — they
  // never need to be inside any function's bundle. The tracer was pulling
  // public/ in for the clip route because mux-audio.ts has a dev-only
  // branch that reads from public/uploads/ via process.cwd(). In prod
  // every URL comes from R2, so the branch is dead — strip it.
  outputFileTracingExcludes: {
    '*': ['apps/web/public/**', './public/**'],
  },
};

export default nextConfig;
