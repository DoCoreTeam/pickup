/**
 * 가게페이지 앱 루트 레이아웃
 * Next.js 15 App Router 기본 설정
 * 
 * @author DOCORE
 */

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '픽업 가게페이지',
  description: '전화 한 번, 앱 한 번으로 우리 가게에 바로 연결!',
  viewport: 'width=480, initial-scale=1, maximum-scale=1, user-scalable=no',
  themeColor: '#111827',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
      </head>
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-900">
          {children}
        </div>
      </body>
    </html>
  );
}
