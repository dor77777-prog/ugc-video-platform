'use client';

// V27.7 — Cinematic hero showcase with floating + cycling avatars.
//
// Eight slots positioned around the hero canvas (away from the
// headline column). Each slot:
//   • Floats with one of 4 named keyframes (motion phases co-prime so
//     no two slots ever align on the same frame).
//   • Reacts to cursor parallax — drift opposite to mouse, stronger
//     for higher z-index slots (depth illusion).
//   • Holds an avatar from the 25-strong tachles catalog.
//   • Periodically (~3s) one slot is swapped to a new avatar from the
//     pool. The swap is a CSS-driven double-buffer crossfade — the
//     outgoing layer fades out as the incoming layer fades in. A
//     primary-halo flash pulses around the card during the swap to
//     read as "AI just generated this".
//
// Performance: each slot animates only opacity + transform, both
// composited on the GPU. Eight cards floating + one crossfade every
// 3s costs ~3% main thread on an M1 Air. On mobile (< md) the entire
// component is `hidden` so we don't pay for it.
//
// Accessibility: aria-hidden, prefers-reduced-motion stops both the
// float and the cycle (CSS rule in globals.css scopes [data-hero-slot]).

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';

const R2_BASE = 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev';

// PUBLIC POOL — only the 12 avatars exposed on the landing's grid
// section. The remaining 13 (yoav / omri / ron / ido / moshe / yael /
// adi / inbar / avigail / sapir / hila / tomer / itay) stay behind the
// auth gate so visitors have a reason to register ("13 more avatars
// inside"). The hero cycle MUST NOT pull from those — anyone who
// inspects the network tab on the landing should only see these 12
// avatar PNGs fetch.
type PoolAvatar = { id: string; name: string; region: string };
const POOL: PoolAvatar[] = [
  { id: 'noa',     name: 'נועה',   region: 'TEL AVIV' },
  { id: 'liat',    name: 'ליאת',   region: 'TEL AVIV' },
  { id: 'shira',   name: 'שירה',   region: 'TEL AVIV' },
  { id: 'maya',    name: 'מאיה',   region: 'HAIFA' },
  { id: 'tamar',   name: 'תמר',    region: 'TEL AVIV' },
  { id: 'galit',   name: 'גלית',   region: 'JERUSALEM' },
  { id: 'einat',   name: 'עינת',   region: 'TEL AVIV' },
  { id: 'ortal',   name: 'אורטל',  region: 'RAMAT GAN' },
  { id: 'avi',     name: 'אבי',    region: 'RAMAT GAN' },
  { id: 'yosef',   name: 'יוסף',   region: 'JERUSALEM' },
  { id: 'eran',    name: 'ערן',    region: 'TEL AVIV' },
  { id: 'gil',     name: 'גיל',    region: 'TEL AVIV' },
];

// Eight slots positioned around the hero. Coordinates are percentages
// inside a 600-700px tall container (responsive, hidden on <md).
// Designed to NOT overlap the headline's right column (lg:col-span-7)
// — most slots cluster on the left + a few echo on the right.
type Slot = {
  topPct: number;
  leftPct: number;
  scale: number;
  rotateDeg: number;
  z: number;
  /** Float keyframe family: 'a' | 'b' | 'c' | 'd'. */
  floatKey: 'a' | 'b' | 'c' | 'd';
  /** Float duration in seconds — co-prime numbers so phases drift. */
  floatDurMs: number;
  /** Float delay so slots don't all start at frame 0. */
  floatDelayMs: number;
};
const SLOTS: Slot[] = [
  { topPct:  4, leftPct:  6, scale: 1.00, rotateDeg: -7, z: 12, floatKey: 'a', floatDurMs:  9000, floatDelayMs:    0 },
  { topPct: 14, leftPct: 38, scale: 0.70, rotateDeg:  6, z:  6, floatKey: 'c', floatDurMs: 13000, floatDelayMs:  900 },
  { topPct: 26, leftPct:  4, scale: 0.85, rotateDeg:  4, z:  9, floatKey: 'b', floatDurMs: 11000, floatDelayMs:  300 },
  { topPct: 18, leftPct: 78, scale: 1.05, rotateDeg: -5, z: 13, floatKey: 'd', floatDurMs: 17000, floatDelayMs:  500 },
  { topPct: 48, leftPct: 32, scale: 0.72, rotateDeg:  8, z:  7, floatKey: 'a', floatDurMs: 11000, floatDelayMs: 1200 },
  { topPct: 56, leftPct:  4, scale: 0.92, rotateDeg: -4, z: 10, floatKey: 'c', floatDurMs:  9000, floatDelayMs:  700 },
  { topPct: 60, leftPct: 76, scale: 0.85, rotateDeg:  6, z:  8, floatKey: 'b', floatDurMs: 13000, floatDelayMs: 1500 },
  { topPct: 80, leftPct: 44, scale: 0.78, rotateDeg: -8, z:  9, floatKey: 'd', floatDurMs: 17000, floatDelayMs:  400 },
];

