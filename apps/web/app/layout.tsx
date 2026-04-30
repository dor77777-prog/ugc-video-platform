import type { Metadata } from 'next';
import { Heebo } from 'next/font/google';
import { Toaster } from 'sonner';
import { BRAND } from '@/lib/brand';
import './globals.css';

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-heebo',
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
    <html lang="he" dir="rtl" className={heebo.variable}>
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
