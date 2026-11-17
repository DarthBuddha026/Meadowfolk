import type { Metadata, Viewport } from 'next';
import { Fredoka, Nunito } from 'next/font/google';
import './globals.css';

const fredoka = Fredoka({ subsets: ['latin'], variable: '--font-fredoka', weight: ['400', '500', '600', '700'] });
const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito' });

export const metadata: Metadata = {
  title: 'Meadowfolk',
  description: 'A cozy clay-diorama farm game: grow, sell, build your villa, and play with friends.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable}`}>
      {/* Browser extensions (e.g. ColorZilla's cz-shortcut-listen) add attributes to <body> before hydration. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
