// V22 — animated aurora background for dashboard pages. Same SVG
// drift technique as the landing hero, scaled down so it doesn't
// fight with content. Three radial blobs at 50% opacity, 20-30s
// loops, mix-blend-screen so they tint the canvas without obscuring.

export function DashboardAurora() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-mesh-soft" />
      <svg
        className="absolute inset-0 w-full h-full opacity-50 mix-blend-screen"
        viewBox="0 0 1200 1200"
        preserveAspectRatio="none"
      >
        <defs>
          <radialGradient id="dash-aurora-1" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(258 100% 65%)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="hsl(258 100% 65%)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="dash-aurora-2" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(290 100% 65%)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="hsl(290 100% 65%)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="dash-aurora-3" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(73 95% 60%)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="hsl(73 95% 60%)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="150" cy="180" r="380" fill="url(#dash-aurora-1)">
          <animate
            attributeName="cx"
            values="150;280;180;150"
            dur="22s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="cy"
            values="180;320;220;180"
            dur="24s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="950" cy="120" r="340" fill="url(#dash-aurora-2)">
          <animate
            attributeName="cx"
            values="950;820;900;950"
            dur="26s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="cy"
            values="120;240;160;120"
            dur="28s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="600" cy="900" r="320" fill="url(#dash-aurora-3)">
          <animate
            attributeName="cx"
            values="600;760;520;600"
            dur="30s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="cy"
            values="900;760;820;900"
            dur="32s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
      <div className="absolute inset-0 bg-noise" />
    </div>
  );
}
