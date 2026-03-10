'use client';

import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { db } from '../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function LoginView() {
  const { user, userData, loginWithGoogle } = useAuth();
  const [isSelectingRole, setIsSelectingRole] = useState(false);

  // 👇 [수정] 역할 선택 처리 함수: 'teacher' 타입 추가
  const handleRoleSelect = async (role: 'teacher' | 'parent' | 'student' | 'independent') => {
    if (!user) return;
    setIsSelectingRole(true);
    try {
      const d = new Date();
      const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      
      await setDoc(doc(db, 'Users', user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        role: role, // 선택한 역할 저장
        createdAt: serverTimestamp(),
        lastStudyDate: todayStr,
        dailyRecallCount: 0,
        totalLearningTimeInMinutes: 0
      }, { merge: true });
    } catch (error) {
      console.error("Role update failed", error);
      alert("역할 설정에 실패했습니다.");
      setIsSelectingRole(false);
    }
  };

  // 로그인은 완료했으나 아직 역할(role)이 없는 경우 보여지는 선택 화면
  if (user && (!userData || !userData.role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a] text-white p-6 relative overflow-hidden">
        <div className="z-10 bg-gray-800 p-8 rounded-3xl shadow-2xl border-2 border-indigo-500/30 max-w-md w-full animate-in zoom-in duration-500">
          <h2 className="text-2xl font-black text-center mb-2 text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-purple-500">
            환영합니다! 🎉
          </h2>
          <p className="text-center text-gray-400 mb-8 text-sm">
            Mappeat을 어떻게 사용하실 예정인가요?<br/>역할을 선택해 주세요.
          </p>

          <div className="flex flex-col gap-4">
            {/* 🚀 [신규 추가] 선생님 역할 버튼 */}
            <button 
              onClick={() => handleRoleSelect('teacher')} disabled={isSelectingRole}
              className="w-full flex items-center p-4 bg-gray-700 hover:bg-gray-600 rounded-xl border border-gray-600 hover:border-yellow-400 transition-all text-left group"
            >
              <span className="text-3xl mr-4 group-hover:scale-110 transition-transform">👨‍🏫</span>
              <div>
                <div className="font-bold text-yellow-300">선생님 (Teacher)</div>
                <div className="text-xs text-gray-400 mt-1">다수의 학생들과 실시간 퀴즈 방을 운영합니다.</div>
              </div>
            </button>

            <button 
              onClick={() => handleRoleSelect('parent')} disabled={isSelectingRole}
              className="w-full flex items-center p-4 bg-gray-700 hover:bg-gray-600 rounded-xl border border-gray-600 hover:border-indigo-400 transition-all text-left group"
            >
              <span className="text-3xl mr-4 group-hover:scale-110 transition-transform">👨‍👩‍👧</span>
              <div>
                <div className="font-bold text-indigo-300">학부모 (Parent)</div>
                <div className="text-xs text-gray-400 mt-1">자녀에게 학습할 문장을 지정해줍니다.</div>
              </div>
            </button>

            <button 
              onClick={() => handleRoleSelect('student')} disabled={isSelectingRole}
              className="w-full flex items-center p-4 bg-gray-700 hover:bg-gray-600 rounded-xl border border-gray-600 hover:border-teal-400 transition-all text-left group"
            >
              <span className="text-3xl mr-4 group-hover:scale-110 transition-transform">🧑‍🎓</span>
              <div>
                <div className="font-bold text-teal-300">학생 (Student)</div>
                <div className="text-xs text-gray-400 mt-1">스스로 또는 함께 재밌게 학습합니다.</div>
              </div>
            </button>

            <button 
              onClick={() => handleRoleSelect('independent')} disabled={isSelectingRole}
              className="w-full flex items-center p-4 bg-gray-700 hover:bg-gray-600 rounded-xl border border-gray-600 hover:border-purple-400 transition-all text-left group"
            >
              <span className="text-3xl mr-4 group-hover:scale-110 transition-transform">🙋</span>
              <div>
                <div className="font-bold text-purple-300">일반 학습자 (Independent)</div>
                <div className="text-xs text-gray-400 mt-1">혼자서 자유롭게 추가하고 학습합니다.</div>
              </div>
            </button>
          </div>
          {isSelectingRole && <p className="text-center text-indigo-400 mt-6 animate-pulse text-sm font-bold">설정 중입니다...</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-between min-h-screen bg-[#0f172a] text-white p-6 relative overflow-hidden">
      
      {/* 1. 폰트 로드 */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap');
          .font-script { font-family: 'Dancing Script', cursive; }
        `
      }} />

      {/* 배경 장식 (은은한 분위기 연출) */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-500/20 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-teal-500/20 rounded-full blur-[100px] pointer-events-none"></div>

      {/* 2. 상단 로고 영역 */}
      <div className="w-full flex flex-col items-center justify-center pt-12 animate-in fade-in zoom-in duration-700">
        <h1 className="text-5xl md:text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-teal-400 via-purple-500 to-pink-500 mb-2 drop-shadow-lg">
          Mappeat
        </h1>
        {/* 네온사인 텍스트 그림자 효과 */}
        <p 
          className="text-teal-300 text-3xl md:text-4xl font-script tracking-widest mt-2"
          style={{ textShadow: '0 0 10px rgba(45, 212, 191, 0.8), 0 0 20px rgba(45, 212, 191, 0.4)' }}
        >
          Mapping & Repeat
        </p>
      </div>

      {/* 3. 로그인 버튼 영역 */}
      <div className="flex-1 w-full max-w-sm flex flex-col justify-center items-center pb-12 animate-in slide-in-from-bottom-10 duration-700 delay-300">
        <button
          onClick={loginWithGoogle}
          className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white text-gray-900 rounded-2xl font-bold text-base md:text-lg hover:bg-gray-50 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]"
        >
          {/* 구글 아이콘 SVG */}
          <svg className="w-6 h-6" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Google로 시작하기
        </button>
        <p className="text-center text-slate-500 text-xs mt-4">
          계속 진행하면 서비스 이용약관에 동의하게 됩니다.
        </p>
      </div>
    </div>
  );
}