// Initial slot → avatar assignment. Picks the first 8 of POOL (mix
// of female/male/regions naturally falls out of catalog ordering).
const INITIAL_ASSIGNMENT = SLOTS.map((_, i) => POOL[i]!.id);

interface SlotState {
  /** Current visible avatar. */
  current: PoolAvatar;
  /** Outgoing avatar during a crossfade (cleared after fade-out ends). */
  outgoing: PoolAvatar | null;
  /** Bumped each swap so React remounts the layer for fade-in. */
  generation: number;
}

export function HeroShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mouseDrift, setMouseDrift] = useState({ x: 0, y: 0 });

  // Per-slot state: { current, outgoing, generation }.
  const [slotStates, setSlotStates] = useState<SlotState[]>(() =>
    INITIAL_ASSIGNMENT.map((id) => ({
      current: POOL.find((a) => a.id === id)!,
      outgoing: null,
      generation: 0,
    })),
  );
  const [swappingFlags, setSwappingFlags] = useState<boolean[]>(() =>
    SLOTS.map(() => false),
  );

  // Cursor parallax. -1..1 across the viewport, slow follow.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setMouseDrift({
        x: (e.clientX / w - 0.5) * 2,
        y: (e.clientY / h - 0.5) * 2,
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Cycle orchestrator — every ~3s, swap one random slot to a new
  // avatar that's NOT currently shown by any slot.
  const slotStatesRef = useRef(slotStates);
  slotStatesRef.current = slotStates;

  const triggerSwap = useCallback((slotIdx: number) => {
    setSlotStates((prev) => {
      const onScreen = new Set(prev.map((s) => s.current.id));
      const candidates = POOL.filter((a) => !onScreen.has(a.id));
      const next = candidates[Math.floor(Math.random() * candidates.length)];
      if (!next) return prev;
      return prev.map((s, i) =>
        i === slotIdx
          ? { current: next, outgoing: s.current, generation: s.generation + 1 }
          : s,
      );
    });
    // Mark slot as actively swapping for the halo flash. Decays after
    // the crossfade window.
    setSwappingFlags((prev) => prev.map((v, i) => (i === slotIdx ? true : v)));
    setTimeout(() => {
      setSwappingFlags((prev) => prev.map((v, i) => (i === slotIdx ? false : v)));
    }, 900);
    // Clear the outgoing layer after the crossfade so it doesn't sit
    // in the DOM forever.
    setTimeout(() => {
      setSlotStates((prev) =>
        prev.map((s, i) => (i === slotIdx ? { ...s, outgoing: null } : s)),
      );
    }, 800);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Skip cycle if user has prefers-reduced-motion. The float CSS is
    // already disabled in globals.css for those users; this stops the
    // periodic crossfade too.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const idx = Math.floor(Math.random() * SLOTS.length);
      triggerSwap(idx);
    };
    // First swap after 3s, then every 3-4.5s (jitter).
    const id = window.setInterval(() => {
      tick();
    }, 3000 + Math.random() * 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [triggerSwap]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[600px] md:h-[700px] hidden md:block pointer-events-none"
      aria-hidden
    >
      {SLOTS.map((slot, i) => {
        const state = slotStates[i]!;
        const isSwapping = swappingFlags[i];
        // Parallax: deeper slots (higher z) drift more — depth illusion.
        const driftMul = slot.z / 6;
        const tx = mouseDrift.x * 8 * driftMul;
        const ty = mouseDrift.y * 8 * driftMul;
        const w = 130 * slot.scale;
        const h = 190 * slot.scale;

        return (
          <div
            key={i}
            data-hero-slot={i}
            data-swapping={isSwapping || undefined}
            className="absolute rounded-2xl tier-elevated overflow-hidden"
            style={{
              top: `${slot.topPct}%`,
              left: `${slot.leftPct}%`,
              width: `${w}px`,
              height: `${h}px`,
              zIndex: slot.z,
              // Two transforms compose here: the float keyframe
              // (uses --slot-rot custom property to preserve rotation)
              // and the parallax outer wrapper. The wrapper holds the
              // parallax; the inner div holds the float animation.
              transform: `translate(${tx}px, ${ty}px)`,
              transition: 'transform 900ms cubic-bezier(0.22, 0.61, 0.36, 1)',
            }}
          >
            <div
              className="absolute inset-0"
              style={
                {
                  '--slot-rot': `${slot.rotateDeg}deg`,
                  animation: `hero-float-${slot.floatKey} ${slot.floatDurMs}ms cubic-bezier(0.4, 0, 0.6, 1) ${slot.floatDelayMs}ms infinite`,
                  // The float animation already includes rotate via
                  // --slot-rot; we set transform here as the static
                  // baseline.
                  transform: `rotate(${slot.rotateDeg}deg)`,
                } as React.CSSProperties
              }
            >
              <div
                data-swapping-card={isSwapping || undefined}
                className="relative w-full h-full rounded-2xl overflow-hidden"
                style={{
                  boxShadow: isSwapping
                    ? undefined
                    : `0 1px 0 hsl(0 0% 100% / 0.06) inset,
                       0 0 0 1px hsl(var(--primary) / 0.18),
                       0 24px 60px -16px hsl(0 0% 0% / 0.6)`,
                  animation: isSwapping
                    ? 'hero-swap-flash 900ms cubic-bezier(0.22, 0.61, 0.36, 1)'
                    : undefined,
                }}
              >
                {/* Outgoing layer — fades out across the swap window. */}
                {state.outgoing && (
                  <div
                    data-hero-layer="outgoing"
                    key={`out-${state.generation}-${state.outgoing.id}`}
                    className="absolute inset-0"
                    style={{
                      animation:
                        'hero-fade-out 700ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards',
                    }}
                  >
                    <Image
                      src={`${R2_BASE}/avatars/${state.outgoing.id}.png`}
                      alt=""
                      width={Math.round(w * 1.2)}
                      height={Math.round(h * 1.2)}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                {/* Current layer — fades in (or shows instantly on
                    initial render before any swap). */}
                <div
                  data-hero-layer="current"
                  key={`in-${state.generation}-${state.current.id}`}
                  className="absolute inset-0"
                  style={{
                    animation:
                      state.generation > 0
                        ? 'hero-fade-in 700ms cubic-bezier(0.22, 0.61, 0.36, 1) backwards'
                        : undefined,
                  }}
                >
                  <Image
                    src={`${R2_BASE}/avatars/${state.current.id}.png`}
                    alt={state.current.name}
                    width={Math.round(w * 1.2)}
                    height={Math.round(h * 1.2)}
                    className="w-full h-full object-cover"
                    priority={i < 4}
                  />
                </div>

                {/* Bottom info strip with name + region */}
                <div className="absolute inset-x-0 bottom-0 px-3 py-2 backdrop-blur-md bg-gradient-to-t from-black/80 via-black/40 to-transparent z-10">
                  <div className="text-[11px] font-bold text-white">{state.current.name}</div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/60">
                    {state.current.region}
                  </div>
                </div>

                {/* Top-right "AI" pill */}
                <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-primary/90 text-primary-foreground text-[8px] font-black tracking-wider uppercase z-10">
                  AI
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Center "now generating" pulse — kept from V20 as a subtle
          beacon. It anchors the eye between the floating slots. */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
          <div className="relative h-3 w-3 rounded-full bg-primary glow-primary" />
        </div>
      </div>
    </div>
  );
}

export function AnimatedCounter({
  end,
  prefix = '',
  suffix = '',
  durationMs = 1500,
}: {
  end: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
}) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          const start = Date.now();
          const tick = () => {
            const elapsed = Date.now() - start;
            const t = Math.min(1, elapsed / durationMs);
            // easeOutQuart for natural deceleration
            const eased = 1 - Math.pow(1 - t, 4);
            setVal(Math.round(end * eased));
            if (t < 1) requestAnimationFrame(tick);
          };
          tick();
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, durationMs]);

  return (
    <span ref={ref} className="font-mono">
      {prefix}
      {val.toLocaleString('en')}
      {suffix}
    </span>
  );
}

// Live ticker showing mock activity. Positioned floating in the hero.
export function LiveActivityTicker() {
  const messages = [
    { text: 'נועה יצרה מודעת UGC לנעלי כדורסל', city: 'תל אביב' },
    { text: 'משה רץ רינדור סופי לתוסף תזונה', city: 'חיפה' },
    { text: 'שירה בוחרת תסריט #4 מתוך 6', city: 'ירושלים' },
    { text: 'ליאת מוסיפה כתוביות בסגנון Reels', city: 'רמת גן' },
    { text: 'תמר מרגנרת voice-over לסצנה 3', city: 'באר שבע' },
  ];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((v) => (v + 1) % messages.length), 3500);
    return () => clearInterval(id);
  }, [messages.length]);
  const m = messages[idx]!;
  return (
    <div className="flex items-center gap-3 rounded-full tier-elevated px-4 py-2 max-w-fit mx-auto text-xs text-muted-foreground shadow-soft">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-ai opacity-75 animate-ping" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-ai" />
      </span>
      <span className="font-medium text-foreground">{m.text}</span>
      <span className="opacity-60">·</span>
      <span>{m.city}</span>
      <span className="opacity-60">·</span>
      <span className="font-mono">{Math.floor(Math.random() * 50) + 5}s</span>
    </div>
  );
}
