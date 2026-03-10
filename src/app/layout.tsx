// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// 👇 [중요] 경로가 '../lib/AuthContext' 입니다 (src/app -> src/lib)
import { AuthProvider } from "../lib/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mappeat", // 👈 [수정 1] 앱 이름 변경
  description: "Mapping Context & Repeating Expressions", // 👈 [수정 2] 설명 업데이트
  manifest: "/manifest.json", // 👈 [수정 3] PWA 매니페스트 파일 연결 (필수!)
  icons: {
    icon: "/icon-192x192.png",
    apple: "/icon-192x192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${inter.className} bg-gray-900 text-white`}>
        {/* AuthProvider로 앱 전체를 감쌉니다 */}
        <AuthProvider>
          <main className="container mx-auto px-4 py-8">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}