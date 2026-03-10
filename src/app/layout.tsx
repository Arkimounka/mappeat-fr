// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// 👇 [중요] 경로가 '../lib/AuthContext' 입니다 (src/app -> src/lib)
import { AuthProvider } from "../lib/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "프랑스어 Mappeat", // 👈 앱 이름 명확화 (프랑스어 버전)
  description: "문맥으로 배우고 반복하는 프랑스어 학습 (Mapping Context & Repeating French Expressions)", // 👈 검색 엔진 노출용 설명 업데이트
  manifest: "/manifest.json", 
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