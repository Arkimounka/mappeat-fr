import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 경고 메시지에 나온 9005번 포트 주소를 정확히 입력합니다.
    
  },
  // 클라우드 환경의 실시간 연결 안정성을 위해 false로 설정합니다.
  reactStrictMode: false,
};

export default nextConfig;