import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import './theme.css';
import './mono-theme.css';
import './mobile-header.css';
import './print-overrides.css';

const manrope = localFont({
  variable: '--font-ui',
  display: 'swap',
  src: [
    { path: './fonts/manrope-200.ttf', weight: '200' },
    { path: './fonts/manrope-300.ttf', weight: '300' },
    { path: './fonts/manrope-400.ttf', weight: '400' },
    { path: './fonts/manrope-500.ttf', weight: '500' },
    { path: './fonts/manrope-600.ttf', weight: '600' },
    { path: './fonts/manrope-700.ttf', weight: '700' },
    { path: './fonts/manrope-800.ttf', weight: '800' },
  ],
});

const cormorant = localFont({
  variable: '--font-display',
  display: 'swap',
  src: [
    { path: './fonts/cormorant-500.ttf', weight: '500' },
    { path: './fonts/cormorant-600.ttf', weight: '600' },
    { path: './fonts/cormorant-700.ttf', weight: '700' },
  ],
});

export const metadata: Metadata = {
  title: 'Gestão TF | Clientes e negócios',
  description: 'Sistema Gestão TF para clientes de crédito, seguros, finanças pessoais e serviços financeiros.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Gestão TF',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Gestão TF' },
  icons: {
    icon: [{ url: '/tf-emblem.png?v=53', type: 'image/png', sizes: '418x429' }],
    shortcut: '/tf-emblem.png?v=53',
    apple: '/tf-emblem.png?v=53',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><meta name="theme-color" content="#10120f" /></head>
      <body
        className={`${manrope.variable} ${cormorant.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
