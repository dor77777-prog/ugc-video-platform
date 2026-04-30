import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@ugc-video/shared', '@ugc-video/prompts'],
  reactStrictMode: true,
  // Monorepo root — npm hoists ffmpeg-static + a bunch of other deps
  // here. Without an explicit tracing root, Vercel's file tracer
  // looks at apps/web only and silently skips the binary, so the
  // function bundle on /var/task ships without ffmpeg → ENOENT at
  // spawn time. Setting tracingRoot to the repo root fixes that.
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
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
  // via a string export. Force-include the binary on every route that
  // could reach muxVoiceOntoVideo (clip route + the scripts/regen-prompt
  // path that occasionally calls it indirectly). Paths are relative to
  // outputFileTracingRoot above (monorepo root) — npm hoists the dep
  // there in this workspace, NOT under apps/web/node_modules.
  //
  // We deliberately do NOT include ffprobe-static here — duration probing
  // moved to the pure-JS music-metadata package (~300KB) so we can stay
  // under Vercel's 250MB function size limit.
  outputFileTracingIncludes: {
    '/api/scenes/[id]/clip': [
      'node_modules/ffmpeg-static/**',
    ],
    // Belt-and-braces: include in the scenes/[id] catch-all bundle too.
    // Vercel's function-collapsing sometimes merges several routes into
    // one .func; if it picks a different keyed route as the "owner" the
    // binary needs to be available there as well.
    '/api/scenes/[id]/**': [
      'node_modules/ffmpeg-static/**',
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
