'use client';

// V20 — cinematic hero showcase. Client component so we can run
// scroll-driven animations + parallax on cursor + animated counters.
// Floats actual R2 avatar images as tier-elevated cards behind the hero
// headline so visitors immediately SEE the product output, not just
// read about it.

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Sparkles, Mic2, Film } from 'lucide-react';

const SHOWCASE_AVATARS = [
  { id: 'noa', name: 'נועה', region: 'Tel Aviv' },
  { id: 'liat', name: 'ליאת', region: 'Tel Aviv' },
  { id: 'shira', name: 'שירה', region: 'Tel Aviv' },
  { id: 'maya', name: 'מאיה', region: 'Haifa' },
  { id: 'tamar', name: 'תמר', region: 'Tel Aviv' },
  { id: 'galit', name: 'גלית', region: 'Jerusalem' },
];

const R2_BASE = 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev';

interface FloatingCard {
  src: string;
  name: string;
  region: string;
  // Position percentages relative to hero container.
  topPct: number;
  leftPct: number;
  // Animation delay for staggered entry.
  delayMs: number;
  // Size multiplier (0.7 small, 1.0 medium, 1.2 large).
  scale: number;
  // Rotation degrees (subtle tilt).
  rotateDeg: number;
  // Z-index for stacking.
  z: number;
}

const FLOATING_CARDS: FloatingCard[] = [
  { src: `${R2_BASE}/avatars/noa.png`,    name: 'נועה',  region: 'Tel Aviv',  topPct: 8,  leftPct: 6,  delayMs: 200, scale: 1.0, rotateDeg: -7, z: 10 },
  { src: `${R2_BASE}/avatars/liat.png`,   name: 'ליאת',  region: 'Tel Aviv',  topPct: 22, leftPct: 78, delayMs: 350, scale: 1.1, rotateDeg: 5,  z: 12 },
  { src: `${R2_BASE}/avatars/shira.png`,  name: 'שירה',  region: 'Tel Aviv',  topPct: 58, leftPct: 4,  delayMs: 500, scale: 0.85, rotateDeg: 4, z: 8 },
  { src: `${R2_BASE}/avatars/maya.png`,   name: 'מאיה',  region: 'Haifa',     topPct: 64, leftPct: 84, delayMs: 650, scale: 0.95, rotateDeg: -6, z: 11 },
  { src: `${R2_BASE}/avatars/tamar.png`,  name: 'תמר',   region: 'Tel Aviv',  topPct: 38, leftPct: -2, delayMs: 800, scale: 0.7, rotateDeg: 8, z: 6 },
  { src: `${R2_BASE}/avatars/galit.png`,  name: 'גלית',  region: 'Jerusalem', topPct: 80, leftPct: 50, delayMs: 950, scale: 0.7, rotateDeg: -3, z: 7 },
];

export function HeroShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const [mouseTransform, setMouseTransform] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  // Subtle parallax: floating cards drift opposite to cursor by a few px.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: MouseEvent) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const x = (e.clientX / w - 0.5) * 2; // -1..1
      const y = (e.clientY / h - 0.5) * 2;
      setMouseTransform({ x, y });
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  return (
    <div
      ref={ref}
      className="relative w-full h-[600px] md:h-[700px] hidden md:block pointer-events-none"
      aria-hidden
    >
      {FLOATING_CARDS.map((card) => {
        // Each card drifts a different amount based on its z-index so
        // closer cards (higher z) move more — depth illusion.
        const driftMul = card.z / 6;
        const tx = mouseTransform.x * 8 * driftMul;
        const ty = mouseTransform.y * 8 * driftMul;
        return (
          <div
            key={card.src}
            className="absolute rounded-2xl tier-elevated glow-primary overflow-hidden motion-fade-up"
            style={{
              top: `${card.topPct}%`,
              left: `${card.leftPct}%`,
              width: `${130 * card.scale}px`,
              height: `${190 * card.scale}px`,
              transform: `translate(${tx}px, ${ty}px) rotate(${card.rotateDeg}deg)`,
              transition: 'transform 800ms cubic-bezier(0.22, 0.61, 0.36, 1)',
              animationDelay: `${card.delayMs}ms`,
              zIndex: card.z,
              boxShadow: `
                0 1px 0 hsl(0 0% 100% / 0.06) inset,
                0 0 0 1px hsl(258 100% 70% / 0.15),
                0 24px 60px -16px hsl(0 0% 0% / 0.6),
                0 0 60px -10px hsl(258 100% 60% / 0.3)
              `,
            }}
          >
            <Image
              src={card.src}
              alt={card.name}
              width={156}
              height={228}
              className="w-full h-full object-cover"
            />
            {/* Bottom info strip with name + tag */}
            <div className="absolute inset-x-0 bottom-0 px-3 py-2 backdrop-blur-md bg-gradient-to-t from-black/80 via-black/40 to-transparent">
              <div className="text-[11px] font-bold text-foreground">{card.name}</div>
              <div className="kicker-muted font-mono text-[9px] uppercase">
                {card.region}
              </div>
            </div>
            {/* Top-right "AI" pill */}
            <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-primary/90 text-background text-[8px] font-black tracking-wider uppercase shadow-md">
              AI
            </div>
          </div>
        );
      })}

      {/* Center "now generating" pulse */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
          <div className="relative h-3 w-3 rounded-full bg-primary shadow-glow" />
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
