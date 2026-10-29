import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { QueryProvider } from '@/lib/queryClient';
import { Header } from '@/components/layout/Header';
import { VaultBootstrap } from '@/components/auth/VaultBootstrap';
import { VaultGate } from '@/components/auth/VaultGate';
import { CashToastContainer } from '@/components/ui/cash-toast';
import { ChatPanel } from '@/components/ai/ChatPanel';
import { IbkrTradeSync } from '@/components/ledger/IbkrTradeSync';
import { BinanceTradeSync } from '@/components/ledger/BinanceTradeSync';
import './globals.css';
import { COLOR_SCHEME_INIT_SCRIPT } from '@/lib/theme/colorScheme';

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
      data-color-scheme="classic"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head><script dangerouslySetInnerHTML={{ __html: COLOR_SCHEME_INIT_SCRIPT }} /></head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <QueryProvider>
            <VaultBootstrap />
            <IbkrTradeSync />
            <BinanceTradeSync />
            <Header />
            <main className="flex-1 px-6 py-6">
              <VaultGate>{children}</VaultGate>
            </main>
            <CashToastContainer />
            <ChatPanel />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
