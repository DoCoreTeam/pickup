/**
 * 어드민 앱 루트 레이아웃
 * Next.js 15 App Router 기본 설정
 * 
 * @author DOCORE
 */

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '픽업 어드민',
  description: '픽업 서비스 관리자 패널',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50">
          {children}
        </div>
      </body>
    </html>
  );
}
