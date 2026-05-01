// V21 — custom SVG illustrations for empty states + section dividers.
// Hand-tuned geometric scenes that match the brand (primary/accent
// gradient, glass / frame motifs from the logo). Zero external deps,
// pure inline SVG. Each picks up `currentColor` for the foreground
// strokes so they adapt to muted-foreground / primary contexts.

interface IllustrationProps {
  className?: string;
}

// "Empty Studio" — used when no projects exist yet. A frame outline
// with a play triangle floating away (suggests "your first ad will
// appear here"). 240x180 default sizing.
export function EmptyStudioIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 240 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="empty-studio-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(258 100% 70%)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="hsl(290 100% 70%)" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="empty-studio-fill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(258 100% 70%)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="hsl(73 95% 60%)" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      {/* Background dotted grid. */}
      <g opacity="0.15">
        {Array.from({ length: 8 }).map((_, i) =>
          Array.from({ length: 12 }).map((_, j) => (
            <circle
              key={`${i}-${j}`}
              cx={20 + j * 18}
              cy={20 + i * 18}
              r="0.8"
              fill="currentColor"
            />
          )),
        )}
      </g>

      {/* Two rotated frame outlines (representing previous + current). */}
      <rect
        x="50"
        y="40"
        width="90"
        height="120"
        rx="10"
        stroke="url(#empty-studio-grad)"
        strokeWidth="2"
        strokeDasharray="6 4"
        fill="url(#empty-studio-fill)"
        opacity="0.45"
        transform="rotate(-6 95 100)"
      />
      <rect
        x="100"
        y="30"
        width="90"
        height="120"
        rx="10"
        stroke="url(#empty-studio-grad)"
        strokeWidth="2.5"
        fill="url(#empty-studio-fill)"
        transform="rotate(4 145 90)"
      />

      {/* Inner play triangle on the second frame. */}
      <path
        d="M 130 70 L 165 90 L 130 110 Z"
        fill="hsl(258 100% 75%)"
        transform="rotate(4 145 90)"
        opacity="0.95"
      />

      {/* Floating accent dot. */}
      <circle cx="200" cy="55" r="3" fill="hsl(73 95% 60%)" />
      <circle cx="35" cy="135" r="2" fill="hsl(258 100% 70%)" />
    </svg>
  );
}

// "Loading sparkles" — used while a generation is in flight at the
// page level (e.g. while scripts are streaming in). Three diamonds
// arranged radially with staggered animation.
export function LoadingSparklesIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="spark-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(258 100% 75%)" />
          <stop offset="100%" stopColor="hsl(290 100% 70%)" />
        </linearGradient>
      </defs>
      <g>
        {[
          { x: 60, y: 30, size: 14, delay: 0 },
          { x: 90, y: 80, size: 10, delay: 0.4 },
          { x: 30, y: 80, size: 12, delay: 0.8 },
        ].map((s, i) => (
          <g key={i} opacity="0.9">
            <path
              d={`M ${s.x} ${s.y - s.size}
                  L ${s.x + s.size * 0.4} ${s.y - s.size * 0.4}
                  L ${s.x + s.size} ${s.y}
                  L ${s.x + s.size * 0.4} ${s.y + s.size * 0.4}
                  L ${s.x} ${s.y + s.size}
                  L ${s.x - s.size * 0.4} ${s.y + s.size * 0.4}
                  L ${s.x - s.size} ${s.y}
                  L ${s.x - s.size * 0.4} ${s.y - s.size * 0.4}
                  Z`}
              fill="url(#spark-grad)"
            >
              <animate
                attributeName="opacity"
                values="0.5;1;0.5"
                dur="2s"
                begin={`${s.delay}s`}
                repeatCount="indefinite"
              />
              <animateTransform
                attributeName="transform"
                type="rotate"
                from={`0 ${s.x} ${s.y}`}
                to={`360 ${s.x} ${s.y}`}
                dur="8s"
                begin={`${s.delay}s`}
                repeatCount="indefinite"
              />
            </path>
          </g>
        ))}
      </g>
    </svg>
  );
}

// "Pipeline arrow" — decorative arrow connecting two cards in a
// horizontal flow. Animated dash sweeping through. 80x40.
export function PipelineArrowIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 80 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="arrow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(258 100% 70%)" stopOpacity="0" />
          <stop offset="50%" stopColor="hsl(258 100% 70%)" stopOpacity="1" />
          <stop offset="100%" stopColor="hsl(258 100% 70%)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        x1="0"
        y1="20"
        x2="80"
        y2="20"
        stroke="url(#arrow-grad)"
        strokeWidth="2"
        strokeDasharray="6 4"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="0"
          to="-20"
          dur="2s"
          repeatCount="indefinite"
        />
      </line>
      <path
        d="M 70 14 L 78 20 L 70 26"
        stroke="hsl(258 100% 70%)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// "Studio canvas" — abstract decorative graphic for hero panels.
// Layered translucent shapes suggesting "creative space". Use as
// background decoration on empty/welcome surfaces.
export function StudioCanvasIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 320 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="canvas-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(258 100% 70%)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="hsl(290 100% 70%)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill="url(#canvas-bg-grad)" rx="14" />

      {/* Three overlapping frames. */}
      <rect
        x="60"
        y="30"
        width="80"
        height="110"
        rx="8"
        fill="hsl(0 0% 100% / 0.04)"
        stroke="hsl(258 100% 75% / 0.5)"
        strokeWidth="1.5"
        transform="rotate(-8 100 85)"
      />
      <rect
        x="120"
        y="20"
        width="80"
        height="110"
        rx="8"
        fill="hsl(0 0% 100% / 0.06)"
        stroke="hsl(290 100% 70% / 0.5)"
        strokeWidth="1.5"
      />
      <rect
        x="180"
        y="30"
        width="80"
        height="110"
        rx="8"
        fill="hsl(0 0% 100% / 0.04)"
        stroke="hsl(73 95% 60% / 0.5)"
        strokeWidth="1.5"
        transform="rotate(6 220 85)"
      />

      {/* Floating dots. */}
      <circle cx="40" cy="50" r="3" fill="hsl(258 100% 70%)" opacity="0.8" />
      <circle cx="290" cy="140" r="2.5" fill="hsl(73 95% 60%)" opacity="0.8" />
      <circle cx="280" cy="50" r="2" fill="hsl(290 100% 70%)" opacity="0.8" />
      <circle cx="50" cy="140" r="2.5" fill="hsl(73 95% 60%)" opacity="0.6" />
    </svg>
  );
}
