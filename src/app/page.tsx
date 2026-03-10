/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable prefer-const */

'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import LoginView from '../components/LoginView';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc, 
  increment, 
  onSnapshot, 
  setDoc, 
  deleteDoc,
  writeBatch,
  arrayUnion,
  arrayRemove, 
  getDoc 
} from 'firebase/firestore';
import { evaluateAnswer, generateRecallTrigger, EvaluationResult, generateLiveQuiz, LiveQuizData, generateRemedialHomework, RemedialData } from '../lib/gemini';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const playDingSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const playCoinTone = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.1, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playCoinTone(1800, now, 0.6); 
    playCoinTone(2200, now, 0.5);
    playCoinTone(2400, now + 0.05, 0.3); 
  } catch (e) { console.error(e); }
};

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-gray-800 border border-gray-600 p-3 rounded-lg shadow-xl text-sm z-50">
                <p className="text-gray-300 font-bold mb-2 border-b border-gray-600 pb-1">{label}</p>
                {payload.map((entry: any, index: number) => {
                     if(entry.value === 0) return null; 
                    return (
                        <div key={index} className="flex items-center justify-between gap-4 mb-1">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                                <span className="text-gray-300 font-medium capitalize">{entry.name}</span>
                            </div>
                            <span className="text-white font-bold">{entry.value}건</span>
                        </div>
                    )
                })}
              </div>
        );
    }
    return null;
};

