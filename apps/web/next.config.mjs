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
  //
  // CRITICAL: include ONLY the Linux x64 ffprobe binary, not the whole
  // bin/ tree. ffprobe-static ships every platform (darwin/linux/win32 ×
  // x64/arm) and the full tree is 335MB — pushes the function past the
  // 300MB Vercel hard limit. Linux x64 alone is ~62MB.
  outputFileTracingIncludes: {
    '/api/scenes/[id]/clip': [
      './node_modules/ffmpeg-static/ffmpeg',
      './node_modules/ffmpeg-static/index.js',
      './node_modules/ffmpeg-static/package.json',
      './node_modules/ffprobe-static/index.js',
      './node_modules/ffprobe-static/package.json',
      './node_modules/ffprobe-static/bin/linux/x64/ffprobe',
      '../../node_modules/ffmpeg-static/ffmpeg',
      '../../node_modules/ffmpeg-static/index.js',
      '../../node_modules/ffmpeg-static/package.json',
      '../../node_modules/ffprobe-static/index.js',
      '../../node_modules/ffprobe-static/package.json',
      '../../node_modules/ffprobe-static/bin/linux/x64/ffprobe',
    ],
  },
  outputFileTracingExcludes: {
    '/api/scenes/[id]/clip': [
      // Belt-and-suspenders: explicitly drop the non-Linux ffprobe
      // platforms in case the include patterns accidentally pull
      // them in via a glob upstream.
      '**/node_modules/ffprobe-static/bin/darwin/**',
      '**/node_modules/ffprobe-static/bin/win32/**',
    ],
  },
};

export default nextConfig;
