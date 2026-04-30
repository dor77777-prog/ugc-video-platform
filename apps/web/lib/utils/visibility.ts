// V14.1 PR-A — pollers must skip ticks while the tab is hidden.
//
// Hot polling pages (scenes, videos, scripts) fire setInterval at 1-3s
// against /api/scenes/[id] and /api/render/[jobId]/status. Without a
// visibility guard those polls keep hammering Supabase even when the user
// is on another tab — which costs DB CPU + Vercel function invocations
// for ~zero UX benefit (the user can't see the result anyway). Skipping
// the API call when hidden is the cheapest 50% reduction in poll volume
// available; the next interval tick (within 2.5s) catches them up the
// moment they switch back, so perceived "real-time"-ness is unchanged.
//
// Server-side: `document` is undefined → returns true so SSR/RSC code
// paths that share this helper never silently no-op.
export function isPageVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
}