function MainContent() {
  const { user, userData, loading, logout } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const userId = user?.uid;

  const [activeTab, setActiveTab] = useState('add');
  const [showContext, setShowContext] = useState(false);
  const [showKeywordSearch, setShowKeywordSearch] = useState(false);
  
  const selectedLanguage = 'en';
  const [originalText, setOriginalText] = useState('');
  const [userContext, setUserContext] = useState('');
  const [returnTab, setReturnTab] = useState<string | null>(null);

  const [showCoinAnim, setShowCoinAnim] = useState(false);

  const [reviewSentence, setReviewSentence] = useState<any>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [reviewKeyword, setReviewKeyword] = useState('');
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);
  const [recallTrigger, setRecallTrigger] = useState('');
  const [isGeneratingTrigger, setIsGeneratingTrigger] = useState(false);

  const [activeExtendedItem, setActiveExtendedItem] = useState<{ type: 'similar', index: number, text: string, position: { top: number; left: number } } | null>(null);
  const [savedExtendedItems, setSavedExtendedItems] = useState<{ [key: string]: boolean }>({});
  const [speakingItem, setSpeakingItem] = useState<{ type: string, index: number } | null>(null);
  const [isSpeakingOriginal, setIsSpeakingOriginal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingSentence, setEditingSentence] = useState<any>(null);
  const [editOriginalText, setEditOriginalText] = useState('');
  const [editUserContext, setEditUserContext] = useState('');
  
  const [allSentences, setAllSentences] = useState<any[]>([]);
  const [librarySentences, setLibrarySentences] = useState<any[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLibrarySentenceId, setSelectedLibrarySentenceId] = useState<string | null>(null);
  
  const [selectedForTransfer, setSelectedForTransfer] = useState<string[]>([]);
  const [selectedForTransferStudents, setSelectedForTransferStudents] = useState<string[]>([]);
  const transferLongPressTimerRef = useRef<number | null>(null);
  const isLongPressTriggeredRef = useRef<boolean>(false);

  const [libraryFilter, setLibraryFilter] = useState<'all' | 'ready' | 'wrong' | 'mastered'>('all'); 
  const [unlockedMasters, setUnlockedMasters] = useState<{ [key: string]: boolean }>({}); 

  const [liveSession, setLiveSession] = useState<any>(null);
  const [isCoMappingMode, setIsCoMappingMode] = useState(false);
  const [showCoMapAlert, setShowCoMapAlert] = useState(false);
  const [coMapVideoStatus, setCoMapVideoStatus] = useState<'passed' | 'retry' | null>(null);
  const prevSessionStatusRef = useRef<string | null>(null);
  const [isGeneratingLiveQuiz, setIsGeneratingLiveQuiz] = useState(false);
  
  // 🚀 [Phase 5] 맞춤형 오답 숙제 일괄 전송 상태 관리
  const [isGeneratingRemedial, setIsGeneratingRemedial] = useState(false);
  const [remedialPreviewData, setRemedialPreviewData] = useState<RemedialData[] | null>(null);
  // 🚀 [Phase 2] 단일 퀴즈에서 퀴즈 배열(Playlist)로 타입 변경 및 모달 인덱스 추가
  const [liveQuizPreview, setLiveQuizPreview] = useState<LiveQuizData[] | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0); 
  const [isQuizMode, setIsQuizMode] = useState(false);
  // 🚀 선생님 라이브 퀴즈 모드 토글 상태

  // 🚀 [Phase 3] 선생님 타이머 및 자동 채점 상태 추가
  const [teacherQuizTimeLeft, setTeacherQuizTimeLeft] = useState(15);
  const teacherQuizTimerRef = useRef<number | null>(null);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isRetryModalOpen, setIsRetryModalOpen] = useState(false);
  const [retryTarget, setRetryTarget] = useState<'hint' | 'evaluation' | null>(null);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  
  const [studentProfiles, setStudentProfiles] = useState<any[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isParentInviteModalOpen, setIsParentInviteModalOpen] = useState(false);
  const [isCooldownModalOpen, setIsCooldownModalOpen] = useState(false);

  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const longPressTimerRef = useRef<number | null>(null);

  const [teacherClasses, setTeacherClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [isCreateClassModalOpen, setIsCreateClassModalOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [editingClassStudent, setEditingClassStudent] = useState<{uid: string, currentName: string} | null>(null);

  const [isClassLinkModalOpen, setIsClassLinkModalOpen] = useState(false);
  const [classCodeInput, setClassCodeInput] = useState('');
  const [realNameInput, setRealNameInput] = useState('');
  const [studentClassesData, setStudentClassesData] = useState<any[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const prevLinkedClasses = useRef<string[]>([]);
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);
  const [reviewSourceFilter, setReviewSourceFilter] = useState<string>('all'); 

  const targetUserId = userData?.role === 'parent' ? selectedStudentId : userId;

  let currentStudentName = '학생';
  if (userData?.role === 'parent') {
      const currentStudent = studentProfiles.find(p => p.uid === targetUserId);
      if (currentStudent?.displayName) currentStudentName = currentStudent.displayName.split(' ')[0];
  } else {
      if (userData?.displayName) currentStudentName = userData.displayName.split(' ')[0];
  }

  const [dashboardData, setDashboardData] = useState({ 
      dailyRecallCount: 0, 
      totalLearningTimeInMinutes: 0,
      totalMappingCount: 0,
  });

  const [isDarkRoomActive, setIsDarkRoomActive] = useState(false);
  const [darkRoomState, setDarkRoomState] = useState<{status: string, text: string}>({status: '대기 중...', text: ''});
  const isDarkRoomPlayingRef = useRef(false);
  const playbackSessionIdRef = useRef(0);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const [isListening, setIsListening] = useState<'original' | 'context' | 'answer' | 'editOriginal' | 'editContext' | null>(null);
  const [inputMethod, setInputMethod] = useState<string>('keyboard'); 

  const startTimeRef = useRef<number | null>(null);
  const libraryTopRef = useRef<HTMLDivElement>(null);
  const libraryBottomRef = useRef<HTMLDivElement>(null);

  const [isAtBottom, setIsAtBottom] = useState(false);
  const [chartTab, setChartTab] = useState<'week' | 'month'>('week');
  const [rawLogs, setRawLogs] = useState<any[]>([]);

  const [activeSlide, setActiveSlide] = useState(0);
  const swipeContainerRef = useRef<HTMLDivElement>(null);

  const isStudentQuizActive = liveSession && liveSession.status !== 'idle';
  // 🚀 [Step 3-2] 선생님 화면에서 라이브 퀴즈가 진행 중인지 확인
  const currentSelectedClass = teacherClasses.find(c => c.id === selectedClassId);
  // 🚀 [Phase 2] 학생 라이브 퀴즈 상태 연동 (Playlist 지원)
  const activeClassWithQuiz = studentClassesData.find(c => c?.activeLiveQuiz != null);
  const studentActiveQuizData = activeClassWithQuiz?.activeLiveQuiz;
  const isStudentInClassQuiz = userData?.role === 'student' && studentActiveQuizData != null;
  
  // 현재 배열에서 진행 중인 문제 객체 추출
  const currentStudentQuestion = studentActiveQuizData?.playlist?.[studentActiveQuizData?.currentQuestionIndex];
  
  const hasStudentSubmitted = userId ? studentActiveQuizData?.answers?.[userId] : false;
  // 문제 인덱스가 바뀌면 식별자(Identity)가 변해 타이머가 자동 초기화됨
  const quizIdentity = isStudentInClassQuiz && currentStudentQuestion ? `${activeClassWithQuiz.id}-${studentActiveQuizData.currentQuestionIndex}` : '';

  const [liveQuizTimeLeft, setLiveQuizTimeLeft] = useState(15);
  const liveQuizTimerRef = useRef<number | null>(null);
  const latestQuizRef = useRef<{classId: string, correctIdx: number} | null>(null);

  useEffect(() => {
      if (activeClassWithQuiz && currentStudentQuestion) {
          latestQuizRef.current = { classId: activeClassWithQuiz.id, correctIdx: currentStudentQuestion.correctAnswerIndex };
      }
  }, [activeClassWithQuiz, currentStudentQuestion]);

  const submitStudentAnswer = async (selectedIndex: number, classId: string, correctAnswerIndex: number) => {
      if (!classId || !userId) return;
      const isCorrect = selectedIndex === correctAnswerIndex;
      const classRef = doc(db, 'Classes', classId);
      try {
          await updateDoc(classRef, {
              [`activeLiveQuiz.answers.${userId}`]: {
                  selectedIndex,
                  isCorrect,
                  submittedAt: serverTimestamp()
              }
          });
          if (isCorrect) {
              playDingSound();
              setShowCoinAnim(true);
              setTimeout(() => setShowCoinAnim(false), 2000);
          }
      } catch(e) {
          console.error(e);
      }
  };

  useEffect(() => {
      if (userData?.role === 'student' && studentActiveQuizData?.status === 'playing' && !hasStudentSubmitted) {
          setLiveQuizTimeLeft(15);
          if (liveQuizTimerRef.current) clearInterval(liveQuizTimerRef.current);
          liveQuizTimerRef.current = window.setInterval(() => {
              setLiveQuizTimeLeft(prev => {
                  if (prev <= 1) {
                      clearInterval(liveQuizTimerRef.current!);
                      // 자동 15초 종료: 상태 업데이트 (선생님 화면에서 자동 채점 및 결과보기 트리거)
                      if (latestQuizRef.current && userId) {
                           submitStudentAnswer(-1, latestQuizRef.current.classId, latestQuizRef.current.correctIdx);
                      }
                      return 0;
                  }
                  return prev - 1;
              });
          }, 1000);
      } else {
          if (liveQuizTimerRef.current) {
              clearInterval(liveQuizTimerRef.current);
              liveQuizTimerRef.current = null;
          }
      }
      return () => {
          if (liveQuizTimerRef.current) clearInterval(liveQuizTimerRef.current);
      };
  }, [quizIdentity, hasStudentSubmitted, userData?.role, userId]);
  const isTeacherClassQuizActive = userData?.role === 'teacher' && currentSelectedClass?.activeLiveQuiz;

  useEffect(() => {
    if (userData?.role === 'student') {
        const currentLinked = userData.linkedClasses || [];
        
        if (prevLinkedClasses.current.length > currentLinked.length) {
            setToastMessage("안내: 선생님에 의해 클래스 연결이 해제되었습니다.");
        }
        prevLinkedClasses.current = currentLinked;

        if (currentLinked.length > 0) {
            const q = query(collection(db, 'Classes'), where('__name__', 'in', currentLinked.slice(0, 10)));
            const unsub = onSnapshot(q, snap => {
                setStudentClassesData(snap.docs.map(d => ({id: d.id, ...d.data()})));
            });
            return () => unsub();
        } else {
            setStudentClassesData([]);
        }
    }
  }, [userData?.role, userData?.linkedClasses]);

  useEffect(() => {
      if (userData?.role === 'teacher' && userId) {
          const q = query(collection(db, 'Classes'), where('teacherId', '==', userId));
          const unsubscribe = onSnapshot(q, (snapshot) => {
              const classes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              classes.sort((a: any, b: any) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
              setTeacherClasses(classes);

              setSelectedClassId(prevId => {
                  if (prevId && classes.some(c => c.id === prevId)) return prevId;
                  if (classes.length > 0) return classes[0].id;
                  return null;
              });
          });
          return () => unsubscribe();
      } else {
          setTeacherClasses([]);
      }
  }, [userData?.role, userId]);
  
  // 🚀 [Step 3-2] 라이브 퀴즈 생성 및 모달 호출
  // 🚀 [Phase 2 & 5] 다중 퀴즈 생성 및 모달 호출 (에러 방지: 3회 자동 재시도 로직 추가)
  const handleOpenLiveQuizPreview = async () => {
      if (selectedForTransfer.length === 0) return;
      const selectedSentences = selectedForTransfer.map(id => {
          const s = librarySentences.find(s => s.id === id);
          // 🚀 [Phase 4] 나중에 T 마크를 달기 위해 id 속성도 함께 포장해서 넘겨줍니다.
          return s ? { id: s.id, originalText: s.originalText, userContext: s.userContext || '' } : null;
      }).filter(Boolean);
      if (selectedSentences.length === 0) return;

      setIsGeneratingLiveQuiz(true);
      setPreviewIndex(0); 
      
      let success = false;
      let attempts = 0;
      const maxAttempts = 3; // 최대 3번까지 몰래 다시 시도

      while (attempts < maxAttempts && !success) {
          try {
              attempts++;
              const quizDataArray = await generateLiveQuiz(selectedSentences as any);
              if (quizDataArray && Array.isArray(quizDataArray) && quizDataArray.length > 0) {
                  // 🚀 [Bug Fix] 나중에 숙제를 보낼 때 깨지지 않도록 원본 문장(originalText)도 퀴즈 봇짐에 같이 싸서 보냅니다.
                  setLiveQuizPreview(quizDataArray.map((q, idx) => ({ 
                      ...q, 
                      originalSentenceId: selectedSentences[idx]?.id,
                      originalText: selectedSentences[idx]?.originalText 
                  })));
                  success = true;
              } else {
                  console.warn(`[AI 퀴즈 생성 실패] 시도 횟수: ${attempts}/${maxAttempts}`);
              }
          } catch(e) {
              console.error(`[AI 퀴즈 생성 에러] 시도 횟수: ${attempts}/${maxAttempts}`, e);
          }
      }

      if (!success) {
          alert("AI 튜터가 문제를 생성하는 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }
      
      setIsGeneratingLiveQuiz(false);
  };

  // 🚀 [Phase 2] 퀴즈 플레이리스트(배열) 전송
  const handleDispatchLiveQuiz = async () => {
      if (!liveQuizPreview || !selectedClassId) return;
      try {
          const classRef = doc(db, 'Classes', selectedClassId);
          await updateDoc(classRef, {
              activeLiveQuiz: {
                  playlist: liveQuizPreview, // 배열 전체 저장
                  currentQuestionIndex: 0,   // 현재 진행 중인 문제 번호
                  status: 'playing',
                  startedAt: serverTimestamp(),
                  answers: {} 
              }
          });
          setLiveQuizPreview(null);
          setSelectedForTransfer([]); 
      } catch(e) {
          console.error(e);
          alert("퀴즈 전송 중 오류가 발생했습니다.");
      }
  };

  // 🚀 [Phase 4] 다음 퀴즈로 넘어가기 (결과 히스토리 누적 저장)
  const handleNextLiveQuiz = async () => {
      if (!selectedClassId || !currentSelectedClass?.activeLiveQuiz) return;
      const currentQuiz = currentSelectedClass.activeLiveQuiz;
      const nextIndex = currentQuiz.currentQuestionIndex + 1;
      const currentAnswers = currentQuiz.answers || {};
      const newHistory = [...(currentQuiz.history || []), currentAnswers];

      if (nextIndex < currentQuiz.playlist.length) {
          await updateDoc(doc(db, 'Classes', selectedClassId), {
              'activeLiveQuiz.currentQuestionIndex': nextIndex,
              'activeLiveQuiz.status': 'playing',
              'activeLiveQuiz.answers': {}, // 현재 뷰 초기화
              'activeLiveQuiz.history': newHistory, // 이전 정답 내역 보관
              'activeLiveQuiz.startedAt': serverTimestamp()
          });
      }
  };

  const handleEndLiveQuiz = async () => {
      if (!selectedClassId) return;
      await updateDoc(doc(db, 'Classes', selectedClassId), { 'activeLiveQuiz.status': 'finished' });
  };

  // 🚀 [Phase 4] 최종 리포트 화면으로 전환 (데이터 살려두기 및 Top 3 오답 추출)
  // 🚀 [Phase 6] Top 3 오답 추출 로직 제거 (학생 개별 맞춤 진단으로 대체)
  const handleShowFinalReport = async () => {
      if (!selectedClassId || !currentSelectedClass?.activeLiveQuiz) return;
      const currentQuiz = currentSelectedClass.activeLiveQuiz;
      const currentAnswers = currentQuiz.answers || {};
      const newHistory = [...(currentQuiz.history || []), currentAnswers];
      
      await updateDoc(doc(db, 'Classes', selectedClassId), {
          'activeLiveQuiz.status': 'report',
          'activeLiveQuiz.history': newHistory,
          'activeLiveQuiz.answers': currentAnswers
      });
  };
  // 🚀 [Phase 5] 맞춤형 오답 숙제 생성 (선생님 검수 모달 호출)
  const handleGenerateRemedialHomework = async () => {
      if (!selectedClassId || !currentSelectedClass?.activeLiveQuiz) return;
      setIsGeneratingRemedial(true);

      const currentQuiz = currentSelectedClass.activeLiveQuiz;
      const history = currentQuiz.history || [];

      // 1. 틀린 문장 추출 (중복 제거) 및 진단용 학생별 오답 수집
      const wrongSentenceMap = new Map();
      const studentWrongData: Record<string, { originalText: string; userAnswer: string; hint: string }[]> = {};
      const todayStr = getTodayStr();

      history.forEach((answers: any, idx: number) => {
          const q = currentQuiz.playlist[idx];
          // 🚀 Object.values 대신 Object.entries를 사용하여 학생 uid도 함께 뽑아냅니다.
          Object.entries(answers).forEach(([studentUid, a]: [string, any]) => {
              if (!a.isCorrect && q.originalSentenceId) {
                  // 🚀 [Bug Fix] 안전하게 저장된 원본 문장을 꺼내 씁니다. 만약 없다면 다중 빈칸을 스마트하게 쪼개서 복구합니다.
                  let fullOriginalText = q.originalText;
                  if (!fullOriginalText) {
                      const correctWord = q.options[q.correctAnswerIndex] || '';
                      const blanksCount = (q.blankSentence.match(/\(\s*____\s*\)|____/g) || []).length;
                      const correctWords = correctWord.includes(',') && correctWord.split(',').length === blanksCount
                          ? correctWord.split(',').map((w: string) => w.trim())
                          : [correctWord];
                      
                      let matchIndex = 0;
                      fullOriginalText = q.blankSentence.replace(/\(\s*____\s*\)|____/g, () => {
                          const word = correctWords[matchIndex] !== undefined ? correctWords[matchIndex] : correctWord;
                          matchIndex++;
                          return word;
                      });
                  }
                  
                  wrongSentenceMap.set(q.originalSentenceId, {
                      id: q.originalSentenceId,
                      originalText: fullOriginalText,
                      userContext: q.koreanHint
                  });

                  // 🚀 [AI 진단] 학생별 오답 리스트에 차곡차곡 담기
                  if (!studentWrongData[studentUid]) studentWrongData[studentUid] = [];
                  studentWrongData[studentUid].push({
                      originalText: fullOriginalText,
                      userAnswer: q.options[a.selectedIndex] || '시간 초과(미제출)',
                      hint: q.koreanHint
                  });
              }
          });
      });

      const wrongSentences = Array.from(wrongSentenceMap.values());
      if (wrongSentences.length === 0) {
          alert("오답이 발생한 문장이 없어 숙제를 생성할 필요가 없습니다! 🎉");
          setIsGeneratingRemedial(false);
          return;
      }

      // 2. AI에게 응용 문장 요청 (조수 A 먼저 출발)
      const aiResults = await generateRemedialHomework(wrongSentences);
      
      if (aiResults && aiResults.length > 0) {
          setRemedialPreviewData(aiResults);
      } else {
          alert("AI 숙제 생성 중 오류가 발생했습니다. 다시 시도해 주세요.");
      }
      setIsGeneratingRemedial(false);
  };

  // 🚀 [Phase 5] 검수 완료된 숙제를 학생들 DB에 분배하고 퀴즈 폭파
  // 🚀 [Phase 5] 검수 완료된 숙제를 학생들 DB에 분배하고 퀴즈 폭파
  const handleDispatchRemedialHomework = async () => {
      if (!selectedClassId || !currentSelectedClass?.activeLiveQuiz || !remedialPreviewData) return;
      const currentQuiz = currentSelectedClass.activeLiveQuiz;
      const history = currentQuiz.history || [];
      let currentBatch = writeBatch(db);
      let count = 0;
      const chunks = [];

      // 🚀 [Phase 6] 선생님 원본 문장 '전송 완료' 동기화를 위해 전송된 문장 ID 수집
      const assignedSentenceIds = new Set<string>();

      // 각 문항(idx)별로 누가 틀렸는지 파악
      history.forEach((answers: any, idx: number) => {
          const q = currentQuiz.playlist[idx];
          const originalId = q.originalSentenceId;
          const aiVariation = remedialPreviewData.find(r => r.originalSentenceId === originalId);

          Object.keys(answers).forEach(studentUid => {
              if (!answers[studentUid].isCorrect) {
                  // 🚀 [Bug Fix] 안전하게 저장된 원본 문장을 꺼내 씁니다. 만약 없다면 다중 빈칸을 스마트하게 쪼개서 복구합니다.
                  let fullOriginalText = q.originalText;
                  if (!fullOriginalText) {
                      const correctWord = q.options[q.correctAnswerIndex] || '';
                      const blanksCount = (q.blankSentence.match(/\(\s*____\s*\)|____/g) || []).length;
                      const correctWords = correctWord.includes(',') && correctWord.split(',').length === blanksCount
                          ? correctWord.split(',').map((w: string) => w.trim())
                          : [correctWord];
                      
                      let matchIndex = 0;
                      fullOriginalText = q.blankSentence.replace(/\(\s*____\s*\)|____/g, () => {
                          const word = correctWords[matchIndex] !== undefined ? correctWords[matchIndex] : correctWord;
                          matchIndex++;
                          return word;
                      });
                  }

                  // ① 원본 문장 전송 (오답 꼬리표 부착)
                  const newOrigRef = doc(collection(db, 'Sentences'));
                  currentBatch.set(newOrigRef, {
                      originalText: fullOriginalText,
                      userContext: q.koreanHint,
                      languageCode: 'en',
                      ownerId: studentUid,
                      createdBy: userId,
                      sourceClass: selectedClassId,
                      createdAt: serverTimestamp(),
                      lastLearnedAt: serverTimestamp(),
                      cooldownUntil: serverTimestamp(),
                      isMastered: false,
                      recallCount: 0,
                      isQuizIncorrect: true // 🚨 오답 노트 필터용 꼬리표
                  });
                  count++;

                  // ② AI 응용 문장 전송 (오답 꼬리표 부착)
                  if (aiVariation) {
                      const newAiRef = doc(collection(db, 'Sentences'));
                      currentBatch.set(newAiRef, {
                          originalText: aiVariation.aiSentence,
                          userContext: aiVariation.aiKorean,
                          languageCode: 'en',
                          ownerId: studentUid,
                          createdBy: userId,
                          sourceClass: selectedClassId,
                          createdAt: serverTimestamp(),
                          lastLearnedAt: serverTimestamp(),
                          cooldownUntil: serverTimestamp(),
                          isMastered: false,
                          recallCount: 0,
                          isQuizIncorrect: true // 🚨 오답 노트 필터용 꼬리표
                      });
                      count++;
                  }
                  
                  // 🚀 학생에게 전송된 원본 문장 ID 기록
                  if (originalId) assignedSentenceIds.add(originalId);

                  if (count >= 490) {
                      chunks.push(currentBatch.commit());
                      currentBatch = writeBatch(db);
                      count = 0;
                  }
              }
          });
      });

      if (count > 0) chunks.push(currentBatch.commit());
      await Promise.all(chunks);

      // 🚀 [Phase 6] 학생들에게 전송된 원본 문장들을 선생님 라이브러리에서 '전송 완료(isAssigned: true)' 처리
      if (assignedSentenceIds.size > 0) {
          let updateBatch = writeBatch(db);
          let updateCount = 0;
          const updateChunks = [];
          
          assignedSentenceIds.forEach(sentenceId => {
              updateBatch.update(doc(db, 'Sentences', sentenceId), { isAssigned: true });
              updateCount++;
              if (updateCount === 490) {
                  updateChunks.push(updateBatch.commit());
                  updateBatch = writeBatch(db);
                  updateCount = 0;
              }
          });
          if (updateCount > 0) updateChunks.push(updateBatch.commit());
          await Promise.all(updateChunks);
      }

      alert("성공적으로 맞춤형 오답 숙제(원본+응용)가 전송되었습니다! 🎉");
      setRemedialPreviewData(null);
      handleClearLiveQuiz(); // 💥 숙제 배달 완료 후 퀴즈 방 폭파
      
      // 🚀 UI 동기화를 위해 라이브러리 새로고침
      fetchLibrarySentences();
  };
  const handleClearLiveQuiz = async () => {
      if (!selectedClassId) return;
      await updateDoc(doc(db, 'Classes', selectedClassId), { activeLiveQuiz: null });
  };
  
  // 🚀 [Phase 3] 선생님 15초 타이머 및 자동 채점(종료) 로직 추가
  const currentQuizStatus = currentSelectedClass?.activeLiveQuiz?.status;
  const currentQuizIdx = currentSelectedClass?.activeLiveQuiz?.currentQuestionIndex;
  const classTotalStudents = currentSelectedClass?.students?.length || 0;
  const classSubmittedCount = Object.keys(currentSelectedClass?.activeLiveQuiz?.answers || {}).length;

  useEffect(() => {
      if (isTeacherClassQuizActive && currentQuizStatus === 'playing') {
          setTeacherQuizTimeLeft(15);
          if (teacherQuizTimerRef.current) clearInterval(teacherQuizTimerRef.current);
          
          teacherQuizTimerRef.current = window.setInterval(() => {
              setTeacherQuizTimeLeft(prev => {
                  if (prev <= 1) {
                      clearInterval(teacherQuizTimerRef.current!);
                      handleEndLiveQuiz(); // 15초 종료 시 자동 채점 트리거!
                      return 0;
                  }
                  return prev - 1;
              });
          }, 1000);
      } else {
          if (teacherQuizTimerRef.current) clearInterval(teacherQuizTimerRef.current);
      }
      return () => {
          if (teacherQuizTimerRef.current) clearInterval(teacherQuizTimerRef.current);
      };
  }, [isTeacherClassQuizActive, currentQuizStatus, currentQuizIdx]);

  useEffect(() => {
      if (isTeacherClassQuizActive && currentQuizStatus === 'playing') {
          // 전원 제출 시 기다리지 않고 즉시 자동 채점 트리거!
          if (classTotalStudents > 0 && classSubmittedCount >= classTotalStudents) {
              if (teacherQuizTimerRef.current) clearInterval(teacherQuizTimerRef.current);
              handleEndLiveQuiz(); 
          }
      }
  }, [isTeacherClassQuizActive, currentQuizStatus, classSubmittedCount, classTotalStudents]);
  // 🚀 [Step 3-2] 선생님 관제탑 (Dashboard & Result) 렌더링 블록
  // 🚀 [Phase 2] 선생님 관제탑 (Playlist 지원)
  const renderTeacherLiveQuizDashboard = (currentClass: any, activeQuiz: any) => {
      const history = activeQuiz.history || [];
      
      // 🚀 [버그 수정 1] 문제별 정답자 수가 아닌 '학생별 총점'으로 계산 로직 변경
      const studentScores: Record<string, number> = {};
      // 미제출자도 정확한 0점 처리를 위해 모든 학생의 점수를 0으로 초기화
      currentClass.students?.forEach((s: any) => studentScores[s.uid] = 0);
      
      history.forEach((answers: any) => {
          Object.entries(answers).forEach(([uid, a]: [string, any]) => {
              if (studentScores[uid] !== undefined && a.isCorrect) {
                  studentScores[uid]++;
              }
          });
      });

      const scores = Object.values(studentScores);
      const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
      const minScore = scores.length > 0 ? Math.min(...scores) : 0;
      const avgScore = scores.length > 0 ? (scores.reduce((a:number, b:number) => a + b, 0) / scores.length).toFixed(1) : 0;

      // 1. [최종 결과 리포트 화면] (Top 3 삭제 및 진단 기능 추가)
      if (activeQuiz.status === 'report') {
          return (
              <div className="bg-gray-800 rounded-2xl p-6 md:p-10 shadow-2xl border-4 border-purple-500 animate-in zoom-in max-w-3xl mx-auto mt-6 text-center">
                  <h3 className="text-3xl font-black text-purple-400 mb-6 flex items-center justify-center gap-3"><span className="text-4xl">📊</span> 종합 결과 리포트</h3>
                  
                  <div className="flex justify-between gap-3 mb-8">
                      <div className="flex-1 bg-gray-750 p-4 rounded-xl border border-gray-600 shadow-inner">
                          <p className="text-gray-400 font-bold text-sm mb-1">최고 득점</p>
                          <p className="text-2xl md:text-3xl font-black text-green-400">{maxScore}점</p>
                      </div>
                      <div className="flex-1 bg-gray-750 p-4 rounded-xl border border-gray-600 shadow-inner">
                          <p className="text-gray-400 font-bold text-sm mb-1">우리반 평균</p>
                          <p className="text-2xl md:text-3xl font-black text-yellow-400">{avgScore}점</p>
                      </div>
                      <div className="flex-1 bg-gray-750 p-4 rounded-xl border border-gray-600 shadow-inner">
                          <p className="text-gray-400 font-bold text-sm mb-1">최저 득점</p>
                          <p className="text-2xl md:text-3xl font-black text-red-400">{minScore}점</p>
                      </div>
                  </div>

                  <button onClick={handleGenerateRemedialHomework} disabled={isGeneratingRemedial} className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-black rounded-xl shadow-[0_0_15px_rgba(236,72,153,0.4)] text-lg mb-4 flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50">
                      {isGeneratingRemedial ? 'AI가 진단 차트와 숙제를 생성하는 중... 🤖' : '🚀 맞춤형 오답 숙제 일괄 전송 (원본+응용)'}
                  </button>

                  <button onClick={handleClearLiveQuiz} className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold rounded-xl transition text-sm">
                      ⏹️ 리포트 닫기 (대기실 복귀)
                  </button>
              </div>
          );
      }

      const currentQ = activeQuiz.playlist[activeQuiz.currentQuestionIndex];
      const isLastQuestion = activeQuiz.currentQuestionIndex === activeQuiz.playlist.length - 1;
      const totalStudents = currentClass.students?.length || 0;
      const submittedCount = Object.keys(activeQuiz.answers || {}).length;
      const progress = totalStudents > 0 ? (submittedCount / totalStudents) * 100 : 0;

      // 2. [실시간 퀴즈 진행 화면]
      if (activeQuiz.status === 'playing') {
          return (
              <div className="bg-gray-800 rounded-2xl p-6 md:p-10 shadow-2xl border-4 border-yellow-500 animate-in zoom-in max-w-2xl mx-auto text-center relative overflow-hidden mt-6">
                  <div className="absolute top-0 left-0 h-2 bg-yellow-400 transition-all duration-1000 ease-linear" style={{ width: `${(teacherQuizTimeLeft / 15) * 100}%` }} />
                  
                  <div className="flex justify-between items-center mb-6 mt-2 relative z-10">
                      <span className="bg-gray-700 text-yellow-400 px-4 py-1.5 rounded-full text-sm font-bold shadow-inner border border-gray-600">
                          진행 중: {activeQuiz.currentQuestionIndex + 1} / {activeQuiz.playlist.length}
                      </span>
                      <span className={`text-3xl font-black ${teacherQuizTimeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                          ⏱️ {teacherQuizTimeLeft}초
                      </span>
                  </div>

                  <h3 className="text-3xl font-black text-yellow-400 mb-8 flex items-center justify-center gap-3"><span className="text-4xl">📡</span> 라이브 퀴즈 관제탑</h3>
                  
                  <div className="bg-gray-750 p-6 rounded-xl border border-gray-600 mb-8 shadow-inner text-left">
                      <p className="text-yellow-400 text-sm font-bold mb-3 flex items-center gap-2"><span>🎯</span> 문제 출제 내용</p>
                      <p className="text-white font-serif text-2xl mb-4 italic leading-relaxed">&quot;{currentQ.blankSentence}&quot;</p>
                      <p className="text-gray-300 text-lg bg-gray-900/50 p-4 rounded-lg">💡 {currentQ.koreanHint}</p>
                  </div>

                  <div className="mb-8 bg-gray-900 p-6 rounded-xl border border-teal-500/30">
                      <div className="flex justify-between items-end mb-3">
                          <span className="text-gray-400 font-bold text-sm">실시간 제출 현황</span>
                          <span className="text-2xl font-black text-teal-400">{submittedCount} <span className="text-lg text-gray-500">/ {totalStudents}명</span></span>
                      </div>
                      <div className="w-full bg-gray-700 h-6 rounded-full overflow-hidden shadow-inner relative">
                          <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-teal-400 to-blue-500 transition-all duration-500 ease-out" style={{ width: `${progress}%` }}></div>
                          {progress === 100 && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                  <span className="text-white text-xs font-bold drop-shadow-md animate-pulse">전원 제출 완료! 자동 채점 중...</span>
                              </div>
                          )}
                      </div>
                  </div>

                  <button onClick={handleEndLiveQuiz} className="w-full py-4 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white font-bold rounded-xl shadow-sm transition active:scale-95 text-lg">
                      ⏭️ 시간 종료 전 강제로 스킵하기
                  </button>
              </div>
          );
      }

      const passedStudents = currentClass.students.filter((s:any) => activeQuiz.answers?.[s.uid]?.isCorrect);
      const failedStudents = currentClass.students.filter((s:any) => !activeQuiz.answers?.[s.uid]?.isCorrect);

      // 3. [개별 문제 정답 확인 리포트 화면]
      return (
          <div className="bg-gray-800 rounded-2xl p-6 md:p-10 shadow-2xl border-4 border-teal-500 animate-in zoom-in max-w-3xl mx-auto mt-6">
              <h3 className="text-3xl font-black text-teal-400 mb-2 flex items-center justify-center gap-3 text-center"><span className="text-4xl">📊</span> 퀴즈 결과 리포트</h3>
              <div className="text-center mb-6"><span className="bg-gray-700 px-4 py-1 rounded-full text-teal-400 font-bold shadow-inner border border-gray-600">결과: {activeQuiz.currentQuestionIndex + 1} / {activeQuiz.playlist.length}</span></div>
              
              <div className="flex flex-col md:flex-row gap-6 mb-8">
                  <div className="flex-1 bg-gray-750 p-6 rounded-xl border border-green-500/30 shadow-inner">
                      <h4 className="text-green-400 font-bold text-lg mb-4 border-b border-gray-600 pb-2 flex items-center justify-between">
                          <span>✅ 통과자 (정답)</span>
                          <span className="text-2xl font-black">{passedStudents.length}명</span>
                      </h4>
                      <div className="flex flex-wrap gap-2">
                          {passedStudents.length > 0 ? passedStudents.map((s:any) => (
                              <span key={s.uid} className="bg-green-900/40 text-green-300 px-3 py-1.5 rounded-lg text-sm font-bold border border-green-700/50">{s.realName}</span>
                          )) : <span className="text-gray-500 text-sm italic">없음</span>}
                      </div>
                  </div>

                  <div className="flex-1 bg-gray-750 p-6 rounded-xl border border-red-500/30 shadow-inner">
                      <h4 className="text-red-400 font-bold text-lg mb-4 border-b border-gray-600 pb-2 flex items-center justify-between">
                          <span>💪 재도전 (오답/미제출)</span>
                          <span className="text-2xl font-black">{failedStudents.length}명</span>
                      </h4>
                      <div className="flex flex-wrap gap-2">
                          {failedStudents.length > 0 ? failedStudents.map((s:any) => (
                              <span key={s.uid} className="bg-red-900/40 text-red-300 px-3 py-1.5 rounded-lg text-sm font-bold border border-red-700/50">{s.realName}</span>
                          )) : <span className="text-gray-500 text-sm italic">없음</span>}
                      </div>
                  </div>
              </div>

              <div className="bg-gray-900 p-5 rounded-xl border border-gray-700 mb-8">
                  <p className="text-gray-400 text-xs font-bold mb-2 uppercase tracking-wider">정답 정보</p>
                  <p className="text-white text-lg">정답: <span className="text-yellow-400 font-bold bg-yellow-900/30 px-2 py-1 rounded">{currentQ.options[currentQ.correctAnswerIndex]}</span></p>
              </div>

              {isLastQuestion ? (
                  <button onClick={handleShowFinalReport} className="w-full py-4 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-xl shadow-md transition active:scale-95 text-lg tracking-wider">📊 최종 결과 리포트 보기</button>
              ) : (
                  <button onClick={handleNextLiveQuiz} className="w-full py-5 bg-gradient-to-r from-blue-500 to-teal-500 hover:from-blue-400 hover:to-teal-400 text-white font-black rounded-xl shadow-lg transition active:scale-95 text-xl tracking-wider">▶️ 다음 문제로 넘어가기</button>
              )}
          </div>
      );
  };
  
  // 🚀 [Phase 2] 학생용 라이브 퀴즈 렌더링 UI (Playlist)
  const renderStudentLiveQuiz = () => {
    if (!studentActiveQuizData || !activeClassWithQuiz || !currentStudentQuestion) return null;

    if (studentActiveQuizData.status === 'playing') {
        if (hasStudentSubmitted) {
            return (
                <div className="bg-gray-800 rounded-2xl p-8 text-center shadow-2xl border-2 border-teal-500 animate-in zoom-in w-full mt-10">
                    <p className="text-6xl animate-bounce mb-4">⏳</p>
                    <h3 className="text-2xl font-bold text-teal-400 mb-2">제출 완료!</h3>
                    <p className="text-gray-300">다른 친구들이 다 풀 때까지<br/>잠시만 기다려 주세요.</p>
                </div>
            );
        }

        return (
            <div className="bg-gray-800 rounded-2xl p-6 md:p-8 shadow-2xl border-4 border-yellow-500 animate-in zoom-in w-full mt-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 h-2 bg-yellow-400 transition-all duration-1000 ease-linear" style={{ width: `${(liveQuizTimeLeft / 15) * 100}%` }} />
                <div className="flex justify-between items-center mb-6 mt-2">
                    <span className="bg-gray-700 text-yellow-400 px-3 py-1 rounded-full text-sm font-bold shadow-inner border border-gray-600">문제 {studentActiveQuizData.currentQuestionIndex + 1}</span>
                    <span className={`text-2xl font-black ${liveQuizTimeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>⏱️ {liveQuizTimeLeft}초</span>
                </div>

                <div className="bg-gray-750 p-5 rounded-xl border border-gray-600 mb-6 shadow-inner">
                    {/* 🚀 [Phase 4] 학생 화면 힌트 가독성 극대화 (크기 더 업, 녹색 톤 강조) */}
                    <p className="text-green-400 text-lg md:text-xl mb-4 font-bold tracking-wide drop-shadow-sm leading-tight">💡 {currentStudentQuestion.koreanHint}</p>
                    <p className="text-white text-xl md:text-2xl font-serif italic leading-relaxed">&quot;{currentStudentQuestion.blankSentence}&quot;</p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                    {currentStudentQuestion.options.map((opt: string, idx: number) => (
                        <button key={idx} onClick={() => submitStudentAnswer(idx, activeClassWithQuiz.id, currentStudentQuestion.correctAnswerIndex)} className="w-full py-4 px-6 bg-gray-700 hover:bg-teal-600 border border-gray-600 hover:border-teal-400 rounded-xl text-white font-bold text-lg transition-all active:scale-95 text-left shadow-md flex items-center gap-3 group">
                            <span className="w-8 h-8 rounded-full bg-gray-800 group-hover:bg-teal-500 flex items-center justify-center text-sm border border-gray-500 group-hover:border-teal-300 transition-colors shrink-0">{idx + 1}</span>
                            <span className="leading-tight">{opt}</span>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (studentActiveQuizData.status === 'finished') {
        const isCorrect = hasStudentSubmitted?.isCorrect;
        return (
            <div className={`bg-gray-800 rounded-2xl p-8 text-center shadow-2xl border-4 animate-in zoom-in w-full mt-10 ${isCorrect ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)]' : 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]'}`}>
                <p className="text-6xl mb-4 animate-bounce">{isCorrect ? '🎉' : '💪'}</p>
                <h3 className={`text-2xl font-black mb-2 ${isCorrect ? 'text-green-400' : 'text-red-500'}`}>
                    {isCorrect ? '정답입니다!' : '아쉽네요, 오답입니다!'}
                </h3>
                <p className="text-gray-300 mb-6 text-lg">
                    정답: <span className="text-yellow-400 font-bold bg-yellow-900/30 px-2 py-1 rounded">{currentStudentQuestion.options[currentStudentQuestion.correctAnswerIndex]}</span>
                </p>
                <p className="text-sm text-gray-500 bg-gray-900/50 py-2 rounded-lg">선생님이 다음 퀴즈를 준비 중입니다...</p>
            </div>
        );
    }
    
    // 🚀 [Phase 4] 학생 리포트 화면 (내 성적과 반 평균)
    if (studentActiveQuizData.status === 'report') {
        const history = studentActiveQuizData.history || [];
        let myScore = 0;
        let totalScoreSum = 0;
        let studentCount = 0;
        const allStudentScores: {[uid:string]: number} = {};

        history.forEach((answers: any) => {
            Object.keys(answers).forEach(uid => {
                if (!allStudentScores[uid]) allStudentScores[uid] = 0;
                if (answers[uid].isCorrect) allStudentScores[uid]++;
            });
        });

        if (userId && allStudentScores[userId]) myScore = allStudentScores[userId];
        const scores = Object.values(allStudentScores);
        if (scores.length > 0) {
            totalScoreSum = scores.reduce((a:number, b:number) => a + b, 0);
            studentCount = scores.length;
        }
        const classAvg = studentCount > 0 ? (totalScoreSum / studentCount).toFixed(1) : '0';

        return (
            <div className="bg-gray-800 rounded-2xl p-8 text-center shadow-2xl border-4 border-purple-500 animate-in zoom-in w-full mt-10">
                <p className="text-6xl mb-4 animate-bounce">🏆</p>
                <h3 className="text-3xl font-black text-white mb-6">퀴즈 대장정 완료!</h3>
                
                <div className="flex justify-center gap-4 mb-8">
                    <div className="bg-gray-750 p-5 rounded-xl border border-purple-500/50 shadow-inner flex-1">
                        <p className="text-gray-400 font-bold text-sm mb-1">내 성적</p>
                        <p className="text-3xl md:text-4xl font-black text-purple-400">{myScore}점</p>
                    </div>
                    <div className="bg-gray-750 p-5 rounded-xl border border-gray-600 shadow-inner flex-1">
                        <p className="text-gray-400 font-bold text-sm mb-1">우리 반 평균</p>
                        <p className="text-3xl md:text-4xl font-black text-yellow-400">{classAvg}점</p>
                    </div>
                </div>

                <button disabled className="w-full py-4 bg-gray-700 text-gray-300 font-bold rounded-xl shadow-inner transition text-sm md:text-base animate-pulse">
                    선생님이 리포트를 닫을 때까지 대기 중...<br/>(종료 후 오답 노트를 확인할 수 있어요)
                </button>
            </div>
        );
    }
    return null;
  };
  const handleCreateClass = async () => {
      if (!newClassName.trim() || !userId) return;
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      try {
          await addDoc(collection(db, 'Classes'), {
              className: newClassName.trim(),
              inviteCode: code,
              teacherId: userId,
              createdAt: serverTimestamp(),
              students: [] 
          });
          setIsCreateClassModalOpen(false);
          setNewClassName('');
      } catch(e) { alert('클래스 생성에 실패했습니다.'); }
  };

  const handleJoinClass = async () => {
      if (!classCodeInput.trim() || !realNameInput.trim() || !userId) return;
      try {
          const q = query(collection(db, 'Classes'), where('inviteCode', '==', classCodeInput.trim()));
          const snap = await getDocs(q);
          if (snap.empty) { alert('유효하지 않은 초대 코드입니다. 다시 확인해 주세요.'); return; }
          const classDoc = snap.docs[0];
          const classData = classDoc.data();

          if (classData.students && classData.students.some((s:any) => s.uid === userId)) {
              alert('이미 가입된 클래스입니다.');
              return;
          }

          await updateDoc(doc(db, 'Classes', classDoc.id), {
              students: arrayUnion({ uid: userId, realName: realNameInput.trim() })
          });
          await updateDoc(doc(db, 'Users', userId), {
              linkedClasses: arrayUnion(classDoc.id)
          });

          alert('클래스에 성공적으로 가입되었습니다! 🎉');
          setIsClassLinkModalOpen(false);
          setClassCodeInput('');
          setRealNameInput('');
      } catch(e) { alert('클래스 가입 중 오류가 발생했습니다.'); }
  };

  const handleUpdateClassStudentName = async (classId: string, studentUid: string, oldName: string, newName: string) => {
      if(!newName.trim() || oldName === newName) {
          setEditingClassStudent(null);
          return;
      }
      try {
          const classRef = doc(db, 'Classes', classId);
          const snap = await getDoc(classRef);
          if(snap.exists()){
              const data = snap.data();
              const updatedStudents = data.students.map((s:any) => s.uid === studentUid ? { ...s, realName: newName.trim() } : s);
              await updateDoc(classRef, { students: updatedStudents });
          }
          setEditingClassStudent(null);
      } catch(e) { alert('이름 변경에 실패했습니다.'); }
  };

  const handleKickStudent = async (classId: string, studentUid: string, studentName: string) => {
      if(!confirm(`${studentName} 학생을 클래스에서 내보내시겠습니까?`)) return;
      try {
          const classRef = doc(db, 'Classes', classId);
          const snap = await getDoc(classRef);
          if(snap.exists()){
              const data = snap.data();
              const studentToRemove = data.students.find((s:any) => s.uid === studentUid);
              if(studentToRemove) {
                  await updateDoc(classRef, { students: arrayRemove(studentToRemove) });
                  await updateDoc(doc(db, 'Users', studentUid), { linkedClasses: arrayRemove(classId) });
              }
          }
      } catch(e) { alert('강퇴 처리 중 오류가 발생했습니다.'); }
  };

  const handleAssignSentences = async () => {
      const currentClass = teacherClasses.find(c => c.id === selectedClassId);
      if (!currentClass || !currentClass.students || currentClass.students.length === 0) {
          alert("대기실에 등록된 학생이 없습니다."); return;
      }

      const targetStudents = selectedForTransferStudents.length > 0 
          ? currentClass.students.filter((s: any) => selectedForTransferStudents.includes(s.uid))
          : currentClass.students;

      if (targetStudents.length === 0) {
          alert("전송할 대상 학생이 없습니다."); return;
      }

      const sentencesToTransfer = selectedForTransfer.length > 0 
          ? librarySentences.filter(s => selectedForTransfer.includes(s.id))
          : librarySentences;

      if (sentencesToTransfer.length === 0) {
          alert("전송할 문장이 없습니다. 먼저 문장을 추가해 주세요."); return;
      }
      
      if (!confirm(`총 ${sentencesToTransfer.length}개의 문장을 ${targetStudents.length}명의 학생에게 전송하시겠습니까?`)) return;

      setIsLoadingLibrary(true);
      try {
          let currentBatch = writeBatch(db);
          let count = 0;
          const chunks = [];

          for (const student of targetStudents) {
              const sq = query(collection(db, 'Sentences'), where('ownerId', '==', student.uid), where('sourceClass', '==', selectedClassId));
              const snap = await getDocs(sq);
              const existingTexts = snap.docs.map(d => d.data().originalText);

              for (const sentence of sentencesToTransfer) {
                  if (!existingTexts.includes(sentence.originalText)) {
                      const newDocRef = doc(collection(db, 'Sentences'));
                      currentBatch.set(newDocRef, {
                          originalText: sentence.originalText,
                          userContext: sentence.userContext || '',
                          languageCode: sentence.languageCode || 'en',
                          ownerId: student.uid, 
                          createdBy: userId, 
                          sourceClass: selectedClassId, 
                          sourceClassName: currentClass.className,
                          createdAt: serverTimestamp(),
                          lastLearnedAt: serverTimestamp(),
                          cooldownUntil: serverTimestamp(),
                          isMastered: false,
                          recallCount: 0,
                          inputType: sentence.inputType || 'keyboard'
                      });
                      count++;
                      if (count === 490) {
                          chunks.push(currentBatch.commit());
                          currentBatch = writeBatch(db);
                          count = 0;
                      }
                  }
              }
          }
          if (count > 0) chunks.push(currentBatch.commit());
          await Promise.all(chunks);

          let updateBatch = writeBatch(db);
          let updateCount = 0;
          const updateChunks = [];
          for (const sentence of sentencesToTransfer) {
              if (!sentence.isAssigned) {
                  updateBatch.update(doc(db, 'Sentences', sentence.id), { isAssigned: true });
                  updateCount++;
                  if (updateCount === 490) {
                      updateChunks.push(updateBatch.commit());
                      updateBatch = writeBatch(db);
                      updateCount = 0;
                  }
              }
          }
          if (updateCount > 0) updateChunks.push(updateBatch.commit());
          await Promise.all(updateChunks);

          alert(`선택한 ${targetStudents.length}명의 학생에게 숙제 전송이 완료되었습니다! 🎉`);
          setSelectedForTransfer([]); 
          setSelectedForTransferStudents([]); 
          fetchLibrarySentences(); 
      } catch (e) {
          console.error(e);
          alert("전송 중 오류가 발생했습니다.");
      }
      setIsLoadingLibrary(false);
  };

  const playCloudAudio = async (text: string, lang: string): Promise<void> => {
      return new Promise(async (resolve) => {
          try {
              const cacheId = btoa(encodeURIComponent(text + '_' + lang)).replace(/[/+=]/g, '').substring(0, 100);
              const cacheRef = doc(db, 'AudioCache', cacheId);
              let audioBase64 = '';

              const docSnap = await getDoc(cacheRef);
              
              if (docSnap.exists() && docSnap.data().audioBase64) {
                  audioBase64 = docSnap.data().audioBase64;
              } else {
                  const res = await fetch('/api/tts', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ text, lang })
                  });
                  if (!res.ok) throw new Error('TTS API Server Error');
                  const data = await res.json();
                  audioBase64 = data.audioContent;
                  await setDoc(cacheRef, { audioBase64, text, lang, createdAt: serverTimestamp() });
              }

              const audio = new Audio("data:audio/mp3;base64," + audioBase64);
              currentAudioRef.current = audio;

              audio.onended = () => { currentAudioRef.current = null; resolve(); };
              audio.onerror = (e) => { console.error("Audio playback error:", e); currentAudioRef.current = null; resolve(); };
              
              await audio.play();
          } catch (error) {
              console.error("Audio cache/play failed:", error);
              resolve(); 
          }
      });
  };

  const stopAudio = () => {
      if (currentAudioRef.current) {
          currentAudioRef.current.pause();
          currentAudioRef.current.currentTime = 0;
          currentAudioRef.current = null;
      }
  };

  useEffect(() => {
    if (!targetUserId) return;
    const sessionRef = doc(db, 'LiveQuizSessions', targetUserId);
    const unsubscribe = onSnapshot(sessionRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setLiveSession(data);
        
        if (userData?.role !== 'parent') {
          if (data.status === 'passed') {
              setCoMapVideoStatus('passed');
              setTimeout(() => setCoMapVideoStatus(null), 3500); 
          } else if (data.status === 'retry') {
              setCoMapVideoStatus('retry');
              setTimeout(() => setCoMapVideoStatus(null), 3500);
          }
          
          if (data.status === 'requested' && prevSessionStatusRef.current === 'selecting') {
              setUserAnswer('');
          }
        }
        prevSessionStatusRef.current = data.status;
      } else {
        setLiveSession(null);
      }
    });
    return () => unsubscribe();
  }, [targetUserId, userData?.role]);

  useEffect(() => {
      if (userData?.role !== 'parent' && liveSession && liveSession.status !== 'idle') {
          if (activeTab !== 'review') setActiveTab('review');
      }
  }, [liveSession?.status, userData?.role, activeTab]);

  useEffect(() => {
      if (userData?.role === 'parent' && liveSession && liveSession.status !== 'idle') {
          setIsCoMappingMode(true);
          if (activeTab !== 'library') setActiveTab('library');
      }
  }, [liveSession?.status, userData?.role, activeTab]);

  const handleToggleCoMappingMode = async () => {
      if (!isCoMappingMode) {
          await setDoc(doc(db, 'LiveQuizSessions', targetUserId!), {
              status: 'selecting',
              parentScore: 0,
              studentScore: 0,
              updatedAt: serverTimestamp()
          });
          setIsCoMappingMode(true);
          setActiveTab('library'); 
      } else {
          await setDoc(doc(db, 'LiveQuizSessions', targetUserId!), { status: 'idle' });
          setIsCoMappingMode(false);
      }
  };

  const handleStartCoMapQuiz = async (sentence: any) => {
      setIsLoadingLibrary(true);
      try {
          const hint = await generateRecallTrigger(sentence.originalText, sentence.userContext || '', selectedLanguage);
          await updateDoc(doc(db, 'LiveQuizSessions', targetUserId!), {
              status: 'requested', 
              sentenceId: sentence.id,
              originalText: sentence.originalText,
              userContext: sentence.userContext || '',
              koreanHint: hint,
              studentAnswer: '',
              aiResult: null,
              updatedAt: serverTimestamp()
          });
          setIsCoMappingMode(false); 
      } catch(e) { alert('퀴즈 준비 중 오류가 발생했습니다.'); }
      setIsLoadingLibrary(false);
  };

  const resetLiveSession = async () => {
      await setDoc(doc(db, 'LiveQuizSessions', targetUserId!), { status: 'idle' });
      setIsCoMappingMode(false);
  };

  const acceptCoMap = async () => {
      setShowCoMapAlert(false);
      await updateDoc(doc(db, 'LiveQuizSessions', userId!), { status: 'accepted', updatedAt: serverTimestamp() });
      setUserAnswer(''); 
      setActiveTab('review'); 
  };

  const rejectCoMap = async () => {
      setShowCoMapAlert(false);
      await updateDoc(doc(db, 'LiveQuizSessions', userId!), { status: 'idle', updatedAt: serverTimestamp() });
  };

  const handleEmergencyExit = async () => {
      if (!userId) return;
      if (confirm("퀴즈 화면에 갇히셨나요? 강제로 퀴즈를 종료하고 대기 화면으로 돌아갑니다.")) {
          await setDoc(doc(db, 'LiveQuizSessions', userId), { status: 'idle' });
          setActiveTab('review');
      }
  };

  // 🚀 버그 수정: AI 평가 시 무한 로딩 방지를 위한 예외 처리(try...catch) 적용
  const submitCoMapAnswer = async () => {
      if (!userAnswer.trim() || !liveSession || !userId) return;
      
      // 1. 평가 중(evaluating) 상태로 진입하여 애니메이션 표시
      await updateDoc(doc(db, 'LiveQuizSessions', userId), { status: 'evaluating', studentAnswer: userAnswer });
      
      try {
          // 2. AI 평가 진행 (네트워크 통신)
          const original = reviewSentence?.originalText || liveSession.originalText;
          const context = reviewSentence?.userContext || liveSession.userContext || '';
          
          const result = await evaluateAnswer(original, userAnswer, context, selectedLanguage, currentStudentName);
          
          // 3. 정상 평가 완료 시 상태 업데이트
          await updateDoc(doc(db, 'LiveQuizSessions', userId), { status: 'evaluated', aiResult: result });
      } catch (error) {
          console.error("AI Evaluation Error:", error);
          // 4. 네트워크 에러/타임아웃 발생 시 무한 로딩 해제를 위한 에러 상태 강제 업데이트
          await updateDoc(doc(db, 'LiveQuizSessions', userId), { 
              status: 'evaluated', 
              aiResult: { 
                  quickPraise: '⚠️ 서버 에러 발생', 
                  feedback: '서버 응답이 지연되거나 AI 평가 중 오류가 발생했습니다.\n잠시 후 다시 시도 버튼을 눌러주세요.',
                  isPass: false,
                  similarSentences: []
              } 
          });
      }
  };

  // 🚀 버그 수정: AI 재평가 시에도 동일한 방어 로직 적용
  const handleReEvaluateAi = async () => {
      if (!liveSession || !targetUserId) return;
      await updateDoc(doc(db, 'LiveQuizSessions', targetUserId), { status: 'evaluating' });
      
      try {
          const result = await evaluateAnswer(liveSession.originalText, liveSession.studentAnswer, '', selectedLanguage, currentStudentName);
          await updateDoc(doc(db, 'LiveQuizSessions', targetUserId), { status: 'evaluated', aiResult: result });
      } catch (error) {
          console.error("AI Re-Evaluation Error:", error);
          await updateDoc(doc(db, 'LiveQuizSessions', targetUserId), { 
              status: 'evaluated', 
              aiResult: { 
                  quickPraise: '⚠️ 서버 에러 발생', 
                  feedback: '서버 응답이 지연되거나 AI 평가 중 오류가 발생했습니다.\n잠시 후 다시 시도 버튼을 눌러주세요.',
                  isPass: false,
                  similarSentences: []
              } 
          });
      }
  };

  const handleResetToSelecting = async () => {
      if (!targetUserId) return;
      await updateDoc(doc(db, 'LiveQuizSessions', targetUserId), { status: 'selecting' });
      setIsCoMappingMode(true);
      setActiveTab('library'); 
  };

  const handleRetryHint = async () => {
      if (!liveSession || !targetUserId) return;
      await updateDoc(doc(db, 'LiveQuizSessions', targetUserId), { koreanHint: '재시도 중입니다... ⏳' });
      try {
          const newHint = await generateRecallTrigger(liveSession.originalText, liveSession.userContext || '', selectedLanguage);
          await updateDoc(doc(db, 'LiveQuizSessions', targetUserId), { koreanHint: newHint });
      } catch (e) {
          await updateDoc(doc(db, 'LiveQuizSessions', targetUserId), { koreanHint: '⚠️ AI 힌트 생성 실패' });
      }
  };

  const handleCoMapVerdict = async (verdict: 'passed' | 'retry') => {
      const sessionRef = doc(db, 'LiveQuizSessions', targetUserId!);
      const sentenceRef = doc(db, 'Sentences', liveSession.sentenceId);
      
      const isPass = verdict === 'passed';

      await updateDoc(sessionRef, { 
          status: verdict,
          studentScore: isPass ? increment(1) : liveSession.studentScore,
          parentScore: !isPass ? increment(1) : liveSession.parentScore
      });
      
      if (isPass) {
          await updateDoc(sentenceRef, { 
              recallCount: increment(1), 
              needsRetry: false,
              cooldownUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
          });
      } else {
          await updateDoc(sentenceRef, { needsRetry: true }); 
      }

      setTimeout(() => {
          updateDoc(sessionRef, { status: 'selecting' });
          setIsCoMappingMode(true); 
          setActiveTab('library'); 
      }, 3500); 
  };

  const renderScoreBoard = () => {
      if (!liveSession) return null;

      return (
          <div className="flex flex-col items-center bg-gray-900 rounded-2xl p-4 border border-gray-600 shadow-lg mb-6 w-full max-w-sm mx-auto animate-in zoom-in">
              <span className="text-white font-black text-lg mb-3 tracking-widest drop-shadow-md">🏆 실시간 스코어</span>
              <div className="flex w-full items-center justify-between px-2 md:px-6">
                  <div className="flex flex-col items-center w-[110px]">
                      <span className="text-gray-400 text-xs md:text-sm font-bold mb-2 pb-1 border-b border-gray-600 w-full text-center whitespace-nowrap">⚾ 투수 (부모님)</span>
                      <span className="text-3xl font-black text-white drop-shadow">{liveSession.parentScore || 0}</span>
                  </div>
                  <div className="flex flex-col text-2xl font-black text-gray-500 pb-2 space-y-1 mx-2">
                      <div className="w-1.5 h-1.5 bg-gray-500 rounded-full"></div>
                      <div className="w-1.5 h-1.5 bg-gray-500 rounded-full"></div>
                  </div>
                  <div className="flex flex-col items-center w-[110px]">
                      <span className="text-gray-400 text-xs md:text-sm font-bold mb-2 pb-1 border-b border-gray-600 w-full text-center whitespace-nowrap">🏏 타자 ({currentStudentName})</span>
                      <span className="text-3xl font-black text-yellow-400 drop-shadow">{liveSession.studentScore || 0}</span>
                  </div>
              </div>
          </div>
      );
  };

  useEffect(() => {
    if (userData?.role === 'parent' && userData.linkedStudents && userData.linkedStudents.length > 0) {
      const q = query(collection(db, 'Users'), where('uid', 'in', userData.linkedStudents.slice(0, 10)));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const profiles = snapshot.docs.map(doc => doc.data());
        setStudentProfiles(profiles);
        
        setSelectedStudentId(prevId => {
             if (prevId && profiles.some(p => p.uid === prevId)) return prevId;
            const savedId = localStorage.getItem('mappeat_selected_student');
            if (savedId && profiles.some(p => p.uid === savedId)) return savedId;
            if (profiles.length > 0) {
                localStorage.setItem('mappeat_selected_student', profiles[0].uid);
                return profiles[0].uid;
            }
            return null;
        });
      });
      return () => unsubscribe();
    } else {
      setStudentProfiles([]);
      setSelectedStudentId(null);
    }
  }, [userData?.role, userData?.linkedStudents]);

  useEffect(() => {
    if (userData?.role === 'parent' && activeTab === 'review') {
       setActiveTab('add');
    }
  }, [userData?.role, activeTab]);

  useEffect(() => {
    const handleScroll = () => {
        const isBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 100;
        setIsAtBottom(isBottom);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (activeTab === 'library') {
      fetchLibrarySentences();
      setSelectedForTransfer([]); 
      setSelectedForTransferStudents([]); 
    }
  }, [activeTab, targetUserId, userData?.role, selectedClassId]);

  useEffect(() => {
    if (!userId) return; 

    const sharedText = searchParams.get('text');
    const sharedTitle = searchParams.get('title');
    const sharedUrl = searchParams.get('url');
    
    if (sharedText || sharedUrl) {
        let cleanText = sharedText || '';
        let contextLines = [];
        if (sharedTitle) contextLines.push(`Source: ${sharedTitle}`);
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const foundUrls = cleanText.match(urlRegex);
        
        if (foundUrls) {
            cleanText = cleanText.replace(urlRegex, '').trim();
            foundUrls.forEach(url => {
                if (!contextLines.some(line => line.includes(url))) contextLines.push(`Link: ${url}`);
            });
        }
        if (sharedUrl && !contextLines.some(line => line.includes(sharedUrl))) contextLines.push(`Link: ${sharedUrl}`);

        cleanText = cleanText.replace(/^["']+|["']+$/g, '').trim();
        setOriginalText(cleanText);
     
        if (contextLines.length > 0) {
            setUserContext(contextLines.join('\n'));
            setShowContext(true);
        }
        setActiveTab('add');
        
        if (typeof window !== 'undefined') {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
  }, [searchParams, userId]); 

  const getTodayStr = () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getPastDaysStrings = (days: number) => {
      const dates = [];
      for (let i = 0; i < days; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }
      return dates;
  };

  const normalizeDate = (dateStr: string) => {
      if (!dateStr) return "";
      const parts = dateStr.trim().split('-');
      if (parts.length !== 3) return dateStr.trim();
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  };

  const updateUserLearningTime = async () => {
    if (userData?.role === 'parent' || userData?.role === 'teacher') return;
    if (startTimeRef.current && typeof userId === 'string') { 
      const endTime = Date.now();
      const durationInMillis = endTime - startTimeRef.current;
      if (durationInMillis > 1000) {
        const durationInMinutes = durationInMillis / (1000 * 60);
        const userDocRef = doc(db, "Users", userId);
        try {
          await setDoc(userDocRef, { totalLearningTimeInMinutes: increment(durationInMinutes) }, { merge: true });
        } catch (e) { console.error(e); }
      }
      startTimeRef.current = null;
    }
  };

  useEffect(() => {
    if (!targetUserId) return;
    const userDocRef = doc(db, "Users", targetUserId);
    const unsubscribe = onSnapshot(userDocRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const todayStr = getTodayStr().trim(); 
        const rawDbDate = data.lastStudyDate || "";
        const dbDate = normalizeDate(rawDbDate);
        
        if (userData?.role !== 'parent' && userData?.role !== 'teacher') {
          if (!rawDbDate) {
                await setDoc(userDocRef, { lastStudyDate: todayStr }, { merge: true });
            } else if (dbDate < todayStr) {
                await setDoc(userDocRef, { dailyRecallCount: 0, lastStudyDate: todayStr }, { merge: true });
            }
        }

        if (!rawDbDate || (dbDate < todayStr && userData?.role !== 'parent' && userData?.role !== 'teacher')) {
            setDashboardData({ 
                dailyRecallCount: 0, 
                totalLearningTimeInMinutes: Number(data.totalLearningTimeInMinutes || 0), 
                totalMappingCount: Number(data.totalMappingCount || 0)
            });
        } else if (dbDate < todayStr && (userData?.role === 'parent' || userData?.role === 'teacher')) {
            setDashboardData({ 
                dailyRecallCount: 0, 
                totalLearningTimeInMinutes: Number(data.totalLearningTimeInMinutes || 0), 
                totalMappingCount: Number(data.totalMappingCount || 0)
            });
        } else {
            setDashboardData({ 
                dailyRecallCount: Number(data.dailyRecallCount || 0), 
                totalLearningTimeInMinutes: Number(data.totalLearningTimeInMinutes || 0),
                totalMappingCount: Number(data.totalMappingCount || 0)
            });
        }
      } else {
        if (userData?.role !== 'parent' && userData?.role !== 'teacher') {
            const todayStr = getTodayStr();
            await setDoc(userDocRef, { 
                dailyRecallCount: 0, 
                lastStudyDate: todayStr, 
                totalLearningTimeInMinutes: 0, 
                totalMappingCount: 0,
                createdAt: serverTimestamp() 
            }, { merge: true });
        }
      }
    });
    return () => unsubscribe();
  }, [targetUserId, userData?.role]);

  useEffect(() => {
    if (!targetUserId) return;
    const q = query(collection(db, 'Sentences'), where('ownerId', '==', targetUserId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllSentences(list);
    });
    return () => unsubscribe();
  }, [targetUserId]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && activeTab === 'review') updateUserLearningTime();
      else if (document.visibilityState === 'visible' && activeTab === 'review') startTimeRef.current = Date.now();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (activeTab === 'review') updateUserLearningTime();
    };
  }, [activeTab]);

  useEffect(() => {
      const handleClickOutside = (e: MouseEvent | TouchEvent) => {
          if ((e.target as HTMLElement).closest('.tooltip-container')) return;
          setActiveExtendedItem(null);
      };
      if (activeExtendedItem) {
          document.addEventListener('mousedown', handleClickOutside);
          document.addEventListener('touchstart', handleClickOutside);
      }
      return () => {
          document.removeEventListener('mousedown', handleClickOutside);
          document.removeEventListener('touchstart', handleClickOutside);
      };
  }, [activeExtendedItem]);

  useEffect(() => {
    if (!targetUserId) return;
    const q = query(collection(db, 'StudyLogs'), where('ownerId', '==', targetUserId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const logs = snapshot.docs.map(doc => doc.data());
        setRawLogs(logs);
    });
    return () => unsubscribe();
  }, [targetUserId]);

  const processChartData = () => {
      const data = [];
      const today = new Date();
      if (chartTab === 'week') {
          for (let i = 6; i >= 0; i--) {
              const d = new Date();
              d.setDate(today.getDate() - i);
              const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              const log = rawLogs.find(l => l.dateStr === dStr) || {};
              const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
              data.push({
                  name: i === 0 ? '오늘' : dayNames[d.getDay()], 
                  fullDate: dStr,
                  count: (log.pass || 0) + (log.fail || 0), 
              });
          }
      } else {
          for (let w = 3; w >= 0; w--) {
              let c = 0;
              for (let d = 0; d < 7; d++) {
                  const dateObj = new Date();
                  dateObj.setDate(today.getDate() - (w * 7 + d));
                  const dStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
                  const log = rawLogs.find(l => l.dateStr === dStr) || {};
                  c += (log.pass || 0) + (log.fail || 0);
              }
              data.push({
                  name: w === 0 ? '이번 주' : `${w}주 전`,
                  count: c,
              });
          }
      }
      return data;
  };

  const chartData = processChartData();
  const hasChartData = chartData.some(d => d.count > 0);
  
  const totalSentenceCount = allSentences.length;
  const readyCount = allSentences.filter(s => !s.isMastered && (!s.cooldownUntil || s.cooldownUntil.toDate() <= new Date())).length;
  const masteredCount = allSentences.filter(s => s.isMastered).length;
  // 🚀 [Phase 6] 오답 노트 (재도전) 개수 카운팅
  const wrongCount = allSentences.filter(s => s.isQuizIncorrect).length;

  const weeklyStrs = getPastDaysStrings(7);
  const monthlyStrs = getPastDaysStrings(30);

  const weeklyMappingCount = rawLogs
      .filter(log => weeklyStrs.includes(log.dateStr))
      .reduce((sum, log) => sum + (log.pass || 0) + (log.fail || 0), 0);

  const monthlyMappingCount = rawLogs
      .filter(log => monthlyStrs.includes(log.dateStr))
      .reduce((sum, log) => sum + (log.pass || 0) + (log.fail || 0), 0);


  const startInstantDarkRoomPlayback = async () => {
      if (!userId) return;
      playbackSessionIdRef.current += 1;
      const currentSession = playbackSessionIdRef.current;
      stopAudio(); 

      setIsDarkRoomActive(true);
      isDarkRoomPlayingRef.current = true;
      setDarkRoomState({status: '재생 준비 중...', text: '오늘 학습한 문장을 불러옵니다.'});

      const safeDelay = async (ms: number) => {
          const steps = Math.ceil(ms / 100);
          for (let i = 0; i < steps; i++) {
              if (!isDarkRoomPlayingRef.current || currentSession !== playbackSessionIdRef.current) return false;
              await new Promise(r => setTimeout(r, 100));
          }
          return true;
      };

      try {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          
          const q = query(collection(db, 'Sentences'), where('ownerId', '==', targetUserId));
          const snapshot = await getDocs(q);
          let items: any[] = [];
          
          snapshot.docs.forEach(docSnap => {
              const data = docSnap.data();
              const learnedAt = data.lastLearnedAt?.toDate();
              if (learnedAt && learnedAt >= todayStart) {
                  items.push(data);
              }
          });

          if (items.length === 0) {
              setDarkRoomState({status: '학습 완료', text: '오늘 재생할 문장이 없습니다. 🌙'});
              setTimeout(() => setIsDarkRoomActive(false), 3000);
              return;
          }

          const shuffle = (arr: any[]) => arr.sort(() => Math.random() - 0.5);
          items = shuffle(items);

          for (let i = 0; i < items.length; i++) {
              if (!isDarkRoomPlayingRef.current || currentSession !== playbackSessionIdRef.current) break;
              const item = items[i];
              
              setDarkRoomState({status: `수면 복습 중 (${i+1}/${items.length})`, text: "AI 번역 중..."});
              let hintText = item.userContext || "해당 문장의 상황";
              try {
                  const aiGeneratedHint = await generateRecallTrigger(item.originalText, item.userContext || '', selectedLanguage);
                  if (!aiGeneratedHint.includes("⚠️") && !aiGeneratedHint.includes("실패")) {
                      hintText = aiGeneratedHint;
                  }
              } catch (e) { console.error("AI 힌트 생성 실패:", e); }

              if (!isDarkRoomPlayingRef.current || currentSession !== playbackSessionIdRef.current) break;
              
              setDarkRoomState({status: `수면 복습 중 (${i+1}/${items.length})`, text: hintText});
              await playCloudAudio(hintText, 'ko-KR');
              
              if (!await safeDelay(2500)) break;

              const cleanEnText = item.originalText.replace(/^[A-Za-z]+:\s*/, "").replace(/[\/+|~_\\-]/g, " ");
              for(let r = 0; r < 2; r++) { 
                  if (!isDarkRoomPlayingRef.current || currentSession !== playbackSessionIdRef.current) break;
                  setDarkRoomState({status: `수면 복습 중 (${i+1}/${items.length})`, text: item.originalText});
                  await playCloudAudio(cleanEnText, 'en-US');
                  if (r < 1) {
                      if (!await safeDelay(1200)) break;
                  }
              }
              if (i < items.length - 1) {
                  if (!await safeDelay(4000)) break;
              }
          }

          if (isDarkRoomPlayingRef.current && currentSession === playbackSessionIdRef.current) {
              setIsDarkRoomActive(false);
              isDarkRoomPlayingRef.current = false;
          }

      } catch (e) {
          console.error("Dark Room Error:", e);
          if (currentSession === playbackSessionIdRef.current) {
              setDarkRoomState({status: '오류 발생', text: '데이터를 불러오지 못했습니다.'});
              setTimeout(() => setIsDarkRoomActive(false), 2000);
          }
      }
  };

  const renderSummaryCard = () => {
      const isStudent = userData?.role !== 'parent' && userData?.role !== 'teacher';
      const isMappingActive = isStudent && dashboardData.dailyRecallCount > 0;
      
      return (
      <div className="flex flex-col bg-gray-800 rounded-xl border border-gray-600 shadow-lg p-4 md:p-6 w-full gap-4 h-[300px]">
          
          <div 
             onClick={() => { if(isMappingActive) startInstantDarkRoomPlayback(); }}
             className={`flex-1 flex flex-row justify-center items-center gap-3 rounded-xl shadow-inner transition-all duration-300 ${isMappingActive ? 'cursor-pointer border-2 border-teal-400 glow-blue bg-gray-700/80 hover:scale-[1.02]' : 'bg-gray-700/50 border border-gray-600'}`}
             title={isMappingActive ? "눌러서 오늘 학습한 전체 문장 수면 모드 시작" : ""}
          >
              <span className="text-teal-400 font-bold text-lg md:text-xl tracking-wider">오늘 매핑</span>
              <span className="text-4xl md:text-5xl font-black text-white tracking-tighter drop-shadow-lg">{dashboardData.dailyRecallCount}</span>
          </div>

          <div className="flex-[1.5] flex gap-2 md:gap-4">
              <div className="flex-1 bg-gray-900/50 border border-yellow-500/40 rounded-xl flex flex-col justify-center items-center gap-2 shadow-inner relative">
                  <span className="text-yellow-400 font-bold text-sm md:text-base tracking-wider whitespace-nowrap">주간 매핑</span>
                  <span className="text-xl md:text-2xl font-black text-yellow-400 drop-shadow-md">{weeklyMappingCount}</span>
              </div>
              <div className="flex-1 bg-gray-900/50 border border-blue-500/40 rounded-xl flex flex-col justify-center items-center gap-2 shadow-inner relative">
                  <span className="text-blue-400 font-bold text-sm md:text-base tracking-wider whitespace-nowrap">월간 매핑</span>
                  <span className="text-xl md:text-2xl font-black text-blue-400 drop-shadow-md">{monthlyMappingCount}</span>
              </div>
              <div className="flex-1 bg-gray-900/50 border border-gray-400/40 rounded-xl flex flex-col justify-center items-center gap-2 shadow-inner relative">
                  <span className="text-gray-300 font-bold text-sm md:text-base tracking-wider whitespace-nowrap">누적 매핑</span>
                  <span className="text-xl md:text-2xl font-black text-gray-300 drop-shadow-md">{dashboardData.totalMappingCount}</span>
              </div>
          </div>
      </div>
      );
  };

  const renderChartCard = () => (
      <div className="bg-gray-800 p-4 md:p-6 rounded-xl border border-gray-600 shadow-sm flex flex-col w-full h-[300px]">
          <div className="flex justify-between items-center mb-4">
              <h4 className="text-gray-300 font-bold text-sm md:text-base flex items-center gap-2">
                  <span className="text-xl">📈</span> 학습 흐름
              </h4>
              <div className="flex bg-gray-700 rounded-lg p-1 border border-gray-600">
                  <button onClick={() => setChartTab('week')} className={`px-3 py-1 text-xs md:text-sm font-bold rounded-md transition-all duration-300 ${chartTab === 'week' ? 'bg-teal-500 text-white shadow-md' : 'text-gray-400 hover:text-gray-200'}`}>1주</button>
                  <button onClick={() => setChartTab('month')} className={`px-3 py-1 text-xs md:text-sm font-bold rounded-md transition-all duration-300 ${chartTab === 'month' ? 'bg-teal-500 text-white shadow-md' : 'text-gray-400 hover:text-gray-200'}`}>1개월</button>
              </div>
          </div>
          <div className="flex-1 w-full relative">
              {!hasChartData ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-3xl mb-2 opacity-50">📭</span>
                      <span className="text-gray-500 text-sm font-bold">이 기간 동안의 학습 기록이 없습니다.</span>
                  </div>
            ) : (
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }} barSize={chartTab === 'week' ? 24 : 40}>
                          <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} dy={5} />
                          <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} dx={-5} />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                          <Bar dataKey="count" name="매핑" fill={chartTab === 'month' ? '#60a5fa' : '#facc15'} radius={[4, 4, 0, 0]} />
                      </BarChart>
                  </ResponsiveContainer>
              )}
          </div>
      </div>
  );

  const renderParentDashboard = () => (
      <div className="w-[95%] md:w-[85%] mx-auto flex flex-col gap-4 mb-6">
          {renderSummaryCard()}
          {renderChartCard()}
      </div>
  );

  const handleSwipeScroll = () => {
      if (!swipeContainerRef.current) return;
      const scrollLeft = swipeContainerRef.current.scrollLeft;
      const width = swipeContainerRef.current.clientWidth;
      const newIndex = Math.round(scrollLeft / width);
      if (activeSlide !== newIndex) setActiveSlide(newIndex);
  };

  const scrollToSlide = (index: number) => {
      if (!swipeContainerRef.current) return;
      const width = swipeContainerRef.current.clientWidth;
      swipeContainerRef.current.scrollTo({ left: width * index, behavior: 'smooth' });
  };

  const renderStudentDashboard = () => (
      <div className="w-full mb-6 relative">
          <div ref={swipeContainerRef} onScroll={handleSwipeScroll} className="flex w-full overflow-x-auto snap-x snap-mandatory no-scrollbar items-start">
              <div className="w-full flex-shrink-0 snap-center flex justify-center"><div className="w-[95%] md:w-[85%]">{renderSummaryCard()}</div></div>
              <div className="w-full flex-shrink-0 snap-center flex justify-center"><div className="w-[95%] md:w-[85%]">{renderChartCard()}</div></div>
              
              {/* 🚀 [권한 분리] 학생일 때만 나의 클래스 스와이프 표시 */}
              {userData?.role === 'student' && (
                  <div className="w-full flex-shrink-0 snap-center flex justify-center">
                      <div className="w-[95%] md:w-[85%] bg-gray-800 rounded-xl border border-gray-600 shadow-lg p-4 md:p-6 h-[300px] flex flex-col overflow-y-auto no-scrollbar relative">
                          <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
                              <h4 className="text-gray-300 font-bold text-sm md:text-base flex items-center gap-2">
                                  <span className="text-xl">🏫</span> 나의 클래스
                              </h4>
                              <button onClick={() => setIsClassLinkModalOpen(true)} className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs md:text-sm font-bold rounded-lg shadow-md transition-colors active:scale-95 flex items-center gap-1">
                                  <span>+</span> 클래스 연결
                              </button>
                          </div>
                          
                          {studentClassesData.length === 0 ? (
                              <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50 animate-in fade-in">
                                  <span className="text-4xl mb-3">📭</span>
                                  <span className="text-sm font-bold text-gray-400">등록된 클래스가 없습니다.</span>
                                  <span className="text-xs text-gray-500 mt-1">우측 상단의 버튼을 눌러 추가하세요.</span>
                              </div>
                          ) : (
                              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                                  {studentClassesData.map(c => {
                                      const isExpanded = expandedClassId === c.id;
                                      
                                      const classSentences = allSentences.filter(s => s.sourceClass === c.id);
                                      const total = classSentences.length;
                                      const completed = classSentences.filter(s => s.isMastered || (s.cooldownUntil && s.cooldownUntil.toDate() > new Date())).length;
                                      const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
                                      const isAllDone = total > 0 && completed === total;
                                      return (
                                          <div key={c.id} className={`border ${isExpanded ? 'border-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.2)]' : 'border-gray-600 hover:border-gray-500'} rounded-xl overflow-hidden transition-all duration-300`}>
                                              <div onClick={() => setExpandedClassId(isExpanded ? null : c.id)} className={`p-4 ${isExpanded ? 'bg-gray-700/80' : 'bg-gray-750'} flex justify-between items-center cursor-pointer active:bg-gray-700`}>
                                                  <span className="font-bold text-white text-base">{c.className}</span>
                                                  <span className="text-gray-400 text-xs transition-transform duration-300" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                                              </div>
                                              {isExpanded && (
                                                  <div className="p-4 bg-gray-900/50 flex flex-col gap-4 border-t border-gray-700 animate-in slide-in-from-top-1">
                                                      <div className="flex justify-between items-end">
                                                          <span className="text-xs font-bold text-gray-400">이번 주 매핑 현황</span>
                                                          <span className={`text-sm font-black ${isAllDone ? 'text-green-400' : 'text-teal-400'}`}>{completed} / {total} 완료</span>
                                                      </div>
                                                      <div className="w-full bg-gray-700 h-2.5 rounded-full overflow-hidden shadow-inner">
                                                          <div className={`h-full transition-all duration-1000 ease-out ${isAllDone ? 'bg-green-400' : 'bg-teal-400'}`} style={{ width: `${progressPercent}%` }}></div>
                                                      </div>
                                                      <button onClick={() => {
                                                          setReviewSourceFilter(c.id);
                                                          handleTabChange('review', c.id);
                                                      }} className={`w-full py-3 mt-1 text-white font-bold rounded-lg shadow-md hover:opacity-90 transition-all text-sm active:scale-95 ${isAllDone ? 'bg-gradient-to-r from-green-600 to-teal-600' : 'bg-gradient-to-r from-teal-600 to-blue-600'}`}>
                                                          {isAllDone ? '🎉 숙제 완료 (다시 복습하기)' : '🚀 해당 클래스 매핑하러 가기'}
                                                      </button>
                                                  </div>
                                              )}
                                          </div>
                                      )
                                  })}
                              </div>
                          )}
                      </div>
                  </div>
              )}

          </div>
          <div className="flex justify-center items-center gap-2 mt-4">
              <button onClick={() => scrollToSlide(0)} className={`h-2 rounded-full transition-all duration-300 ${activeSlide === 0 ? 'bg-teal-400 w-4' : 'bg-gray-600 w-2'}`} aria-label="요약 보기" />
              <button onClick={() => scrollToSlide(1)} className={`h-2 rounded-full transition-all duration-300 ${activeSlide === 1 ? 'bg-teal-400 w-4' : 'bg-gray-600 w-2'}`} aria-label="그래프 보기" />
              {/* 🚀 [권한 분리] 학생일 때만 3번째 인디케이터(점) 표시 */}
              {userData?.role === 'student' && (
                  <button onClick={() => scrollToSlide(2)} className={`h-2 rounded-full transition-all duration-300 ${activeSlide === 2 ? 'bg-teal-400 w-4' : 'bg-gray-600 w-2'}`} aria-label="나의 클래스 보기" />
              )}
          </div>
      </div>
  );

  const handleGenerateInviteCode = async () => {
    if (typeof userId !== 'string') return;
    const code = Math.floor(100000 + Math.random() * 900000).toString(); 
    try {
      await updateDoc(doc(db, 'Users', userId), { inviteCode: code });
      setIsParentInviteModalOpen(true);
    } catch (e) { alert("코드 발급에 실패했습니다."); }
  };

  const handleLinkWithParent = async () => {
    if (!inviteCodeInput.trim() || typeof userId !== 'string') return;
    try {
      const q = query(collection(db, 'Users'), where('inviteCode', '==', inviteCodeInput.trim()), where('role', '==', 'parent'));
      const snap = await getDocs(q);
      if (snap.empty) { alert("유효하지 않은 초대 코드입니다."); return; }
      const parentDoc = snap.docs[0];
      await updateDoc(doc(db, 'Users', userId), { linkedParent: parentDoc.id });
      await updateDoc(doc(db, 'Users', parentDoc.id), { linkedStudents: arrayUnion(userId) });
      alert("성공적으로 연동되었습니다!");
      setIsLinkModalOpen(false); setInviteCodeInput('');
    } catch (e) { alert("연동 중 오류가 발생했습니다."); }
  };

  const handleSmartScroll = () => {
    if (isAtBottom) { libraryTopRef.current?.scrollIntoView({ behavior: 'smooth' }); } 
    else { libraryBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }
  };

  const handleSpeakOriginal = async () => {
    stopAudio(); setSpeakingItem(null); 
    const textToSpeak = reviewSentence?.originalText;
    if (!textToSpeak) return;
    setIsSpeakingOriginal(true);
    await playCloudAudio(textToSpeak, selectedLanguage === 'en' ? 'en-US' : 'ko-KR');
    setIsSpeakingOriginal(false);
  };

  const handleSpeak = async (e: React.MouseEvent | React.TouchEvent, text: string, type: string, index: number) => {
    e.stopPropagation(); stopAudio(); setIsSpeakingOriginal(false);
    const cleanText = text.replace(/\([^)]+\)/g, '').replace(/^[A-Za-z]+:\s*/, "").trim(); 
    setSpeakingItem({ type, index });
    await playCloudAudio(cleanText, 'en-US');
    setSpeakingItem(null);
  };

  const handleVoiceInput = (field: 'original' | 'context' | 'answer' | 'editOriginal' | 'editContext') => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("크롬 브라우저를 사용해주세요."); return; }
    if (isListening) return;
    try {
      const recognition = new SpeechRecognition();
      const isEnglish = field === 'original' || field === 'answer' || field === 'editOriginal';
      recognition.lang = isEnglish ? 'en-US' : 'ko-KR';
      recognition.continuous = false; 
      recognition.interimResults = false;
      recognition.onstart = () => setIsListening(field);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (field === 'original') {
            setOriginalText(prev => {
                const processedTranscript = !prev ? transcript.charAt(0).toUpperCase() + transcript.slice(1) : transcript;
                return prev + (prev ? ' ' : '') + processedTranscript;
            });
            setInputMethod('verbal');
        } else if (field === 'answer') {
            setUserAnswer(prev => {
                const processedTranscript = !prev ? transcript.charAt(0).toUpperCase() + transcript.slice(1) : transcript;
                return prev + (prev ? ' ' : '') + processedTranscript;
            });
        } else if (field === 'editOriginal') {
            setEditOriginalText(prev => {
                const processedTranscript = !prev ? transcript.charAt(0).toUpperCase() + transcript.slice(1) : transcript;
                return prev + (prev ? ' ' : '') + processedTranscript;
            });
        } else if (field === 'editContext') { setEditUserContext(prev => prev + (prev ? ' ' : '') + transcript);
        } else { setUserContext(prev => prev + (prev ? ' ' : '') + transcript); }
        setIsListening(null);
      };
      recognition.onerror = () => setIsListening(null);
      recognition.onend = () => setIsListening(null);
      recognition.start();
    } catch (error) { console.error(error); alert("음성 인식 오류"); }
  };

  const handleCancelAdd = () => {
    setOriginalText(''); setUserContext(''); setShowContext(false);
    if (returnTab) { setActiveTab(returnTab); setReturnTab(null); }
    router.replace(pathname, { scroll: false });
  };

  const handleSave = async () => {
    if (!originalText.trim()) { alert('문장을 입력해주세요.'); return; }
    
    if (userData?.role === 'teacher' && !userContext.trim()) {
        alert('퀴즈 생성을 위한 키워드를 반드시 입력해주세요.');
        return;
    }

    const success = await saveSentenceToDB(originalText, userContext, inputMethod);
    if (success) {
      playDingSound(); setShowCoinAnim(true);
      setTimeout(() => setShowCoinAnim(false), 2000);
      setTimeout(() => {
          setOriginalText(''); setUserContext(''); setShowContext(false); setInputMethod('keyboard'); 
          if (returnTab) { setActiveTab(returnTab); setReturnTab(null); } 
          else if (activeTab === 'library') { fetchLibrarySentences(); }
          router.replace(pathname, { scroll: false });
      }, 800);
    } else { alert('저장 실패'); }
  };

  const saveSentenceToDB = async (text: string, context: string = '', inputType: string = 'keyboard') => {
    if (!userId || !targetUserId) return false;
    try {
      await addDoc(collection(db, 'Sentences'), {
        originalText: text,
        userContext: context,
        languageCode: selectedLanguage,
        ownerId: targetUserId, 
        createdBy: userId,
        sourceClass: userData?.role === 'teacher' ? selectedClassId : null,
        isAssigned: false, 
        createdAt: serverTimestamp(),
        lastLearnedAt: serverTimestamp(),
        cooldownUntil: serverTimestamp(),
        isMastered: false,
        recallCount: 0,
        inputType: inputType,
      });
      fetchLibrarySentences(); 
      return true;
    } catch (error) { return false; }
  };

  const handleItemClick = (e: React.MouseEvent | React.TouchEvent, type: 'similar', index: number, text: string) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const cleanText = text.replace(/\([^)]+\)/g, '').trim();
    setActiveExtendedItem({ type, index, text: cleanText, position: { top: rect.bottom + 8, left: rect.left + (rect.width / 2) } });
  };

  const handleMoveToAddTab = (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation(); e.preventDefault();
      if (!activeExtendedItem) return;
      setOriginalText(activeExtendedItem.text);
      setUserContext(''); setShowContext(false); 
      setReturnTab('review');
      setActiveExtendedItem(null);
      setActiveTab('add');
  };

  const fetchReviewSentence = async (language = selectedLanguage, overrideFilter: string | null = null) => {
    if (!targetUserId) return;
    setIsLoadingReview(true);
    setReviewSentence(null); setUserAnswer(''); setEvaluationResult(null); setRecallTrigger('');
    setActiveExtendedItem(null); setSpeakingItem(null); setIsEditing(false); setIsSpeakingOriginal(false);
    try {
        const now = new Date();
        const q = query(collection(db, 'Sentences'), where('ownerId', '==', targetUserId));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) { 
            setReviewSentence(null); 
        } else {
            let sentences: any[] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            sentences = sentences.filter(s => (s.languageCode || 'en') === language);
            sentences = sentences.filter(s => !s.isMastered); 
            sentences = sentences.filter(s => !s.cooldownUntil || s.cooldownUntil.toDate() <= now);

            const activeFilter = overrideFilter !== null ? overrideFilter : reviewSourceFilter;
            // 🚀 [Phase 4] 미션 3에서 DB에 저장될 isQuizIncorrect 기반 오답 노트 필터
            if (activeFilter === 'wrong') {
                sentences = sentences.filter(s => s.isQuizIncorrect === true);
            } else if (activeFilter === 'personal') {
                sentences = sentences.filter(s => !s.sourceClass);
            } else if (activeFilter !== 'all') {
                sentences = sentences.filter(s => s.sourceClass === activeFilter);
            }

            if (sentences.length === 0) {
                setReviewSentence(null);
            } else {
                const randomIndex = Math.floor(Math.random() * sentences.length);
                setReviewSentence(sentences[randomIndex]);
            }
        }
    } catch (error) { alert('불러오기 실패'); }
    setIsLoadingReview(false);
  };

  const handleReviewFilterChange = (filter: string) => {
      setReviewSourceFilter(filter);
      fetchReviewSentence(selectedLanguage, filter);
  };

  const fetchLibrarySentences = async () => {
      if (!targetUserId) { setIsLoadingLibrary(false); return; }
      setIsLoadingLibrary(true);
      try {
          let q;
          if (userData?.role === 'parent') {
              q = query(collection(db, 'Sentences'), where('ownerId', '==', targetUserId), where('createdBy', '==', userId));
          } else if (userData?.role === 'teacher') {
              if (selectedClassId) {
                  q = query(collection(db, 'Sentences'), where('ownerId', '==', userId), where('sourceClass', '==', selectedClassId));
              } else {
                  setLibrarySentences([]);
                  setIsLoadingLibrary(false);
                  return;
              }
          } else {
              q = query(collection(db, 'Sentences'), where('ownerId', '==', targetUserId));
          }
          const querySnapshot = await getDocs(q);
          const sentences = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setLibrarySentences(sentences);
      } catch (error) { console.error(error); }
      setIsLoadingLibrary(false);
  };

  const handleGetAiHint = async () => {
    if (!reviewSentence || isGeneratingTrigger) return;
    setIsGeneratingTrigger(true);
    try {
      const trigger = await generateRecallTrigger(reviewSentence.originalText, reviewSentence.userContext, selectedLanguage);
      if (trigger.includes("⚠️") || trigger.includes("실패") || trigger.includes("오류")) { setRetryTarget('hint'); setIsRetryModalOpen(true); return; }
      setRecallTrigger(trigger);
    } catch (error) { setRetryTarget('hint'); setIsRetryModalOpen(true); } 
    finally { setIsGeneratingTrigger(false); }
  };

  const handleTabChange = (tab: string, overrideFilter?: string) => {
    if (activeTab === 'review' && tab !== 'review') updateUserLearningTime();
    setActiveTab(tab);
    if (tab === 'add') setShowContext(false);
    if (tab === 'review') { 
        startTimeRef.current = Date.now(); 
        fetchReviewSentence(selectedLanguage, overrideFilter !== undefined ? overrideFilter : reviewSourceFilter); 
    } 
    else if (tab === 'library') { 
        setSearchQuery(''); 
        setIsEditing(false); 
        setSelectedLibrarySentenceId(null); 
        setLibraryFilter('all'); 
        setUnlockedMasters({}); 
        fetchLibrarySentences(); 
    } 
    else { updateUserLearningTime(); }
  };

  const handleSubmitAnswer = async (isRetry: boolean = false) => {
    if (!userAnswer.trim() || !reviewSentence) return;
    
    setIsEvaluating(true); setEvaluationResult(null); setActiveExtendedItem(null); setSpeakingItem(null); setIsSpeakingOriginal(false); 

    const result = await evaluateAnswer(reviewSentence.originalText, userAnswer, reviewSentence.userContext, selectedLanguage, currentStudentName);
    
    if (!result || !result.quickPraise || result.quickPraise.includes("에러")) {
        setRetryTarget('evaluation');
        setIsRetryModalOpen(true); setIsEvaluating(false); return;
    }

    setEvaluationResult(result);
    setIsEvaluating(false);
  };

  const handleSetCooldown = async (value: 3 | 5 | 7 | 10 | 'master' | 'remove_wrong') => {
      if (!reviewSentence || typeof userId !== 'string') return;

      const isMastered = value === 'master';
      const isRemoveWrong = value === 'remove_wrong';
      const todayStr = getTodayStr();

      setDashboardData(prev => ({ 
          ...prev, 
          dailyRecallCount: Number(prev.dailyRecallCount) + 1,
          totalMappingCount: Number(prev.totalMappingCount) + 1,
      }));

      try {
          await setDoc(doc(db, "Users", userId), { 
              dailyRecallCount: increment(1), 
              totalMappingCount: increment(1), 
              lastStudyDate: todayStr 
          }, { merge: true });

          const logDocId = `${userId}_${todayStr}`;
          await setDoc(doc(db, "StudyLogs", logDocId), {
              ownerId: userId, dateStr: todayStr, pass: increment(1), lastUpdatedAt: serverTimestamp()
          }, { merge: true });

          let cooldownDate = new Date();
          if (typeof value === 'number') {
              cooldownDate.setDate(cooldownDate.getDate() + value);
          } else if (isRemoveWrong) {
              cooldownDate.setDate(cooldownDate.getDate() + 3); // 오답 노트에서 삭제 시 기본 3일 휴식
          }

          // 🚀 [Phase 4] 오답 노트 삭제 로직 반영
          const updateData: any = {
              lastLearnedAt: serverTimestamp(), 
              cooldownUntil: isMastered ? null : cooldownDate,
              isMastered: isMastered,
              recallCount: increment(1) 
          };

          if (isRemoveWrong) {
              updateData.isQuizIncorrect = false; // 오답 꼬리표 제거
          }

          await updateDoc(doc(db, 'Sentences', reviewSentence.id), updateData);

          if (isMastered || isRemoveWrong) {
              playDingSound();
              setShowCoinAnim(true);
              setTimeout(() => setShowCoinAnim(false), 2000);
          }

          setIsCooldownModalOpen(false); 
          fetchReviewSentence(selectedLanguage, reviewSourceFilter);

      } catch (e) { console.error("쿨다운 업데이트 실패", e); }
  };

  const handleConfirmRetry = async () => {
      setIsRetryModalOpen(false);
      if (retryTarget === 'hint') handleGetAiHint();
      else if (retryTarget === 'evaluation') handleSubmitAnswer(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!isEvaluating && userAnswer.trim()) handleSubmitAnswer(false); }
  };

  const handleEnterEditMode = (e: React.MouseEvent, sentence: any) => {
    e.stopPropagation(); setEditingSentence(sentence); setEditOriginalText(sentence.originalText); setEditUserContext(sentence.userContext || ''); setIsEditing(true);
  };

  const handleCancelEdit = () => { setIsEditing(false); setEditingSentence(null); };
  const handleSaveUpdate = async () => {
    if (!editingSentence) return;
    try {
      await updateDoc(doc(db, 'Sentences', editingSentence.id), { originalText: editOriginalText, userContext: editUserContext });
      if (activeTab === 'review') setReviewSentence({ ...reviewSentence, originalText: editOriginalText, userContext: editUserContext });
      setIsEditing(false); setEditingSentence(null);
      if (activeTab === 'library') { setSelectedLibrarySentenceId(null); fetchLibrarySentences(); }
      alert("문장 수정됨");
    } catch (error) { alert("업데이트 실패"); }
  };

  const handleRequestDelete = (e: React.MouseEvent, sentenceId: string) => { e.stopPropagation(); e.preventDefault(); setDeleteTargetId(sentenceId); };
  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    try { 
        await deleteDoc(doc(db, "Sentences", deleteTargetId)); 
        setDeleteTargetId(null);
        setSelectedLibrarySentenceId(null); 
        setSearchQuery(''); 
        await fetchLibrarySentences(); 
        
        // 🚀 [Phase 6] 리뷰(매핑) 화면에서 삭제했을 경우 즉시 다음 문장 불러오기
        if (activeTab === 'review') {
            fetchReviewSentence(selectedLanguage, reviewSourceFilter);
        }
        
        alert("삭제 완료"); 
    } catch (error: any) { alert(`삭제 실패`); }
  };
  const handleCancelDelete = () => { setDeleteTargetId(null); };
  // 🚀 [오답 노트] 일반 문장으로 저장 (isQuizIncorrect 꼬리표 떼기)
  const handleSaveToRegular = async (e: React.MouseEvent, sentenceId: string) => {
      e.stopPropagation();
      try {
          await updateDoc(doc(db, 'Sentences', sentenceId), {
              isQuizIncorrect: false,
              lastLearnedAt: serverTimestamp() // 저장 시점을 갱신하여 상단으로 끌어올림
          });
          alert("일반 문장으로 저장되었습니다! 🎉 이제 매핑이 가능합니다.");
          setSelectedLibrarySentenceId(null);
          fetchLibrarySentences();
      } catch (error) {
          console.error("Save to regular error:", error);
          alert("저장 중 오류가 발생했습니다.");
      }
  };

  const handleResetCooldown = async (e: React.MouseEvent, sentenceId: string) => {
    e.stopPropagation();
    try { 
        await updateDoc(doc(db, "Sentences", sentenceId), { cooldownUntil: new Date(Date.now() - 60000), isMastered: false }); 
        setSearchQuery(''); setSelectedLibrarySentenceId(null); await fetchLibrarySentences(); 
        
        setUnlockedMasters(prev => { const next = {...prev}; delete next[sentenceId]; return next; });
        alert("쿨다운이 초기화되어 복습 가능 상태가 되었습니다."); 
    } catch (error) { alert("초기화 실패"); }
  };

  const handleResetAllCooldowns = async () => {
      if (!targetUserId) return;
      if (!confirm("마스터한 문장을 제외한 모든 대기 중인 문장의 쿨다운을 즉시 해제하시겠습니까?")) return;

      try {
          const q = query(collection(db, 'Sentences'), where('ownerId', '==', targetUserId));
          const snapshot = await getDocs(q);
          let currentBatch = writeBatch(db);
          let count = 0;
          const chunks = [];

          snapshot.docs.forEach((docSnap) => {
              const data = docSnap.data();
              if (!data.isMastered) {
                  currentBatch.update(docSnap.ref, { cooldownUntil: new Date(Date.now() - 60000) });
                  count++;
                  if (count === 500) {
                      chunks.push(currentBatch.commit());
                      currentBatch = writeBatch(db);
                      count = 0;
                  }
              }
          });

          if (count > 0) chunks.push(currentBatch.commit());
          await Promise.all(chunks);

          await fetchLibrarySentences();
          alert(`총 ${count}개 문장의 쿨다운이 해제되었습니다.`);
      } catch (error) {
          console.error(error);
          alert("전체 쿨다운 해제 중 오류가 발생했습니다.");
      }
  };

  let filteredLibrarySentences = librarySentences.filter(sentence => sentence.originalText.toLowerCase().includes(searchQuery.toLowerCase()) || (sentence.userContext && sentence.userContext.toLowerCase().includes(searchQuery.toLowerCase())));
  if (libraryFilter === 'mastered') {
      filteredLibrarySentences = filteredLibrarySentences.filter(s => s.isMastered);
  } else if (libraryFilter === 'ready') {
      const now = new Date();
      filteredLibrarySentences = filteredLibrarySentences.filter(s => !s.isMastered && (!s.cooldownUntil || s.cooldownUntil.toDate() <= now));
  } else if (libraryFilter === 'wrong') {
      // 🚀 [Phase 6] 오답 노트 필터 추가
      filteredLibrarySentences = filteredLibrarySentences.filter(s => s.isQuizIncorrect === true);
  }

  const getCooldownStatus = (sentence: any) => {
      if (sentence.isMastered) return { text: '마스터', color: 'yellow' };
      if (!sentence.cooldownUntil?.toDate) return { text: '정보 없음', color: 'blue' };
      const now = new Date();
      const cooldownDate = sentence.cooldownUntil.toDate();
      if (now > cooldownDate) return { text: '매핑 가능', color: 'blue' };
      const diffTime = Math.abs(cooldownDate.getTime() - now.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return { text: `${diffDays}일 남음`, color: 'blue' };
  };

  const handleTabPointerDown = (e: React.PointerEvent | React.TouchEvent | React.MouseEvent, uid: string, currentName: string) => {
      longPressTimerRef.current = window.setTimeout(() => { setEditingStudentId(uid); setEditingName(currentName); }, 600);
  };
  const handleTabPointerUpOrLeave = () => {
      if (longPressTimerRef.current !== null) { window.clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
  };

  const handleTransferPointerDown = (e: React.PointerEvent | React.TouchEvent | React.MouseEvent, sentenceId: string) => {
      if (userData?.role !== 'teacher') return;
      isLongPressTriggeredRef.current = false;
      transferLongPressTimerRef.current = window.setTimeout(() => {
          if ('vibrate' in navigator) navigator.vibrate(50);
          isLongPressTriggeredRef.current = true;
          setSelectedForTransfer(prev =>
              prev.includes(sentenceId) ? prev.filter(id => id !== sentenceId) : [...prev, sentenceId]
          );
      }, 500);
  };

  const handleTransferPointerUpOrLeave = () => {
      if (transferLongPressTimerRef.current !== null) {
          window.clearTimeout(transferLongPressTimerRef.current);
          transferLongPressTimerRef.current = null;
      }
  };

  const handleSaveStudentName = async (uid: string) => {
      if (editingName.trim()) { try { await updateDoc(doc(db, 'Users', uid), { displayName: editingName.trim() }); } catch (e) { } }
      setEditingStudentId(null);
  };

  const handleNameInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, uid: string) => {
      if (e.key === 'Enter') { e.preventDefault(); handleSaveStudentName(uid); } else if (e.key === 'Escape') { setEditingStudentId(null); }
  };

  const isAiError = liveSession?.status === 'evaluated' && (!liveSession.aiResult || !liveSession.aiResult.quickPraise || liveSession.aiResult.quickPraise.includes("에러") || liveSession.aiResult.quickPraise.includes("실패") || liveSession.aiResult.quickPraise.includes("오류"));
  const isHintError = liveSession?.koreanHint && (liveSession.koreanHint.includes("실패") || liveSession.koreanHint.includes("오류") || liveSession.koreanHint.includes("⚠️"));

  let transferButtonText = '';
  const s_stu = selectedForTransferStudents.length;
  const s_sen = selectedForTransfer.length;

  if (s_stu > 0 && s_sen > 0) {
      transferButtonText = `${s_stu}명의 학생에게 ${s_sen}개의 문장 전송`;
  } else if (s_stu === 0 && s_sen > 0) {
      transferButtonText = `전체 학생에게 ${s_sen}개의 문장 전송`;
  } else if (s_stu > 0 && s_sen === 0) {
      transferButtonText = `${s_stu}명의 학생에게 전체 문장 전송`;
  } else {
      transferButtonText = `전체 학생에게 전체 문장 전송`;
  }

  if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading...</div>;
  if (!user || (user && (!userData || !userData.role))) return <LoginView />;

  return (
    <div className={`mx-auto px-4 py-8 bg-gray-900 text-white min-h-screen shadow-2xl md:my-10 md:rounded-3xl border-gray-800 md:border-4 relative transition-all duration-500 ${userData?.role === 'teacher' ? 'max-w-5xl' : 'max-w-[480px]'}`}>
      {/* 🚀 [Step 3-2] AI 라이브 퀴즈 생성 로딩 스피너 오버레이 */}
      {isGeneratingLiveQuiz && (
        <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-[9999] p-4 backdrop-blur-sm">
            <div className="text-center bg-gray-800 p-8 rounded-2xl border-2 border-yellow-500 shadow-2xl animate-in zoom-in">
                <p className="text-6xl animate-bounce mb-4">🤖</p>
                <p className="text-yellow-400 text-xl font-bold animate-pulse">AI 튜터가 객관식 문제를<br/>만들고 있어요...</p>
            </div>
        </div>
      )}

      {/* 🚀 [Phase 2] 다중 퀴즈 스와이프 미리보기(Preview) 모달 */}
      {liveQuizPreview && liveQuizPreview.length > 0 && (
        <div className="fixed inset-0 bg-black/90 flex justify-center items-center z-[9999] p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-gray-800 rounded-3xl p-6 md:p-8 w-full max-w-xl border-2 border-yellow-500 shadow-[0_0_40px_rgba(234,179,8,0.3)] flex flex-col max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-2">
                  <h3 className="text-2xl md:text-3xl font-black text-yellow-400 flex items-center gap-3"><span className="text-3xl">⚡</span> 퀴즈 미리보기</h3>
                  <span className="bg-gray-700 px-3 py-1 rounded-full text-sm font-bold text-gray-300 shadow-inner">{previewIndex + 1} / {liveQuizPreview.length}</span>
              </div>
              <p className="text-gray-400 text-sm mb-4 border-b border-gray-700 pb-4">문제를 쓱 훑어보고 이상한 부분을 수정하세요.</p>
              
              {/* 스와이프 네비게이션 영역 */}
              {liveQuizPreview.length > 1 && (
                  <div className="flex justify-between items-center mb-6 gap-2 bg-gray-900/50 p-2 rounded-xl border border-gray-700">
                      <button disabled={previewIndex === 0} onClick={() => setPreviewIndex(p => p - 1)} className="p-2 bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-30 transition font-bold text-gray-300">◀ 이전</button>
                      <div className="flex gap-2 overflow-x-auto no-scrollbar">
                          {liveQuizPreview.map((_, idx) => (
                              <div key={idx} onClick={() => setPreviewIndex(idx)} className={`w-3 h-3 rounded-full cursor-pointer transition-colors ${idx === previewIndex ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]' : 'bg-gray-600'}`} />
                          ))}
                      </div>
                      <button disabled={previewIndex === liveQuizPreview.length - 1} onClick={() => setPreviewIndex(p => p + 1)} className="p-2 bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-30 transition font-bold text-gray-300">다음 ▶</button>
                  </div>
              )}

              <div className="space-y-5 flex-1 overflow-y-auto pr-2 no-scrollbar animate-in slide-in-from-right-2">
                 <div>
                   <label className="text-gray-400 text-xs font-bold mb-2 flex items-center gap-1"><span className="text-base">💡</span> 한국어 뜻 (힌트)</label>
                   <textarea value={liveQuizPreview[previewIndex].koreanHint} onChange={(e) => {
                       const newList = [...liveQuizPreview];
                       newList[previewIndex] = {...newList[previewIndex], koreanHint: e.target.value};
                       setLiveQuizPreview(newList);
                   }} className="w-full bg-gray-900 text-white p-4 rounded-xl border border-gray-600 focus:border-yellow-500 outline-none text-sm md:text-base leading-relaxed" rows={2}/>
                 </div>
                 <div>
                   <label className="text-gray-400 text-xs font-bold mb-2 flex items-center gap-1"><span className="text-base">📖</span> 빈칸 문제</label>
                   <textarea value={liveQuizPreview[previewIndex].blankSentence} onChange={(e) => {
                       const newList = [...liveQuizPreview];
                       newList[previewIndex] = {...newList[previewIndex], blankSentence: e.target.value};
                       setLiveQuizPreview(newList);
                   }} className="w-full bg-gray-900 text-white p-4 rounded-xl border border-gray-600 focus:border-yellow-500 outline-none font-serif text-lg md:text-xl italic" rows={2}/>
                 </div>
                 <div>
                   <label className="text-gray-400 text-xs font-bold mb-3 flex items-center gap-1"><span className="text-base">🎯</span> 보기 (정답에 체크하세요)</label>
                   <div className="space-y-3">
                     {liveQuizPreview[previewIndex].options.map((opt, idx) => (
                        <label key={idx} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer ${liveQuizPreview[previewIndex].correctAnswerIndex === idx ? 'border-yellow-500 bg-yellow-900/20' : 'border-gray-600 bg-gray-900 hover:border-gray-500'}`}>
                           <input type="radio" name="correctAnswer" checked={liveQuizPreview[previewIndex].correctAnswerIndex === idx} onChange={() => {
                               const newList = [...liveQuizPreview];
                               newList[previewIndex] = {...newList[previewIndex], correctAnswerIndex: idx};
                               setLiveQuizPreview(newList);
                           }} className="w-5 h-5 accent-yellow-500 cursor-pointer"/>
                           <input type="text" value={opt} onChange={(e) => {
                               const newList = [...liveQuizPreview];
                               const newOptions = [...newList[previewIndex].options];
                               newOptions[idx] = e.target.value;
                               newList[previewIndex] = {...newList[previewIndex], options: newOptions};
                               setLiveQuizPreview(newList);
                           }} className="flex-1 bg-transparent text-white outline-none font-bold text-base"/>
                        </label>
                     ))}
                   </div>
                 </div>
              </div>
              
              <div className="flex flex-col md:flex-row gap-3 mt-8 pt-4 border-t border-gray-700">
                  <button onClick={() => setLiveQuizPreview(null)} className="flex-1 py-4 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-xl transition text-lg">취소</button>
                  <button onClick={handleDispatchLiveQuiz} className="flex-[2] py-4 bg-gradient-to-r from-yellow-500 to-orange-600 text-white font-black rounded-xl transition shadow-[0_0_15px_rgba(234,179,8,0.4)] flex items-center justify-center gap-2 text-lg active:scale-95">🚀 {liveQuizPreview.length}문제 퀴즈 시작</button>
              </div>
          </div>
        </div>
      )}
      
      {coMapVideoStatus && (
          <div className="fixed inset-0 bg-black z-[10000] flex justify-center items-center">
              <video src={coMapVideoStatus === 'passed' ? '/firework_perfect.mp4' : '/firework_wrong.mp4'} autoPlay playsInline muted className="w-full h-full object-cover opacity-90" onEnded={() => setCoMapVideoStatus(null)} />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <h1 className={`text-4xl md:text-5xl font-black drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)] animate-bounce-in ${coMapVideoStatus === 'passed' ? 'text-yellow-400' : 'text-red-500'}`}>
                      {coMapVideoStatus === 'passed' ? '🎉 매핑 성공~!! 🎉' : '💪 아쉽지만 재도전! 💪'}
                  </h1>
              </div>
          </div>
      )}

      {showCoMapAlert && (
          <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-[9999] p-4 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-sm border-2 border-teal-500/50 shadow-[0_0_30px_rgba(20,184,166,0.4)] text-center animate-in zoom-in duration-300 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-teal-400 to-blue-500 animate-pulse" />
                  <p className="text-6xl mb-4 animate-bounce">🤝</p>
                  <h3 className="text-2xl font-black text-white mb-2 tracking-wide">도전! 함께 매핑</h3>
                  <p className="text-gray-300 mb-8 text-sm leading-relaxed">부모님이 실시간 퀴즈를 요청하셨어요!<br/>지금 바로 도전해 볼까요?</p>
                  <div className="flex space-x-3">
                      <button onClick={rejectCoMap} className="flex-1 py-4 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-xl transition shadow-md active:scale-95">다음에요</button>
                      <button onClick={acceptCoMap} className="flex-1 py-4 bg-gradient-to-r from-teal-500 to-blue-600 text-white font-bold rounded-xl transition shadow-lg shadow-teal-500/30 active:scale-95 text-lg">수락하기</button>
                  </div>
              </div>
          </div>
      )}

      {toastMessage && (
          <div 
             onClick={() => setToastMessage(null)}
             className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[10000] bg-gray-800 text-white px-6 py-3 rounded-full shadow-2xl border border-gray-600 animate-in slide-in-from-top-4 fade-in duration-300 font-bold whitespace-nowrap cursor-pointer flex items-center gap-3 hover:bg-gray-700 transition-colors"
          >
              <span>{toastMessage}</span>
              <span className="bg-gray-600 text-gray-300 text-xs px-2 py-0.5 rounded-full">✕</span>
          </div>
      )}

      {isDarkRoomActive && (
          <div className="fixed inset-0 bg-black z-[9999] flex flex-col items-center justify-center p-6 text-center touch-none animate-in fade-in duration-500">
              <button onClick={() => { playbackSessionIdRef.current += 1; isDarkRoomPlayingRef.current = false; stopAudio(); setIsDarkRoomActive(false); }} className="absolute top-6 right-6 text-gray-500 hover:text-white p-4 font-bold transition-colors">✕ 닫기</button>
              <div className="text-teal-400 mb-8 font-bold animate-pulse text-lg tracking-widest flex items-center gap-2"><span>🎧</span> {darkRoomState.status}</div>
              <div className="text-white text-2xl md:text-3xl font-serif italic max-w-sm leading-relaxed transition-opacity duration-500 min-h-[100px] flex items-center justify-center">&quot;{darkRoomState.text}&quot;</div>
          </div>
      )}

      {isCooldownModalOpen && (
          <div className="fixed inset-0 bg-black/90 flex justify-center items-center z-[250] p-4 backdrop-blur-md animate-in fade-in duration-200">
              <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm border border-purple-500/50 shadow-2xl flex flex-col text-center animate-in zoom-in duration-200">
                  <h3 className="text-xl md:text-2xl font-bold text-white mb-6">다음 복습 주기 선택</h3>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                      {[3, 5, 7, 10].map(days => (
                          <button key={days} onClick={() => handleSetCooldown(days as any)} className="py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition shadow-md text-lg active:scale-95">{days}일</button>
                      ))}
                  </div>
                  {/* 🚀 [Phase 4] 오답 문장일 경우 마스터 대신 '오답 노트에서 삭제' 버튼 표시 */}
                  {reviewSentence?.isQuizIncorrect ? (
                      <button onClick={() => handleSetCooldown('remove_wrong')} className="w-full py-4 bg-gradient-to-r from-red-500 to-orange-500 text-white font-bold rounded-xl hover:opacity-90 transition shadow-md text-lg active:scale-95">🚨 오답 노트에서 삭제 (일반 전환)</button>
                  ) : (
                      <button onClick={() => handleSetCooldown('master')} className="w-full py-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold rounded-xl hover:opacity-90 transition shadow-md text-lg active:scale-95">🏆 마스터 (졸업)</button>
                  )}
                  <button onClick={() => setIsCooldownModalOpen(false)} className="mt-6 text-gray-400 hover:text-white underline transition-colors">취소</button>
              </div>
          </div>
      )}

      <header className="text-center mb-6 relative">
        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap');
          @keyframes coin-up-fade { 0% { transform: translateY(0) scale(0.5); opacity: 0; } 20% { transform: translateY(-20px) scale(1.2); opacity: 1; } 100% { transform: translateY(-80px) scale(1); opacity: 0; } }
          .anim-coin { animation: coin-up-fade 1s ease-out forwards; }
          .no-scrollbar::-webkit-scrollbar { display: none; }
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          @keyframes pulse-blue { 0% { box-shadow: 0 0 0 0 rgba(45, 212, 191, 0.4); border-color: rgba(45, 212, 191, 0.5); } 50% { box-shadow: 0 0 15px 5px rgba(45, 212, 191, 0.6); border-color: rgba(45, 212, 191, 0.9); } 100% { box-shadow: 0 0 0 0 rgba(45, 212, 191, 0.4); border-color: rgba(45, 212, 191, 0.5); } }
          .glow-blue { animation: pulse-blue 2.5s infinite ease-in-out; }
          
          @keyframes pulse-purple {
              0% { box-shadow: 0 0 0 0 rgba(168, 85, 247, 0.4); border-color: rgba(168, 85, 247, 0.5); }
              50% { box-shadow: 0 0 15px 5px rgba(168, 85, 247, 0.6); border-color: rgba(168, 85, 247, 0.9); }
              100% { box-shadow: 0 0 0 0 rgba(168, 85, 247, 0.4); border-color: rgba(168, 85, 247, 0.5); }
          }
          .glow-purple { animation: pulse-purple 2.5s infinite ease-in-out; border: 2px solid transparent; }
        `}</style>
         
        <button onClick={logout} className="absolute left-0 top-1 z-50 p-2 rounded-full transition-all duration-300 group opacity-40 hover:opacity-100 hover:bg-gray-800 active:scale-95" title="Sign out">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-[#deb887]">
              <path fillRule="evenodd" d="M16.5 3.75a1.5 1.5 0 011.5 1.5v13.5a1.5 1.5 0 01-1.5 1.5h-6a1.5 1.5 0 01-1.5-1.5V15a.75.75 0 00-1.5 0v3.75a3 3 0 003 3h6a3 3 0 00-3-3h-6a3 3 0 00-3 3V9A.75.75 0 109 9V5.25a1.5 1.5 0 011.5-1.5h6zm-5.03 4.72a.75.75 0 000 1.06l1.72 1.72H2.25a.75.75 0 000 1.5h10.94l-1.72 1.72a.75.75 0 101.06 1.06l3-3a.75.75 0 000-1.06l-3-3a.75.75 0 00-1.06 0z" clipRule="evenodd" />
            </svg>
        </button>

        {userData?.role === 'student' && !userData?.linkedParent && (
            <div className="absolute right-0 top-1 z-50 flex space-x-1">
                <button onClick={() => setIsLinkModalOpen(true)} className="p-2 rounded-full transition-all duration-300 group hover:bg-gray-800 active:scale-95 flex items-center justify-center" title="부모님 연동">
                    <span className="text-2xl drop-shadow-md opacity-80 group-hover:opacity-100">👨‍👩‍👧</span>
                </button>
            </div>
        )}

        <div className="mb-2">
            <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-purple-500 to-pink-500 mb-2 drop-shadow-lg">Mappeat</h1>
            <p className="text-xl md:text-2xl text-teal-300 font-bold tracking-widest" style={{ fontFamily: "'Dancing Script', cursive", textShadow: '0 0 10px rgba(45, 212, 191, 0.8), 0 0 20px rgba(45, 212, 191, 0.4)' }}>Mapping & Repeat</p>
        </div>
      </header>

      {userData?.role === 'teacher' ? (
        <div className="teacher-view animate-in fade-in duration-500 pb-4">
            {!isTeacherClassQuizActive && !isCoMappingMode && (!liveSession || liveSession.status === 'idle') && (
                <div className="flex overflow-x-auto gap-4 mb-6 no-scrollbar border-b border-gray-700 pb-2 px-2 items-center">
                    {teacherClasses.map(c => (
                        <button key={c.id} onClick={() => { setSelectedClassId(c.id); setActiveTab('add'); }} onContextMenu={(e) => e.preventDefault()} className={`px-4 py-2 whitespace-nowrap font-bold transition-all select-none ${selectedClassId === c.id ? 'text-white border-b-2 border-yellow-400 text-lg' : 'text-gray-400 hover:text-gray-200'}`}>
                            {c.className}
                        </button>
                    ))}
                    <button onClick={() => setIsCreateClassModalOpen(true)} className="px-3 py-1 font-black text-yellow-400 border border-yellow-500/50 rounded-full hover:bg-yellow-900/50 transition-colors ml-auto flex-shrink-0">+ 새 클래스</button>
                </div>
            )}

            {!selectedClassId ? (
                <div className="bg-gray-800 border border-yellow-500/50 p-8 rounded-2xl text-center shadow-xl animate-in zoom-in mt-10 max-w-sm mx-auto">
                    <p className="text-5xl mb-4">👨‍🏫</p>
                    <h3 className="text-2xl font-bold text-yellow-400 mb-2">클래스를 만들어 주세요</h3>
                    <p className="text-gray-400 text-sm mb-8 leading-relaxed">상단의 '+' 버튼을 눌러<br/>학생들이 접속할 방을 생성하세요.</p>
                    <button onClick={() => setIsCreateClassModalOpen(true)} className="w-full py-4 bg-yellow-600 hover:bg-yellow-500 rounded-xl text-white font-bold transition shadow-lg">+ 새 클래스 만들기</button>
                </div>
            ) : (
                !isCoMappingMode && (!liveSession || liveSession.status === 'idle') && (
                    <div className="space-y-6 mb-8 animate-in fade-in">
			{/* 🚀 [Step 3-2] 선생님 관제탑 노출 처리 */}
                        {(() => {
                            const currentClass = teacherClasses.find(c => c.id === selectedClassId);
                            if(!currentClass) return null;

			    if (isTeacherClassQuizActive) {
                                return renderTeacherLiveQuizDashboard(currentClass, currentClass.activeLiveQuiz);
			    }

                            return (
                                <>
                                    {/* 🚀 [Phase 7] 거대한 클래스 입장 코드 박스 삭제 및 대기실 통합 */}
                                    <div className="bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-700">
                                        {/* 🚀 [Phase 8] 대기실 타이틀 일렬 배치 (대기실 - 총 명 - 입장코드) */}
                                        <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4 gap-2">
                                            <div className="flex items-center gap-2 md:gap-3">
                                                <h3 className="text-lg md:text-xl font-bold text-white flex items-center gap-1 md:gap-2">
                                                    <span>👥</span> 대기실
                                                </h3>
                                                <span className="bg-gray-700 px-2.5 py-1 md:px-3 md:py-1.5 rounded-full text-xs md:text-sm font-bold text-gray-300 shadow-inner whitespace-nowrap">
                                                    총 {currentClass.students?.length || 0}명
                                                </span>
                                            </div>
                                            <span className="text-xs md:text-sm font-bold text-yellow-400 bg-yellow-900/30 px-2 py-1 md:px-2 md:py-1.5 rounded-md border border-yellow-500/30 whitespace-nowrap shadow-sm">
                                                입장 코드: {currentClass.inviteCode}
                                            </span>
                                        </div>
                                        
                                        {/* 🚀 [Phase 8] 학생 카드 2열 정렬(grid grid-cols-2) 및 스크롤 유지 */}
                                        {currentClass.students && currentClass.students.length > 0 ? (
                                            <div className="grid grid-cols-2 gap-3 md:gap-4 max-h-[250px] overflow-y-auto no-scrollbar pb-2 pr-1">
                                                {currentClass.students.map((student: any) => {
                                                    const isStudentSelected = selectedForTransferStudents.includes(student.uid);
                                                    return (
                                                        <div 
                                                            key={student.uid} 
                                                            onClick={() => {
                                                                // 🚀 [Phase 4] 퀴즈 모드일 때는 학생 개별 선택을 완전히 차단함
                                                                if (isQuizMode) return;
                                                                setSelectedForTransferStudents(prev => 
                                                                    prev.includes(student.uid) ? prev.filter(id => id !== student.uid) : [...prev, student.uid]
                                                                );
                                                            }}
                                                            // 🚀 [Phase 4] 퀴즈 모드일 경우 클릭 방지(cursor-not-allowed) 및 반투명(opacity-60) 처리
                                                            className={`py-2 px-3 md:py-2.5 md:px-4 inline-flex items-center gap-3 md:gap-5 rounded-full border-2 transition-all duration-200 shadow-sm ${
                                                                isQuizMode 
                                                                    ? 'bg-gray-800 border-gray-700 opacity-60 cursor-not-allowed' 
                                                                    : isStudentSelected 
                                                                        ? 'bg-indigo-900/30 border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.3)] cursor-pointer' 
                                                                        : 'bg-gray-750 border-gray-600 hover:border-indigo-400/50 cursor-pointer'
                                                            }`}
                                                        >
                                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${isStudentSelected ? 'bg-indigo-500 border-indigo-500' : 'border-gray-500 bg-transparent'}`}>
                                                                {isStudentSelected && <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-white font-bold"><path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" /></svg>}
                                                            </div>
                                                            
                                                            {editingClassStudent?.uid === student.uid ? (
                                                                <input 
                                                                    autoFocus 
                                                                    value={editingClassStudent?.currentName || ''} 
                                                                    onChange={(e) => editingClassStudent && setEditingClassStudent({...editingClassStudent, currentName: e.target.value})}
                                                                    onBlur={() => editingClassStudent && handleUpdateClassStudentName(currentClass.id, student.uid, student.realName, editingClassStudent.currentName)}
                                                                    onKeyDown={(e) => { if(e.key === 'Enter' && editingClassStudent) handleUpdateClassStudentName(currentClass.id, student.uid, student.realName, editingClassStudent.currentName); else if(e.key === 'Escape') setEditingClassStudent(null); }}
                                                                    onClick={(e) => e.stopPropagation()} 
                                                                    className="w-20 md:w-24 bg-gray-900 border border-yellow-500 rounded px-2 py-0.5 text-white outline-none focus:ring-2 focus:ring-yellow-500/50 text-sm md:text-base"
                                                                />
                                                            ) : (
                                                                <span 
                                                                    onClick={(e) => { e.stopPropagation(); setEditingClassStudent({uid: student.uid, currentName: student.realName}); }}
                                                                    className="font-bold text-sm md:text-base text-gray-200 cursor-pointer hover:text-yellow-300 transition-colors truncate max-w-[100px] md:max-w-[120px]"
                                                                    title="이름 수정"
                                                                >
                                                                    {student.realName}
                                                                </span>
                                                            )}
							    <button onClick={(e) => { e.stopPropagation(); handleKickStudent(currentClass.id, student.uid, student.realName); }} className="text-gray-500 hover:text-red-500 transition-colors p-1 shrink-0" title="내보내기">
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 md:w-5 md:h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" /></svg>
                                                            </button>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        ) : (
                                            <div className="text-center py-12 bg-gray-900/50 rounded-xl border border-gray-700 border-dashed">
                                                <p className="text-6xl mb-4 opacity-50">📭</p>
                                                <p className="text-gray-400 font-bold text-lg">아직 입장한 학생이 없습니다.</p>
                                                <p className="text-sm text-gray-500 mt-2">상단의 입장 코드를 학생들에게 공유해주세요.</p>
                                            </div>
                                        )}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                )
            )}
        </div>
      ) : userData?.role === 'parent' ? (
        <div className="parent-view animate-in fade-in duration-500">
          {!isCoMappingMode && (!liveSession || liveSession.status === 'idle') && (
              <div className="flex overflow-x-auto gap-4 mb-6 no-scrollbar border-b border-gray-700 pb-2 px-2 items-center">
                 {studentProfiles.map(p => {
                    const isEditing = editingStudentId === p.uid;
                    const displayName = p.displayName?.split(' ')[0] || '자녀';
    
                    return isEditing ? (
                        <input key={`edit-${p.uid}`} autoFocus value={editingName} onChange={(e) => setEditingName(e.target.value)} onBlur={() => handleSaveStudentName(p.uid)} onKeyDown={(e) => handleNameInputKeyDown(e, p.uid)} className={`px-3 py-1 bg-gray-700 border border-indigo-400 rounded-lg text-white font-bold outline-none text-center w-24 shadow-inner ${selectedStudentId === p.uid ? 'text-lg' : 'text-base'}`} />
                    ) : (
                        <button key={p.uid} onClick={() => { setSelectedStudentId(p.uid); localStorage.setItem('mappeat_selected_student', p.uid); setActiveTab('add'); }} onPointerDown={(e) => handleTabPointerDown(e, p.uid, displayName)} onPointerUp={handleTabPointerUpOrLeave} onPointerLeave={handleTabPointerUpOrLeave} onContextMenu={(e) => e.preventDefault()} className={`px-4 py-2 whitespace-nowrap font-bold transition-all select-none ${selectedStudentId === p.uid ? 'text-white border-b-2 border-indigo-400 text-lg' : 'text-gray-400 hover:text-gray-200'}`} style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}>{displayName}</button>
                    );
                 })}
                 <button onClick={handleGenerateInviteCode} className="px-3 py-1 font-black text-indigo-400 border border-indigo-500/50 rounded-full hover:bg-indigo-900/50 transition-colors ml-auto flex-shrink-0">+</button>
              </div>
          )}

          {!selectedStudentId && (
            <div className="bg-gray-800 border border-indigo-500/50 p-8 rounded-2xl text-center shadow-xl animate-in zoom-in mt-10 max-w-sm mx-auto">
                <p className="text-5xl mb-4">👨‍👩‍👧</p>
                <h3 className="text-2xl font-bold text-indigo-400 mb-2">자녀를 연동해 주세요</h3>
                <p className="text-gray-400 text-sm mb-8 leading-relaxed">학습 현황을 확인하고 문장을 추가하려면<br/>아래 버튼을 눌러 초대 코드를 발급하세요.</p>
                <button onClick={handleGenerateInviteCode} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold transition shadow-lg">+ 초대 코드 발급하기</button>
            </div>
          )}
        </div>
      ) : (
        <div className="student-view animate-in fade-in duration-500">
          {/* 🚀 [Step 3-3] 학생 뷰: 라이브 퀴즈가 활성화되면 대시보드 대신 퀴즈 화면 렌더링 */}
          {isStudentInClassQuiz ? (
              renderStudentLiveQuiz()
          ) : (
              !isStudentQuizActive && renderStudentDashboard()
          )}
        </div>
      )}

      {/* 🚀 [Step 3-3] 퀴즈 진행 중일 때는 하단 탭 및 라이브러리를 완전히 숨김 */}
      {!isTeacherClassQuizActive && !isStudentInClassQuiz && !(userData?.role === 'parent' && !selectedStudentId) && !(userData?.role === 'teacher' && !selectedClassId) && (
        <>    
          {(userData?.role === 'parent' || userData?.role === 'teacher') && liveSession && !['idle', 'selecting'].includes(liveSession.status) ? (
             <div className="pb-20 max-w-sm mx-auto">
                 <div className="bg-gray-800 p-6 md:p-8 rounded-lg shadow-2xl border-2 border-teal-500 animate-in zoom-in duration-300 space-y-5">
                    
                    {renderScoreBoard()}

                    <div className="flex justify-between items-center mb-2">
                        <h2 className="text-xl md:text-2xl font-black text-teal-400 flex items-center gap-2"><span>🤝</span> 함께 매핑 퀴즈</h2>
                        <button onClick={resetLiveSession} className="text-gray-400 hover:text-white bg-gray-700 px-3 py-1 rounded-lg text-sm font-bold shadow-sm transition-colors active:scale-95">✕ 종료</button>
                    </div>
                    
                    <div className="bg-gray-750 p-4 rounded-xl border border-gray-600 shadow-inner">
                        <p className="text-gray-400 text-sm mb-2 font-bold flex items-center gap-2"><span>📖</span> 영어 원문</p>
                        <p className="text-white text-lg font-serif italic">&quot;{liveSession.originalText}&quot;</p>
                    </div>
                    
                    <div className={`bg-gray-750 p-4 rounded-xl border ${isHintError ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border-gray-600'} shadow-inner`}>
                        <p className="text-gray-400 text-sm mb-2 font-bold flex items-center gap-2"><span>🎯</span> 한국어 번역문 (자녀 힌트)</p>
                        <p className={`text-lg ${isHintError ? 'text-red-400 animate-pulse font-black' : 'text-white font-medium'}`}>{liveSession.koreanHint}</p>
                    </div>
                    
                    {!isHintError && (
                      <>
                        <div className="bg-gray-900/50 p-4 rounded-xl border border-teal-500/30 shadow-inner min-h-[5rem] flex flex-col justify-center">
                            <p className="text-teal-400 text-sm mb-2 font-bold flex items-center gap-2"><span>✍️</span> 학생 문장</p>
                            <p className={`text-xl font-bold ${['requested', 'accepted'].includes(liveSession.status) ? 'text-gray-500 animate-pulse' : 'text-yellow-400'}`}>
                                {['requested', 'accepted'].includes(liveSession.status) ? '자녀가 답변을 고민하고 있습니다... ⏳' : `"${liveSession.studentAnswer}"`}
                            </p>
                        </div>
                        
                        <div className="bg-gray-750 p-4 rounded-xl border border-gray-600 shadow-inner min-h-[10rem] flex flex-col justify-center">
                            <p className="text-gray-400 text-sm mb-3 font-bold flex items-center gap-2"><span>💡</span> 평가 결과</p>
                            
                            {liveSession.status === 'evaluating' && (
                                <p className="text-purple-400 animate-pulse font-bold text-center">AI 튜터가 문장을 열심히 분석하고 있습니다... 🤖</p>
                            )}
                            
                            {liveSession.status === 'evaluated' && (
                                isAiError ? (
                                    <div className="space-y-2 animate-in fade-in duration-500 text-center py-4">
                                        <p className="text-red-400 font-bold text-base">⚠️ AI 평가 중 오류가 발생했습니다.</p>
                                        <p className="text-gray-400 text-xs">하단의 &apos;다시 시도&apos; 버튼을 눌러주세요.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3 animate-in fade-in duration-500">
                                       <p className="text-green-400 font-black text-lg">{liveSession.aiResult.quickPraise}</p>
                                       <div className="p-3 bg-gray-900/50 rounded-lg text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">
                                           {liveSession.aiResult.feedback}
                                       </div>
                                    </div>
                                )
                            )}

                            {['passed', 'retry'].includes(liveSession.status) && (
                                <p className={`text-xl font-black text-center mt-2 ${liveSession.status === 'passed' ? 'text-yellow-400' : 'text-red-500'}`}>
                                    자녀에게 {liveSession.status === 'passed' ? '통과 🎉' : '재도전 💪'} 결과가 전송되었습니다!
                                </p>
                            )}
                        </div>
                      </>
                    )}
                    
                    {(isHintError || isAiError) && (
                        <div className="flex justify-center space-x-4 pt-2 animate-in slide-in-from-bottom-4 duration-300">
                            <button onClick={handleResetToSelecting} className="w-32 py-2.5 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-xl shadow-md transition active:scale-95 text-sm md:text-base flex items-center justify-center">처음으로</button>
                            <button onClick={isHintError ? handleRetryHint : handleReEvaluateAi} className="w-32 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold rounded-xl shadow-md transition active:scale-95 text-sm md:text-base glow-purple flex items-center justify-center">다시 시도</button>
                        </div>
                    )}
                    
                    {liveSession.status === 'evaluated' && !isAiError && !isHintError && (
                        <div className="flex space-x-3 pt-2 animate-in slide-in-from-bottom-4 duration-300">
                            <button onClick={() => handleCoMapVerdict('passed')} className="flex-1 py-4 bg-teal-600 hover:bg-teal-500 text-white font-black rounded-xl shadow-lg transition active:scale-95 text-lg">통과</button>
                            <button onClick={() => handleCoMapVerdict('retry')} className="flex-1 py-4 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-xl shadow-lg transition active:scale-95 text-lg">재도전</button>
                        </div>
                    )}
                 </div>
             </div>
          ) : (
            <div className="pb-20 max-w-[480px] mx-auto">
                {(userData?.role === 'parent' || userData?.role === 'teacher') && !isCoMappingMode && (!liveSession || liveSession.status === 'idle') && (
                    <>
                        {userData?.role === 'parent' && renderParentDashboard()}
                        <div className="mb-6 border-b border-gray-700">
                          <nav className="-mb-px flex justify-center space-x-6">
                            {['add', 'library'].map((tab) => (
                              <button key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap py-4 px-4 border-b-2 font-medium text-lg transition-colors ${activeTab === tab ? (tab === 'add' ? 'border-purple-400 text-purple-400' : 'border-teal-400 text-teal-400') : 'border-transparent text-gray-400 hover:text-gray-200'}`}>{tab === 'add' ? '문장 추가' : '라이브러리'}</button>
                            ))}
                          </nav>
                        </div>
                    </>
                )}

                {userData?.role !== 'parent' && userData?.role !== 'teacher' && !isStudentQuizActive && (
                    <div className="mb-8 border-b border-gray-700">
                      <nav className="-mb-px flex justify-center space-x-6">
                        {['add', 'review', 'library'].map((tab) => (
                          <button key={tab} onClick={() => handleTabChange(tab)} className={`whitespace-nowrap py-4 px-4 border-b-2 font-medium text-lg transition-colors ${activeTab === tab ? (tab === 'add' ? 'border-purple-400 text-purple-400' : tab === 'review' ? 'border-pink-500 text-pink-500' : 'border-teal-400 text-teal-400') : 'border-transparent text-gray-400 hover:text-gray-200'}`}>{tab === 'add' ? '문장 추가' : tab === 'review' ? '매핑하기' : '라이브러리'}</button>
                        ))}
                      </nav>
                    </div>
                )}

                {/* TAB 1: ADD */}
                {activeTab === 'add' && !isCoMappingMode && (
                  <div className="bg-gray-800 p-6 md:p-8 rounded-lg shadow-xl border border-gray-700 animate-in fade-in duration-300">
                    <h2 className="text-xl md:text-2xl font-bold mb-6 text-purple-400">새 문장 추가하기</h2>
                    <div className="space-y-6">
                      <div className="relative">
                        <textarea value={originalText} onChange={(e) => setOriginalText(e.target.value)} className="w-full py-4 pl-3 pr-4 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 text-white text-base placeholder:italic placeholder-gray-400" rows={4} placeholder="학습할 문장을 입력하세요~" />
                        <button onClick={() => handleVoiceInput('original')} className={`absolute bottom-3 left-3 text-2xl transition-colors cursor-pointer z-10 ${isListening === 'original' ? 'text-red-500 animate-pulse' : 'text-gray-400 hover:text-purple-400'}`} title="영어로 말하기">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" /><path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.38v2.62h2.25a.75.75 0 010 1.5h-6a.75.75 0 010-1.5h2.25v-2.62a6.751 6.751 0 01-6-6.38v-1.5a.75.75 0 01.75-.75z" /></svg>
                        </button>
                      </div>

                      {userData?.role === 'teacher' ? (
                          <div className="mt-4">
                              <p className="text-purple-400 font-bold text-sm mb-2 px-3">퀴즈용 키워드 입력 (필수)</p>
                              <div className="relative animate-in slide-in-from-top-1">
                                <textarea value={userContext} onChange={(e) => setUserContext(e.target.value)} className="w-full py-4 pl-3 pr-4 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 text-white text-base placeholder:italic" rows={3} placeholder={"문장의 중요 단어나 구문을 입력하세요.\n퀴즈 생성에 활용됩니다."} />
                                <button onClick={() => handleVoiceInput('context')} className={`absolute bottom-3 left-3 text-2xl transition-colors cursor-pointer z-10 ${isListening === 'context' ? 'text-red-500 animate-pulse' : 'text-gray-400 hover:text-purple-400'}`} title="한국어로 말하기">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" /><path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.38v2.62h2.25a.75.75 0 010 1.5h-6a.75.75 0 010-1.5h2.25v-2.62a6.751 6.751 0 01-6-6.38v-1.5a.75.75 0 01.75-.75z" /></svg>
                                </button>
                              </div>
                          </div>
                      ) : (
                          <>
                              <div className="flex justify-start mt-2">
                                  <button onClick={() => setShowContext(!showContext)} className="text-purple-400 hover:text-purple-300 font-bold transition-colors text-sm px-3 py-1 bg-purple-500/10 rounded-full shadow-sm">
                                      {showContext ? '- 컨텍스트 숨기기' : '+ 컨텍스트 추가 (선택사항)'}
                                  </button>
                              </div>
                              
                              {showContext && (
                                <div className="relative animate-in slide-in-from-top-1 mt-2">
                                  <textarea value={userContext} onChange={(e) => setUserContext(e.target.value)} className="w-full py-4 pl-3 pr-4 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 text-white text-base placeholder:italic" rows={3} placeholder="매핑할 상황이나 의미를 입력하세요." />
                                  <button onClick={() => handleVoiceInput('context')} className={`absolute bottom-3 left-3 text-2xl transition-colors cursor-pointer z-10 ${isListening === 'context' ? 'text-red-500 animate-pulse' : 'text-gray-400 hover:text-purple-400'}`} title="한국어로 말하기">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" /><path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.38v2.62h2.25a.75.75 0 010 1.5h-6a.75.75 0 010-1.5h2.25v-2.62a6.751 6.751 0 01-6-6.38v-1.5a.75.75 0 01.75-.75z" /></svg>
                                  </button>
                                </div>
                              )}
                          </>
                      )}

                      <div className="flex justify-between items-center mt-6 relative">
                        <button onClick={handleCancelAdd} className="w-32 py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-lg transition">취소</button>
                         <button onClick={handleSave} className="w-32 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-lg hover:opacity-90 transition-opacity shadow-lg relative">
                          저장
                          {showCoinAnim && (
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none">
                                <div className="text-4xl anim-coin" style={{ animationDelay: '0s' }}>💰</div>
                                <div className="text-4xl anim-coin absolute top-0" style={{ left: '-20px', animationDelay: '0.1s' }}>✨</div>
                                <div className="text-4xl anim-coin absolute top-0" style={{ right: '-20px', animationDelay: '0.2s' }}>✨</div>
                            </div>
                          )}
                       </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: REVIEW (학생 리뷰 탭) */}
                {activeTab === 'review' && userData?.role !== 'parent' && userData?.role !== 'teacher' && (
                  liveSession && liveSession.status !== 'idle' ? (
                      <div className="bg-gray-800 p-6 md:p-8 rounded-lg shadow-xl border border-teal-500 animate-in fade-in duration-300 relative border-t-4">
                          {renderScoreBoard()}
                          
                          {(liveSession.status === 'selecting' || isHintError) ? (
                               <div className="text-center py-16 space-y-4 bg-gray-700/30 rounded-xl border border-gray-600/50 shadow-inner flex flex-col items-center justify-center relative">
                                     <p className="text-6xl animate-bounce">👀</p>
                                     <h3 className="text-xl md:text-2xl font-bold text-teal-400 tracking-wide mt-4">부모님이 다음 퀴즈를 고르고 있어요!</h3>
                                     <p className="text-gray-400 text-base mt-2 mb-4">긴장 풀고 잠시만 대기해 주세요 ⚡</p>
                                     <button onClick={handleEmergencyExit} className="mt-8 px-4 py-2 text-gray-500 text-xs hover:text-gray-300 transition-colors underline decoration-gray-600 active:scale-95">
                                         (비상 탈출: 화면이 멈췄을 때 누르세요)
                                     </button>
                                </div>
                          ) : (
                              <div className="space-y-6 animate-in slide-in-from-right">
                                  <div className="relative">
                                      <div className="w-full p-6 bg-gray-700/50 border border-teal-500/30 rounded-xl min-h-[8rem] flex items-center justify-center text-center shadow-inner">
                                          <p className="text-lg md:text-xl text-white font-bold leading-relaxed">{liveSession.koreanHint}</p>
                                      </div>
                                  </div>
                                  
                                  {['evaluated', 'passed', 'retry'].includes(liveSession.status) ? (
                                      <div className="text-center py-10 space-y-4 bg-gray-700/30 rounded-xl">
                                          <p className="text-4xl animate-bounce">⏳</p>
                                          <p className="text-yellow-400 text-lg font-bold animate-pulse">부모님의 최종 판정을 기다리는 중입니다...</p>
                                      </div>
                                  ) : (
                                      <div className="relative animate-in slide-in-from-bottom-2">
                                          {liveSession.status === 'accepted' && liveSession.studentAnswer && (
                                              <p className="text-orange-400 text-sm font-bold mb-2 animate-pulse">⚠️ 부모님이 다시 입력을 요청하셨어요!</p>
                                          )}
                                          <textarea value={userAnswer} onChange={(e) => setUserAnswer(e.target.value)} disabled={liveSession.status === 'evaluating'} className="w-full py-4 pl-3 pr-4 bg-gray-700 border border-gray-600 rounded-xl focus:ring-2 focus:ring-teal-500 text-white text-base placeholder:text-left placeholder:italic" rows={4} placeholder="영어 문장을 입력하세요~" />
                                          <button onClick={() => handleVoiceInput('answer')} className={`absolute bottom-3 left-3 text-2xl transition-colors cursor-pointer z-10 ${isListening === 'answer' ? 'text-red-500 animate-pulse' : 'text-gray-400 hover:text-teal-400'}`}>
                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" /><path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.38v2.62h2.25a.75.75 0 010 1.5h-6a.75.75 0 010-1.5h2.25v-2.62a6.751 6.751 0 01-6-6.38v-1.5a.75.75 0 01.75-.75z" /></svg>
                                          </button>
                                      </div>
                                  )}
                                  
                                  {liveSession.status === 'evaluating' && <p className="text-center text-teal-400 animate-pulse font-bold">AI가 답변을 분석 중입니다... 🤖</p>}

                                  {['requested', 'accepted'].includes(liveSession.status) && (
                                      <button onClick={submitCoMapAnswer} disabled={!userAnswer.trim()} className="w-full py-4 bg-gradient-to-r from-teal-500 to-blue-600 text-white font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50 shadow-lg text-lg active:scale-95 animate-in zoom-in">
                                          정답 제출하기
                                      </button>
                                  )}
                              </div>
                          )}
                      </div>
                  ) : (
                  <div className="bg-gray-800 p-6 md:p-8 rounded-lg shadow-xl border border-gray-700 animate-in fade-in duration-300 relative overflow-hidden">
                    
                    {/* 🚀 [권한 분리] 학생일 때만 필터 탭(전체/내 문장/오답노트/클래스) 전체 표시 */}
                    {!isEditing && !evaluationResult && userData?.role === 'student' && (
                        <div className="flex overflow-x-auto gap-2 mb-5 pb-2 no-scrollbar border-b border-gray-700 items-center">
                            <button onClick={() => handleReviewFilterChange('all')} className={`px-4 py-2 whitespace-nowrap rounded-full text-sm font-bold transition-all shadow-sm ${reviewSourceFilter === 'all' ? 'bg-pink-500 text-white shadow-[0_0_10px_rgba(236,72,153,0.4)]' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>전체</button>
                            <button onClick={() => handleReviewFilterChange('personal')} className={`px-4 py-2 whitespace-nowrap rounded-full text-sm font-bold transition-all shadow-sm ${reviewSourceFilter === 'personal' ? 'bg-pink-500 text-white shadow-[0_0_10px_rgba(236,72,153,0.4)]' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>내 문장</button>
                            <button onClick={() => handleReviewFilterChange('wrong')} className={`px-4 py-2 whitespace-nowrap rounded-full text-sm font-bold transition-all shadow-sm flex items-center gap-1 ${reviewSourceFilter === 'wrong' ? 'bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>🚨 오답노트</button>
                            {studentClassesData.map(c => (
                                <button key={c.id} onClick={() => handleReviewFilterChange(c.id)} className={`px-4 py-2 whitespace-nowrap rounded-full text-sm font-bold transition-all shadow-sm ${reviewSourceFilter === c.id ? 'bg-pink-500 text-white shadow-[0_0_10px_rgba(236,72,153,0.4)]' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>{c.className}</button>
                            ))}
                        </div>
                    )}

                    <div className="relative z-10">
                        {isLoadingReview ? (
                        <div className="text-center py-20">
                            <p className="text-pink-400 text-lg font-bold animate-pulse">원하는 문장을 찾고 있습니다...</p>
                        </div>
                        ) : reviewSentence ? (
                        isEditing && editingSentence?.id === reviewSentence.id ? (
                            <div className="space-y-6 animate-in slide-in-from-right">
                            <h2 className="text-2xl md:text-3xl font-bold mb-6 text-pink-500">문장 수정하기</h2>
                            <div className="relative">
                                <textarea value={editOriginalText} onChange={(e) => setOriginalText(e.target.value)} className="w-full py-4 pl-3 pr-4 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-pink-500 text-white" rows={4} />
                                <button onClick={() => handleVoiceInput('editOriginal')} className={`absolute bottom-3 left-3 text-2xl transition-colors cursor-pointer z-10 ${isListening === 'editOriginal' ? 'text-red-500 animate-pulse' : 'text-gray-400 hover:text-purple-400'}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" /><path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.38v2.62h2.25a.75.75 0 010 1.5h-6a.75.75 0 010-1.5h2.25v-2.62a6.751 6.751 0 01-6-6.38v-1.5a.75.75 0 01.75-.75z" /></svg>
                                </button>
                            </div>
                            <div className="relative">
                                <textarea value={editUserContext} onChange={(e) => setEditUserContext(e.target.value)} className="w-full py-4 pl-3 pr-4 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-pink-500 text-white" rows={3} />
                                <button onClick={() => handleVoiceInput('editContext')} className={`absolute bottom-3 left-3 text-2xl transition-colors cursor-pointer z-10 ${isListening === 'editContext' ? 'text-red-500 animate-pulse' : 'text-gray-400 hover:text-purple-400'}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" /><path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.38v2.62h2.25a.75.75 0 010 1.5h-6a.75.75 0 010-1.5h2.25v-2.62a6.751 6.751 0 01-6-6.38v-1.5a.75.75 0 01.75-.75z" /></svg>
                                </button>
                            </div>
                            <div className="flex justify-between items-center space-x-4">
                                <button onClick={handleCancelEdit} className="px-6 py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-lg transition">취소</button>
                                <button onClick={handleSaveUpdate} className="px-6 py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-bold rounded-lg hover:opacity-90 transition-opacity">저장하기</button>
                            </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                            <div className="relative">
                                <textarea readOnly value={recallTrigger} className="w-full p-4 bg-gray-700/50 border border-gray-600 rounded-md min-h-[10rem] text-base text-left text-gray-200 italic resize-none" placeholder="매핑할 상황을 불러오세요~" />
                                <button onClick={handleGetAiHint} disabled={isGeneratingTrigger || !!recallTrigger} className="absolute bottom-3 right-3 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition disabled:opacity-50 shadow-md">
                                    {isGeneratingTrigger ? '생성 중...' : '불러오기'}
                                </button>
                            </div>

                            <div className="relative">
                                <textarea value={userAnswer} onChange={(e) => setUserAnswer(e.target.value)} onKeyDown={handleKeyDown} className="w-full py-4 pl-3 pr-4 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-pink-500 text-white text-base placeholder:text-left placeholder:italic" rows={4} placeholder="매핑할 표현을 입력하세요~" disabled={isEvaluating || !!evaluationResult} />
                                <button onClick={() => handleVoiceInput('answer')} className={`absolute bottom-3 left-3 text-2xl transition-colors cursor-pointer z-10 ${isListening === 'answer' ? 'text-red-500 animate-pulse' : 'text-gray-400 hover:text-teal-400'}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" /><path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.38v2.62h2.25a.75.75 0 010 1.5h-6a.75.75 0 010-1.5h2.25v-2.62a6.751 6.751 0 01-6-6.38v-1.5a.75.75 0 01.75-.75z" /></svg>
                                </button>
                            </div>
                            
                            {isEvaluating && <p className="text-center text-purple-400 animate-pulse font-bold">AI 튜터가 확인하고 있습니다...</p>}

                            {evaluationResult && (
                                <div className="space-y-6 animate-bounce-in">
                                    <div onClick={handleSpeakOriginal} className="p-5 bg-black/40 rounded-lg border border-gray-600 text-center cursor-pointer transition-all duration-200 active:scale-95 hover:bg-black/50 shadow-md" title="문장 음성으로 듣기">
                                        <p className="text-gray-400 text-sm mb-2 font-bold uppercase tracking-wider flex items-center justify-center gap-2">Original Text<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-4 h-4 transition-colors ${isSpeakingOriginal ? 'text-green-400' : 'opacity-70'}`}><path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" /><path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" /></svg></p>
                                        <p className={`text-2xl font-serif italic transition-colors duration-300 ${isSpeakingOriginal ? 'text-green-400 animate-pulse' : 'text-white'}`}>&quot;{reviewSentence.originalText}&quot;</p>
                                    </div>

                                    <div className={`bg-gray-800/80 p-6 rounded-xl border-2 shadow-2xl backdrop-blur-sm ${evaluationResult.isPass ? 'border-yellow-500/50' : 'border-blue-500/50'}`}>
                                        <div className="text-center mb-6">
                                            <h2 className={`text-xl md:text-2xl font-black drop-shadow-sm ${evaluationResult.isPass ? 'text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500' : 'text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-blue-500'}`}>
                                                {evaluationResult.quickPraise}
                                            </h2>
                                        </div>
                                        <div className="bg-gray-900/50 p-5 rounded-lg border border-gray-700/50">
                                            <h4 className="text-gray-400 text-sm font-bold mb-3 flex items-center gap-2"><span>💡 AI 튜터의 피드백</span></h4>
                                            <p className="text-gray-100 text-base md:text-lg leading-relaxed whitespace-pre-wrap">{evaluationResult.feedback}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {evaluationResult && evaluationResult.similarSentences && evaluationResult.similarSentences.length > 0 && (
                                <div className="space-y-4 mt-8 border-t border-gray-700 pt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">🚀 유사한 문장</h3>
                                    <div className="bg-gray-800/50 p-5 rounded-xl border border-gray-700">
                                        <ul className="space-y-3">
                                            {evaluationResult.similarSentences.map((sentenceObj, idx) => {
                                                const isSaved = savedExtendedItems[`similar-${idx}`];
                                                const isActive = activeExtendedItem?.type === 'similar' && activeExtendedItem?.index === idx;
                                                const isSpeaking = speakingItem?.type === 'similar' && speakingItem?.index === idx;
                                                return (
                                                    <li key={idx} className="relative mb-3">
                                                        <div className="flex w-full bg-gray-700 rounded-lg overflow-hidden border border-gray-600 shadow-sm hover:border-yellow-400 transition-colors">
                                                            <div className={`flex-1 p-4 cursor-pointer flex items-center ${isActive ? 'bg-gray-600' : 'hover:bg-gray-600'} transition-colors`} onClick={(e) => handleItemClick(e, 'similar', idx, sentenceObj.en)}>
                                                                <span className={`text-sm text-gray-200 ${isSaved ? 'opacity-50' : ''}`}>
                                                                    {sentenceObj.en} {sentenceObj.ko && <span className="text-gray-400">({sentenceObj.ko})</span>}
                                                                </span>
                                                                {isSaved && <span className="ml-2 text-green-400 text-xs font-bold whitespace-nowrap">✅ 저장됨</span>}
                                                            </div>
                                                            <div className="w-[60px] border-l border-gray-600 flex items-center justify-center cursor-pointer hover:bg-gray-600 transition-colors shrink-0 bg-gray-700/50" onClick={(e) => handleSpeak(e, sentenceObj.en, 'similar', idx)}>
                                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-6 h-6 ${isSpeaking ? 'text-green-400 animate-pulse' : 'text-gray-400 hover:text-white'}`}><path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" /><path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" /></svg>
                                                            </div>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                </div>
                            )}

                            <div className="w-full pt-4 border-t border-gray-700">
                                <div className="flex justify-between items-center mt-6 relative gap-3">
                                    {/* 🚀 [Phase 6] 오답 노트 문장일 경우 평가 완료 후 전용 버튼 표시 */}
                                    {reviewSentence.isQuizIncorrect && evaluationResult ? (
                                        <>
                                            <button onClick={() => setDeleteTargetId(reviewSentence.id)} className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-black rounded-lg transition shadow-md text-base md:text-lg">삭제</button>
                                            <button onClick={() => handleSetCooldown('remove_wrong')} className="flex-1 py-3 bg-teal-600 hover:bg-teal-500 text-white font-black rounded-lg transition shadow-md text-base md:text-lg whitespace-nowrap">오답노트에서 빼기</button>
                                        </>
                                    ) : (
                                        <>
                                            <button onClick={(e) => handleEnterEditMode(e, reviewSentence)} disabled={!evaluationResult} className="w-32 py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-lg transition disabled:opacity-50">수정</button>
                                            {evaluationResult ? (
                                                <button onClick={() => setIsCooldownModalOpen(true)} className="w-32 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold rounded-lg hover:opacity-90 transition shadow-lg glow-purple">쿨다운 설정</button>
                                            ) : (
                                                <button onClick={() => handleSubmitAnswer(false)} disabled={isEvaluating || !userAnswer.trim()} className="w-32 py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold rounded-lg hover:opacity-90 transition disabled:opacity-50 shadow-lg">{isEvaluating ? '평가 중...' : 'AI 평가'}</button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                            </div>
                        )
                        ) : (
                        <div className="text-center py-20 animate-in fade-in zoom-in">
                            <p className="text-gray-400 text-xl mb-4">현재 매핑할 문장이 없습니다. 🥳</p>
                            {reviewSourceFilter !== 'all' ? (
                                <>
                                    <p className="text-pink-400 text-sm mb-6">선택한 필터에 해당하는 문장을 모두 학습했거나 찾을 수 없어요!</p>
                                    <button onClick={() => { handleReviewFilterChange('all'); }} className="px-6 py-3 bg-pink-600 hover:bg-pink-500 rounded-lg text-white font-bold transition shadow-lg">전체 문장 매핑하기</button>
                                </>
                            ) : (
                                <button onClick={() => { setActiveTab('add'); }} className="px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg text-white font-bold transition shadow-lg">새 문장 추가하러 가기</button>
                            )}
                        </div>
                        )}
                    </div>
                  </div>
                  )
                )}

                {/* TAB 3: LIBRARY */}
                {activeTab === 'library' &&  (
                    <div className={`p-6 md:p-8 rounded-lg shadow-xl border animate-in fade-in duration-300 transition-all ${isQuizMode && userData?.role === 'teacher' ? 'bg-gray-800/90 border-orange-500/50 shadow-[0_0_30px_rgba(249,115,22,0.15)]' : 'bg-gray-800 border-gray-700'}`}>
                        <div ref={libraryTopRef} />

                        {userData?.role === 'parent' || userData?.role === 'teacher' ? (
                            isCoMappingMode ? (
                                <div className="mb-6 w-full flex flex-col items-center">
                                    {renderScoreBoard()}
                                    <h2 className="text-xl md:text-2xl font-bold text-teal-400 animate-pulse mt-2">🎯 다음 퀴즈 문장을 골라주세요</h2>
                                    <p className="text-gray-400 text-sm mt-1 mb-4">선택 즉시 자녀 화면에 번역문이 뜹니다.</p>
                                </div>
                            ) : (
                                <div className="flex mb-6 w-full gap-3">
                                    {/* 🚀 [Phase 7] 텍스트 간소화 및 세로 정렬(퀴즈 모드 버튼과 통일) */}
                                    <div className="flex-1 bg-gray-700/50 rounded-xl p-3 md:p-4 border border-gray-600 shadow-inner flex flex-col items-center justify-center gap-1 transition-all">
                                        <span className="text-teal-400 font-bold text-sm md:text-base">등록 문장</span>
                                        <span className="text-xl md:text-2xl font-black text-white">{librarySentences.length}</span>
                                    </div>

                                    {/* 🚀 [Phase 1] 퀴즈 모드 토글 버튼 추가 */}
                                    {userData?.role === 'teacher' && (
                                        <div
                                            onClick={() => setIsQuizMode(!isQuizMode)}
                                            className={`flex-1 rounded-xl p-3 md:p-4 border shadow-inner flex flex-col items-center justify-center gap-1 cursor-pointer transition-all duration-300 ${isQuizMode ? 'bg-orange-500/20 border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.3)]' : 'bg-gray-700/50 border-gray-600 hover:border-orange-500/30'}`}
                                        >
                                            <span className={`font-bold text-sm md:text-base ${isQuizMode ? 'text-orange-400' : 'text-gray-400'}`}>
                                                {isQuizMode ? '🔥 퀴즈 모드' : '⚡ 퀴즈 모드'}
                                            </span>
                                            <span className={`text-xl md:text-2xl font-black ${isQuizMode ? 'text-orange-400 animate-pulse' : 'text-gray-400'}`}>
                                                {isQuizMode ? 'ON' : 'OFF'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )
                        ) : (
                            <div className="flex mb-6 w-full gap-2 md:gap-3">
                                {/* 🚀 [Phase 6] 학생 라이브러리 상단 대시보드 4단 개편 (오답 노트 박스 추가) */}
                                <div onClick={() => setLibraryFilter('all')} className={`flex-1 rounded-xl p-2 border shadow-inner flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${libraryFilter === 'all' ? 'bg-teal-600 border-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.4)]' : 'bg-gray-700/50 border-gray-600 hover:border-teal-500/30'}`}>
                                    <span className={`font-bold text-[10px] md:text-xs whitespace-nowrap ${libraryFilter === 'all' ? 'text-white' : 'text-teal-400'}`}>등록 문장 {libraryFilter === 'all' && '✓'}</span>
                                    <span className="text-lg md:text-xl font-black text-white">{totalSentenceCount}</span>
                                </div>
                                <div onClick={() => setLibraryFilter('ready')} className={`flex-1 rounded-xl p-2 border shadow-inner flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${libraryFilter === 'ready' ? 'bg-blue-600 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.4)]' : 'bg-gray-700/50 border-gray-600 hover:border-blue-500/30'}`}>
                                    <span className={`font-bold text-[10px] md:text-xs whitespace-nowrap ${libraryFilter === 'ready' ? 'text-white' : 'text-blue-400'}`}>매핑 가능 {libraryFilter === 'ready' && '✓'}</span>
                                    <span className={`text-lg md:text-xl font-black ${libraryFilter === 'ready' ? 'text-white' : 'text-blue-400'}`}>{readyCount}</span>
                                </div>
                                {/* 🚀 [권한 분리] 학생일 때만 오답 노트 박스 표시 */}
                                {userData?.role === 'student' && (
                                    <div onClick={() => setLibraryFilter('wrong')} className={`flex-1 rounded-xl p-2 border shadow-inner flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${libraryFilter === 'wrong' ? 'bg-red-600 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'bg-gray-700/50 border-gray-600 hover:border-red-500/30'}`}>
                                        <span className={`font-bold text-[10px] md:text-xs whitespace-nowrap ${libraryFilter === 'wrong' ? 'text-white' : 'text-red-400'} ${wrongCount > 0 && libraryFilter !== 'wrong' ? 'animate-pulse' : ''}`}>오답 노트 {libraryFilter === 'wrong' && '✓'}</span>
                                        <span className={`text-lg md:text-xl font-black ${libraryFilter === 'wrong' ? 'text-white' : 'text-red-400'}`}>{wrongCount}</span>
                                    </div>
                                )}
                                <div onClick={() => setLibraryFilter('mastered')} className={`flex-1 rounded-xl p-2 border shadow-inner flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${libraryFilter === 'mastered' ? 'bg-yellow-600 border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.4)]' : 'bg-gray-700/50 border-gray-600 hover:border-yellow-500/30'}`}>
                                    <span className={`font-bold text-[10px] md:text-xs whitespace-nowrap ${libraryFilter === 'mastered' ? 'text-white' : 'text-yellow-400'}`}>마스터 {libraryFilter === 'mastered' && '✓'}</span>
                                    <span className={`text-lg md:text-xl font-black ${libraryFilter === 'mastered' ? 'text-white' : 'text-yellow-400'}`}>{masteredCount}</span>
                                </div>
                            </div>
                        )}

                        <input type="text" placeholder="검색할 단어나 문장을 입력하세요..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full p-4 mb-6 bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 text-black text-sm placeholder-gray-500" />
                        
                        {isLoadingLibrary ? (
                          <p className="text-center text-gray-400 py-10">문장들을 불러오는 중입니다...</p>
                        ) : filteredLibrarySentences.length > 0 ? (
                            <div className="space-y-4">
                                {filteredLibrarySentences.map((sentence, index) => {
                                    const cooldown = getCooldownStatus(sentence);
                                    const isSelected = selectedLibrarySentenceId === sentence.id;
                                    const isTransferSelected = selectedForTransfer.includes(sentence.id);

                                    // 🚀 [Phase 6] 선생님이 보낸 일반 문장(숙제)을 포함해, 학생 라이브러리에 있는 모든 문장에 대한 주도권(점 3개) 완전 개방
                                    let showThreeDots = true;

                                    return (
                                        <div key={`${sentence.id}-${index}`} className="overflow-hidden rounded-lg">
                                            <div 
                                                onPointerDown={(e) => handleTransferPointerDown(e, sentence.id)}
                                                onPointerUp={handleTransferPointerUpOrLeave}
                                                onPointerLeave={handleTransferPointerUpOrLeave}
                                                onClick={(e) => {
                                                    if (isLongPressTriggeredRef.current) {
                                                        e.preventDefault();
                                                        return;
                                                    }
                                                    if (isCoMappingMode && userData?.role === 'parent') {
                                                        handleStartCoMapQuiz(sentence);
                                                    } else if (userData?.role === 'teacher' && selectedForTransfer.length > 0) {
                                                        setSelectedForTransfer(prev => prev.includes(sentence.id) ? prev.filter(id => id !== sentence.id) : [...prev, sentence.id]);
                                                    }
                                                }} 
                                                className={`bg-gray-700 p-4 cursor-pointer border-2 transition-all duration-200 relative ${isCoMappingMode ? 'hover:border-teal-500 border-gray-500 border-dashed animate-pulse' : isTransferSelected ? 'border-indigo-400 bg-indigo-900/30 shadow-[0_0_15px_rgba(99,102,241,0.4)]' : isSelected ? 'border-teal-500 shadow-[0_0_15px_rgba(20,184,166,0.3)]' : 'border-transparent hover:border-teal-500/50'}`}
                                            >
                                                {isTransferSelected && (
                                                    <div className={`absolute top-3 left-3 w-6 h-6 rounded-full flex items-center justify-center text-white font-bold shadow-md animate-in zoom-in z-10 ${isQuizMode && userData?.role === 'teacher' ? 'bg-orange-500' : 'bg-indigo-500'}`}>✓</div>
                                                )}

                                                <div className="flex flex-col">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <p className={`text-white font-medium text-lg mb-3 transition-all ${isTransferSelected ? 'pl-8' : ''}`}>
                                                            {(userData?.role === 'parent' || userData?.role === 'teacher') && sentence.needsRetry && <span className="text-red-500 mr-2 text-base" title="재도전이 필요한 문장">🚨</span>}
                                                            {sentence.originalText}
                                                        </p>
                                                        
                                                        {showThreeDots && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setSelectedLibrarySentenceId(isSelected ? null : sentence.id); }}
                                                                className="text-gray-400 hover:text-white p-1 transition-colors shrink-0"
                                                                title="문장 옵션"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </div>
                                                    
                                                    {userData?.role === 'teacher' ? (
                                                        <div className="flex w-full items-center justify-end mt-1">
                                                            {sentence.isAssigned === false ? (
                                                                <span className="px-3 py-1 text-xs font-bold rounded-full text-gray-400 bg-gray-700/50 flex items-center border border-gray-600">
                                                                    전송 대기
                                                                </span>
                                                            ) : (
                                                                <span className="px-3 py-1 text-xs font-bold rounded-full text-indigo-200 bg-indigo-900/50 flex items-center border border-indigo-700/50">
                                                                    전송 완료
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="flex w-full items-center justify-between mt-1">
                                                            <div className="flex-1 flex justify-start h-6">
                                                                {userData?.role !== 'parent' && !sentence.isMastered && (
                                                                    <span className="px-3 py-1 text-xs font-bold rounded-full text-white shadow-sm bg-blue-500 flex items-center">
                                                                        {cooldown.text}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex-1 flex justify-center h-6">
                                                                <span className="px-3 py-1 text-xs font-bold rounded-full text-gray-800 shadow-sm bg-gray-300 flex items-center whitespace-nowrap">
                                                                    {sentence.recallCount || 0}회 매핑
                                                                </span>
                                                            </div>
                                                            <div className="flex-1 flex justify-end h-6">
                                                                {sentence.isMastered && (
                                                                    <span className="px-3 py-1 text-xs font-bold rounded-full text-yellow-900 shadow-sm bg-yellow-400 flex items-center">
                                                                        마스터
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {isSelected && !isCoMappingMode && (
                                                isEditing && editingSentence?.id === sentence.id ? (
                                                   <div className="p-6 bg-gray-750 border-x-2 border-b-2 border-teal-500 border-t-0 rounded-b-lg space-y-4 animate-in slide-in-from-top-2">
                                                          <h3 className="text-xl font-bold mb-2 text-teal-400">문장 수정하기</h3>
                                                          <div className="relative"><textarea value={editOriginalText} onChange={(e) => setEditOriginalText(e.target.value)} className="w-full py-4 pl-3 pr-12 bg-gray-600 border border-gray-500 rounded-md focus:ring-2 focus:ring-teal-500 text-white" rows={3}/>
                                                           <button onClick={() => handleVoiceInput('editOriginal')} className={`absolute bottom-3 right-3 text-2xl transition-colors cursor-pointer ${isListening === 'editOriginal' ? 'text-red-500 animate-pulse' : 'text-gray-400 hover:text-teal-400'}`}>
                                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" /><path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.38v2.62h2.25a.75.75 0 010 1.5h-6a.75.75 0 010-1.5h2.25v-2.62a6.751 6.751 0 01-6-6.38v-1.5a.75.75 0 01.75-.75z" /></svg>
                                                           </button>
                                                        </div>
                                                        <div className="relative mt-2"><textarea value={editUserContext} onChange={(e) => setEditUserContext(e.target.value)} className="w-full py-4 pl-3 pr-12 bg-gray-600 border border-gray-500 rounded-md focus:ring-2 focus:ring-teal-500 text-white" rows={2} placeholder="(선택) 상황이나 의미를 입력하세요..."/>
                                                       <button onClick={() => handleVoiceInput('editContext')} className={`absolute bottom-3 right-3 text-2xl transition-colors cursor-pointer ${isListening === 'editContext' ? 'text-red-500 animate-pulse' : 'text-gray-400 hover:text-teal-400'}`}>
                                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" /><path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.38v2.62h2.25a.75.75 0 010 1.5h-6a.75.75 0 010-1.5h2.25v-2.62a6.751 6.751 0 01-6-6.38v-1.5a.75.75 0 01.75-.75z" /></svg>
                                                        </button>
                                                        </div>
                                                        <div className="flex justify-end space-x-3 mt-4"><button onClick={handleCancelEdit} className="px-5 py-2 bg-gray-500 hover:bg-gray-400 text-white font-bold rounded-lg transition">취소</button><button onClick={handleSaveUpdate} className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-lg transition shadow-md">저장</button></div>
                                                    </div>
                                                ) : (
                                                <div className="flex flex-wrap justify-end items-stretch gap-2 p-2 md:p-3 bg-gray-800/80 border-x-2 border-b-2 border-teal-500 border-t-0 rounded-b-lg relative z-50 animate-in slide-in-from-top-1" onClick={(e) => e.stopPropagation()}>
                                                    {sentence.isQuizIncorrect ? (
                                                        // 🚀 [Phase 6] 오답 노트일 경우: 삭제 / 오답노트에서 빼기 버튼 표시
                                                        <>
                                                            <button onClick={(e) => { e.stopPropagation(); handleRequestDelete(e, sentence.id); }} className="flex items-center justify-center px-3 md:px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition shadow-sm text-sm whitespace-nowrap flex-1 md:flex-none">
                                                                삭제
                                                            </button>
                                                            <button onClick={(e) => handleSaveToRegular(e, sentence.id)} className="flex items-center justify-center px-3 md:px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-lg transition shadow-sm text-sm whitespace-nowrap flex-1 md:flex-none">
                                                                오답노트에서 빼기
                                                            </button>
                                                        </>
                                                    ) : (
                                                        // 🚀 일반 문장일 경우: 기존 버튼들 (레이아웃 깨짐 방지 반응형 적용)
                                                        <>
                                                            <button onClick={(e) => handleEnterEditMode(e, sentence)} className="flex items-center justify-center px-3 md:px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition shadow-sm text-sm whitespace-nowrap flex-1 md:flex-none">수정</button>
                                                            
                                                            {userData?.role !== 'teacher' && userData?.role !== 'parent' && (
                                                                sentence.isMastered ? (
                                                                    unlockedMasters[sentence.id] ? (
                                                                        <button onClick={(e) => handleResetCooldown(e, sentence.id)} className="px-3 md:px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition shadow-sm flex items-center justify-center text-center text-sm whitespace-nowrap animate-pulse flex-1 md:flex-none">
                                                                            마스터 해제 확인
                                                                        </button>
                                                                    ) : (
                                                                        <button onClick={(e) => { e.stopPropagation(); setUnlockedMasters(prev => ({...prev, [sentence.id]: true})); }} className="px-3 md:px-4 py-2 bg-gray-500 hover:bg-gray-400 text-white font-bold rounded-lg transition shadow-sm flex items-center justify-center text-center text-sm whitespace-nowrap flex-1 md:flex-none">
                                                                            🔒 쿨다운 잠금해제
                                                                        </button>
                                                                    )
                                                                ) : (
                                                                    <button onClick={(e) => handleResetCooldown(e, sentence.id)} disabled={cooldown.color === 'green'} className="px-3 md:px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition shadow-sm flex items-center justify-center text-center text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex-1 md:flex-none">
                                                                        쿨다운 초기화
                                                                    </button>
                                                                )
                                                            )}

                                                            {userData?.role === 'parent' ? (
                                                                <button 
                                                                    onClick={(e) => { 
                                                                        if ((sentence.recallCount || 0) === 0) handleRequestDelete(e, sentence.id); 
                                                                    }} 
                                                                    disabled={(sentence.recallCount || 0) > 0}
                                                                    className={`flex items-center justify-center px-3 md:px-4 py-2 text-white font-bold rounded-lg transition shadow-sm text-sm whitespace-nowrap flex-1 md:flex-none ${
                                                                        (sentence.recallCount || 0) > 0 
                                                                        ? 'bg-gray-600 cursor-not-allowed' 
                                                                        : 'bg-red-600 hover:bg-red-500 cursor-pointer active:scale-95'
                                                                    }`}
                                                                    title={(sentence.recallCount || 0) > 0 ? '자녀가 이미 학습을 시작한 문장은 삭제할 수 없습니다.' : '문장 삭제'}
                                                                >
                                                                    삭제
                                                                </button>
                                                            ) : (
                                                                <button onClick={(e) => handleRequestDelete(e, sentence.id)} className="flex items-center justify-center px-3 md:px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition shadow-sm cursor-pointer active:scale-95 text-sm whitespace-nowrap flex-1 md:flex-none">삭제</button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                             )
                                            )}
                                        </div>
                                     );
                                })}
                            </div>
                        ) : (
                            <p className="text-center text-gray-400 py-10 text-lg">{searchQuery ? "검색 결과가 없습니다." : (libraryFilter === 'mastered' ? "마스터한 문장이 없습니다." : libraryFilter === 'ready' ? "현재 매핑 가능한 문장이 없습니다." : "저장된 문장이 없습니다.")}</p>
                        )}
                        
                        {userData?.role === 'parent' ? (
                            <div className="mt-8 pt-6 border-t border-gray-700">
                                <button onClick={handleToggleCoMappingMode} className={`w-full py-4 ${isCoMappingMode ? 'bg-gray-600 text-gray-300' : 'bg-gradient-to-r from-teal-600 to-blue-600 text-white'} font-bold rounded-xl shadow-lg transition transform hover:scale-[1.02] active:scale-95 text-lg`}>
                                    {isCoMappingMode ? '취소' : '🤝 함께 매핑 퀴즈 시작'}
                                </button>
                            </div>
                        ) : userData?.role === 'teacher' ? (
                            <div className="mt-8 pt-6 border-t border-gray-700 flex flex-col md:flex-row gap-3 relative">
                                
                                {/* 🚀 모드에 따라 하단 버튼 동적 렌더링 스위칭 */}
                                {isQuizMode ? (
                                    <button 
                                        onClick={() => {
                                            if (selectedForTransfer.length === 0) {
                                                alert("퀴즈로 출제할 문장을 선택해 주세요.");
                                                return;
                                            }
                                            
                                            handleOpenLiveQuizPreview();
                                        }} 
                                        className={`flex-1 py-4 font-black rounded-xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-95 text-lg flex items-center justify-center gap-2 ${selectedForTransfer.length > 0 ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.4)] animate-pulse' : 'bg-gray-600 text-gray-400'}`}
                                    >
                                        <span className="text-2xl">🔥</span> 
                                        {selectedForTransfer.length > 0 ? `${selectedForTransfer.length}개 문장 퀴즈 시작` : '문장을 선택하세요 (퀴즈 모드)'}
                                    </button>
                                ) : (
                                    <button onClick={handleAssignSentences} className={`flex-1 py-3 md:py-4 font-bold rounded-xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 ${(selectedForTransferStudents.length > 0 || selectedForTransfer.length > 0) ? 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white animate-pulse' : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white'}`}>
                                        <span className="text-xl md:text-2xl">🚀</span> 
                                        {/* 🚀 [Phase 8] 전송 대상/문장 개수 박스로 시각적 강조 */}
                                        <div className="flex items-center gap-1.5 whitespace-nowrap text-sm md:text-lg">
                                            <span className="bg-white/25 text-white px-2 py-0.5 rounded border border-white/40 font-black shadow-sm">
                                                {selectedForTransferStudents.length > 0 ? `${selectedForTransferStudents.length}명` : '전체'}
                                            </span>
                                            <span>학생에게</span>
                                            <span className="bg-white/25 text-white px-2 py-0.5 rounded border border-white/40 font-black shadow-sm">
                                                {selectedForTransfer.length > 0 ? `${selectedForTransfer.length}개` : '전체'}
                                            </span>
                                            <span>문장 전송</span>
                                        </div>
                                    </button>
                                )}

                            </div>
                        ) : (
                            <div className="mt-8 pt-6 border-t border-gray-700">
                                <button onClick={handleResetAllCooldowns} className="w-full py-4 bg-gradient-to-r from-green-600 to-teal-600 hover:opacity-90 text-white font-bold rounded-xl shadow-lg transition transform hover:scale-[1.02] active:scale-95 text-lg">전체 쿨다운 해제 (마스터 제외)</button>
                            </div>
                        )}

                        <button onClick={handleSmartScroll} className="fixed bottom-8 left-1/2 transform -translate-x-1/2 p-3 bg-gray-700/50 hover:bg-gray-600/80 text-white/70 hover:text-white rounded-full backdrop-blur-md transition-all duration-300 z-50 border border-white/10 shadow-lg" title={isAtBottom ? "맨 위로 이동" : "맨 아래로 이동"}>
                            {isAtBottom ? (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>) : (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>)}
                        </button>
                        <div ref={libraryBottomRef} className="h-4" /> 
                    </div>
                )}
            </div>
          )}
        </>
      )}

      {/* =======================================================================
          🚀 공통 모달 영역
          ======================================================================= */}
       
      {deleteTargetId && (
        <div className="fixed inset-0 bg-black/90 flex justify-center items-center z-[150] p-4 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-md border-2 border-red-500/50 shadow-2xl animate-in zoom-in duration-200">
                <h3 className="text-2xl font-bold text-red-500 text-center mb-4">⚠️ 문장 삭제</h3>
                <p className="text-gray-300 text-center text-lg mb-8">정말로 이 문장을 삭제하시겠습니까?<br/><span className="text-sm text-gray-500">(삭제된 문장은 복구할 수 없습니다)</span></p>
                <div className="flex space-x-4"><button onClick={handleCancelDelete} className="flex-1 py-4 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition">취소</button><button onClick={handleConfirmDelete} className="flex-1 py-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition shadow-lg shadow-red-600/20">삭제하기</button></div>
            </div>
        </div>
      )}

      {isRetryModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-[200] p-4 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-xs border-2 border-orange-500/50 shadow-2xl animate-in zoom-in duration-200 text-center">
                <h3 className="text-xl font-bold text-white mb-6">에러 발생!! 다시 시도할까요?</h3>
                <div className="flex space-x-3"><button onClick={() => setIsRetryModalOpen(false)} className="flex-1 py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-xl transition">NO</button><button onClick={handleConfirmRetry} className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-pink-600 text-white font-bold rounded-xl transition shadow-lg">OK</button></div>
            </div>
        </div>
      )}
      
      {/* 🚀 [Phase 5] AI 오답 숙제 미리보기 및 검수 모달 */}
      {remedialPreviewData && (
      <div className="fixed inset-0 bg-black/90 flex justify-center items-center z-[9999] p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-gray-800 rounded-3xl p-6 md:p-8 w-full max-w-2xl border-2 border-purple-500 shadow-[0_0_40px_rgba(168,85,247,0.3)] flex flex-col max-h-[90vh]">
              <h3 className="text-2xl md:text-3xl font-black text-purple-400 mb-2 flex items-center gap-3"><span className="text-3xl">👀</span> AI 응용 문장 검수</h3>
              <p className="text-gray-400 text-sm mb-6 border-b border-gray-700 pb-4">AI가 틀린 문장들을 바탕으로 만든 응용 버전입니다. 어색한 부분은 직접 수정할 수 있습니다.</p>

              <div className="space-y-4 flex-1 overflow-y-auto pr-2 no-scrollbar mb-6">
                  {remedialPreviewData.map((item, idx) => (
                      <div key={idx} className="bg-gray-900 p-4 rounded-xl border border-gray-700">
                          <p className="text-pink-400 font-bold text-xs mb-2">응용 문장 {idx + 1}</p>
                          <textarea
                              value={item.aiSentence}
                              onChange={(e) => {
                                  const newData = [...remedialPreviewData];
                                  newData[idx].aiSentence = e.target.value;
                                  setRemedialPreviewData(newData);
                              }}
                              className="w-full bg-gray-800 text-white p-3 rounded-lg border border-gray-600 focus:border-purple-500 outline-none mb-2 font-serif text-lg md:text-xl" rows={2}
                          />
                          <textarea
                              value={item.aiKorean}
                              onChange={(e) => {
                                  const newData = [...remedialPreviewData];
                                  newData[idx].aiKorean = e.target.value;
                                  setRemedialPreviewData(newData);
                              }}
                              className="w-full bg-gray-800 text-gray-300 p-3 rounded-lg border border-gray-600 focus:border-purple-500 outline-none text-sm md:text-base" rows={2}
                          />
                      </div>
                  ))}
              </div>

              <div className="flex flex-col md:flex-row gap-3 pt-4 border-t border-gray-700">
                  <button onClick={() => setRemedialPreviewData(null)} className="flex-1 py-4 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-xl transition text-lg shadow-md">취소</button>
                  <button onClick={handleDispatchRemedialHomework} className="flex-[2] py-4 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 text-white font-black rounded-xl transition shadow-[0_0_15px_rgba(236,72,153,0.4)] text-lg active:scale-95 flex items-center justify-center gap-2">✅ 학생들에게 숙제 배달하기</button>
              </div>
          </div>
      </div>
      )}
      
      {isParentInviteModalOpen && (
        <div className="fixed inset-0 bg-black/90 flex justify-center items-center z-[250] p-4 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-sm border-2 border-indigo-500/50 shadow-2xl text-center animate-in zoom-in duration-200">
                <h3 className="text-2xl font-bold text-indigo-400 mb-4">🔗 자녀 초대 코드</h3>
                <p className="text-gray-400 mb-6 text-sm leading-relaxed">자녀의 기기에서 학생으로 로그인한 뒤,<br/>아래 6자리 코드를 입력하게 해주세요.</p>
                <div className="w-full p-4 mb-6 bg-gray-700 border border-gray-600 rounded-xl text-3xl font-bold tracking-[0.5em] text-white shadow-inner">{userData?.inviteCode || "발급 중..."}</div>
                <button onClick={() => setIsParentInviteModalOpen(false)} className="w-full py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-xl transition">닫기</button>
            </div>
        </div>
      )}

      {isLinkModalOpen && (
        <div className="fixed inset-0 bg-black/90 flex justify-center items-center z-[250] p-4 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-sm border-2 border-teal-500/50 shadow-2xl animate-in zoom-in duration-200">
                <h3 className="text-2xl font-bold text-teal-400 text-center mb-4">🔗 부모님 연동하기</h3>
                <p className="text-gray-400 text-center mb-6 text-sm leading-relaxed">부모님 앱에서 발급받은 <br/>6자리 초대 코드를 입력해 주세요.</p>
                <input type="text" value={inviteCodeInput} onChange={(e) => setInviteCodeInput(e.target.value.replace(/[^0-9]/g, ''))} placeholder="000000" maxLength={6} className="w-full p-4 mb-6 bg-gray-700 border border-gray-600 rounded-xl text-center text-3xl font-bold tracking-[0.5em] text-white focus:ring-2 focus:ring-teal-500 outline-none" />
                <div className="flex space-x-3"><button onClick={() => { setIsLinkModalOpen(false); setInviteCodeInput(''); }} className="flex-1 py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-xl transition">취소</button><button onClick={handleLinkWithParent} className="flex-1 py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl transition shadow-lg shadow-teal-600/20">연동하기</button></div>
            </div>
        </div>
      )}

      {isCreateClassModalOpen && (
        <div className="fixed inset-0 bg-black/90 flex justify-center items-center z-[250] p-4 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-sm border-2 border-yellow-500/50 shadow-2xl text-center animate-in zoom-in duration-200">
                <h3 className="text-2xl font-bold text-yellow-400 mb-4">🏫 새 클래스 만들기</h3>
                <p className="text-gray-400 mb-6 text-sm">학생들을 초대할 방 이름을 입력하세요.</p>
                <input type="text" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="예: 월수금 기초반" className="w-full p-4 mb-6 bg-gray-700 border border-gray-600 rounded-xl text-center text-xl font-bold text-white focus:ring-2 focus:ring-yellow-500 outline-none" />
                <div className="flex space-x-3">
                    <button onClick={() => { setIsCreateClassModalOpen(false); setNewClassName(''); }} className="flex-1 py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-xl transition">취소</button>
                    <button onClick={handleCreateClass} className="flex-1 py-3 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded-xl transition shadow-lg">만들기</button>
                </div>
            </div>
        </div>
      )}

      {isClassLinkModalOpen && (
        <div className="fixed inset-0 bg-black/90 flex justify-center items-center z-[250] p-4 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-sm border-2 border-teal-500/50 shadow-2xl animate-in zoom-in duration-200">
                <h3 className="text-2xl font-bold text-teal-400 text-center mb-4">🏫 클래스 가입하기</h3>
                <p className="text-gray-400 text-center mb-6 text-sm">선생님이 알려주신 6자리 코드와<br/>자신의 실제 이름을 입력해 주세요.</p>
                <input type="text" value={classCodeInput} onChange={(e) => setClassCodeInput(e.target.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase())} placeholder="입장 코드 6자리" maxLength={6} className="w-full p-4 mb-4 bg-gray-700 border border-gray-600 rounded-xl text-center text-2xl font-bold tracking-widest text-white focus:ring-2 focus:ring-teal-500 outline-none" />
                <input type="text" value={realNameInput} onChange={(e) => setRealNameInput(e.target.value)} placeholder="실제 이름 (예: 홍길동)" className="w-full p-4 mb-6 bg-gray-700 border border-gray-600 rounded-xl text-center text-lg font-bold text-white focus:ring-2 focus:ring-teal-500 outline-none" />
                <div className="flex space-x-3">
                    <button onClick={() => { setIsClassLinkModalOpen(false); setClassCodeInput(''); setRealNameInput(''); }} className="flex-1 py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-xl transition">취소</button>
                    <button onClick={handleJoinClass} className="flex-1 py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl transition shadow-lg">가입하기</button>
                </div>
            </div>
        </div>
      )}

      {activeExtendedItem && (
          <div className="fixed z-[9999] tooltip-container" style={{ top: activeExtendedItem.position.top, left: activeExtendedItem.position.left, transform: 'translate(-50%, 10px)' }}>
           <button onMouseDown={(e) => { e.stopPropagation(); }} onTouchStart={(e) => { e.stopPropagation(); }} onClick={handleMoveToAddTab} onTouchEnd={handleMoveToAddTab} className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-xl whitespace-nowrap animate-in zoom-in duration-200 border border-purple-400/50 cursor-pointer">저장할까요?</button>
              <div className="w-3 h-3 bg-purple-600 transform rotate-45 absolute left-1/2 -translate-x-1/2 -top-1.5 shadow-sm border-l border-t border-purple-400/50"></div>
          </div>
      )}    

    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading...</div>}>
      <MainContent key={user?.uid || 'guest'} />
    </Suspense>
  );
}