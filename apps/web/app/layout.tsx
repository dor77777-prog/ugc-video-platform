import type { Metadata } from 'next';
import { Heebo, IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import { BRAND } from '@/lib/brand';
import './globals.css';

// V19.1 — Heebo for Hebrew (perfect RTL coverage), IBM Plex Sans for
// Latin (cloud-platform / Vercel-grade), JetBrains Mono for code +
// numbers. The Tailwind font stack falls through Heebo → IBM Plex →
// system, so Hebrew always renders Heebo; English+numbers default to
// IBM Plex.
const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-heebo',
  display: 'swap',
});
const ibmPlex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-ibm-plex',
  display: 'swap',
});
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains',
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
      className={`${heebo.variable} ${ibmPlex.variable} ${jetbrains.variable}`}
    >
      <body className="font-sans antialiased min-h-screen" suppressHydrationWarning>
        {children}
        {/* V16 — sonner toaster mounted globally so any client component
            can call toast.success / toast.error without setup. RTL-aware
            via the dir attribute on <html>. */}
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
