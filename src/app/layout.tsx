import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { QueryProvider } from '@/lib/queryClient';
import { Header } from '@/components/layout/Header';
import { VaultBootstrap } from '@/components/auth/VaultBootstrap';
import { VaultGate } from '@/components/auth/VaultGate';
import { CashToastContainer } from '@/components/ui/cash-toast';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Crypto Dashboard',
  description: '加密资产监控看板',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <QueryProvider>
            <VaultBootstrap />
            <Header />
            <main className="flex-1 px-6 py-6">
              <VaultGate>{children}</VaultGate>
            </main>
            <CashToastContainer />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
