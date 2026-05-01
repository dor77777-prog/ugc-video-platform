import type { Metadata } from 'next';
import { Heebo, Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import { BRAND } from '@/lib/brand';
import './globals.css';

// V27 — Tri-Modal Liquid font stack:
//   Heebo (Hebrew anchor)        — primary content register
//   Geist Sans (Latin + numbers) — Vercel-mode DNA, tnum built in
//   Geist Mono (kickers + data)  — IDs, badges, tabular data, kickers
//
// The Tailwind sans stack is [Heebo, Geist Sans, system, sans-serif] so
// Hebrew always renders Heebo; English/numbers default to Geist. Geist
// ships tabular numbers by default (font-feature-settings: 'tnum'),
// which fixes per-row drift in /admin/costs without any per-call CSS.
//
// Heebo is loaded with weight 800 so <h1>'s font-weight: 800 has a
// matching glyph (older V19/V26 used font-weight: 900 → fell to system).
const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-heebo',
  display: 'swap',
});
const geistSans = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-geist-sans',
  display: 'swap',
});
const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: BRAND.name,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} ${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="font-sans antialiased min-h-screen" suppressHydrationWarning>
        {children}
        {/* Sonner toaster — RTL via dir attribute, Heebo for Hebrew. */}
        <Toaster
          position="top-center"
          dir="rtl"
          toastOptions={{
            style: {
              fontFamily: 'var(--font-heebo)',
            },
          }}
          richColors
          closeButton
        />
      </body>
    </html>
  );
}
