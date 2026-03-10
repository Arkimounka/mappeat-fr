// src/lib/AuthContext.tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { doc, onSnapshot, getFirestore } from 'firebase/firestore';
import { app } from './firebase'; 

const auth = getAuth(app);
const db = getFirestore(app); 

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export interface UserData {
  uid?: string;
  role?: 'parent' | 'student' | 'independent' | 'teacher';
  linkedParent?: string;
  linkedStudents?: string[];
  inviteCode?: string;
  [key: string]: any;
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null; 
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  // 👇 다시 정상적인 비동기(Promise) 함수로 원상 복구합니다.
  logout: () => Promise<void>; 
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeDoc: (() => void) | null = null; 

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      
      if (unsubscribeDoc) {
        unsubscribeDoc();
        unsubscribeDoc = null;
      }

      if (currentUser) {
        unsubscribeDoc = onSnapshot(doc(db, 'Users', currentUser.uid), (docSnap) => {
          if (docSnap.exists()) {
            setUserData({ uid: currentUser.uid, ...docSnap.data() } as UserData);
          } else {
            setUserData(null);
          }
          setLoading(false);
        });
      } else {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => {
      if (unsubscribeDoc) unsubscribeDoc();
      unsubscribeAuth();
    };
  }, []);

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login Failed", error);
      alert("로그인에 실패했습니다.");
    }
  };

  // 👇 [정상화된 로그아웃 코드] 불필요한 꼼수를 제거하고 가장 안정적인 형태로 복구했습니다.
  const logout = async () => {
    try {
      // 앱이 생성한 찌꺼기만 정밀 제거 (Firebase 보호)
      localStorage.removeItem('mappeat_selected_student'); 
      
      // 정상적으로 Firebase 로그아웃 대기
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    } finally {
      // 잔상을 없애기 위한 물리적 강제 새로고침
      window.location.reload();
    }
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};