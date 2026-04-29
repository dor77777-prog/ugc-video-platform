// Re-export from the shared package so both apps/web and apps/worker
// see the exact same music library + scoring logic. The actual
// definitions live in packages/shared/src/music/music-library.ts.
export * from '@ugc-video/shared';
