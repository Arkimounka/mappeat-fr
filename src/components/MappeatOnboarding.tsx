'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface OnboardingProps {
  onComplete: () => void;
}

export default function MappeatOnboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  
  const [targetLang, setTargetLang] = useState('외국어');

  useEffect(() => {
    const envLang = process.env.NEXT_PUBLIC_TARGET_LANG;
    const params = new URLSearchParams(window.location.search);
    const urlLang = params.get('lang');

    const hostname = window.location.hostname;
    let hostLang = null;
    if (hostname.startsWith('fr.')) hostLang = 'fr';
    else if (hostname.startsWith('en.')) hostLang = 'en';
    else if (hostname.startsWith('es.')) hostLang = 'es';

    const detectedCode = envLang || urlLang || hostLang || 'default';

    const langMap: Record<string, string> = {
      'fr': '프랑스어',
      'en': '영어',
      'es': '스페인어',
      'default': '외국어'
    };

    setTargetLang(langMap[detectedCode] || '외국어');
  }, []);

  const stepsData = [
    "해석은 쫌 하는데, 왜 말은 잘 안 나올까?\n이런 고민해보신 분?",
    `${targetLang} 정복을 위한 삼각형을 완성해야 합니다. 어떻게?`,
    "한국인이면 'A'는 이미 되어 있겠죠?",
    "또한 한국인이면 'B(해석)'는 열심히\n훈련하고 있겠죠?",
    "문제는 'C(매핑)'입니다.\n매핑이 궁금하세요?",
    `'매핑'은 상황에 맞는 ${targetLang} 표현을 떠올리는 훈련이에요.\n'Mappeat'과 함께 하세요~`
  ];

  const nextStep = () => {
    if (step < 5) setStep(step + 1);
  };

  const isA_Active = step === 2 || step === 5;
  const isB_Active = step === 3 || step === 5;
  const isC_Active = step === 4 || step === 5;

  const isNode1_Active = isA_Active || isC_Active; 
  const isNode2_Active = isA_Active || isB_Active; 
  const isNode3_Active = isB_Active || isC_Active; 

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-gray-900 text-white p-6 overflow-hidden font-sans pt-12">
      
      {/* 상단: 질문 텍스트 및 버튼 */}
      <div className="w-full max-w-md flex flex-col justify-end z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="bg-gray-800 p-6 rounded-2xl rounded-bl-none shadow-lg border border-gray-700 relative flex flex-col"
          >
            <p className="text-xl md:text-2xl font-extrabold leading-relaxed whitespace-pre-wrap break-keep flex-1 mb-4">
              {stepsData[step]}
            </p>

            <div className="flex justify-end mt-2">
              <button 
                onClick={step < 5 ? nextStep : onComplete} 
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg shadow-md transition-colors flex items-center gap-2"
              >
                다음 ➔
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 중앙: 동적 SVG 삼각형 영역 */}
      <div className="w-full max-w-sm flex-1 flex items-center justify-center relative mt-4">
        <AnimatePresence>
          {step > 0 && (
            <motion.svg 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              viewBox="0 0 300 300" 
              className="w-full h-full drop-shadow-2xl"
            >
              <defs>
                <marker id="arrow-gray" orient="auto" markerWidth="6" markerHeight="6" refX="5" refY="3">
                  <path d="M0,0 V6 L6,3 Z" fill="#4b5563" />
                </marker>
                <marker id="arrow-gray-rev" orient="auto-start-reverse" markerWidth="6" markerHeight="6" refX="5" refY="3">
                  <path d="M0,0 V6 L6,3 Z" fill="#4b5563" />
                </marker>
                <marker id="arrow-blue" orient="auto" markerWidth="6" markerHeight="6" refX="5" refY="3">
                  <path d="M0,0 V6 L6,3 Z" fill="#3b82f6" />
                </marker>
                <marker id="arrow-blue-rev" orient="auto-start-reverse" markerWidth="6" markerHeight="6" refX="5" refY="3">
                  <path d="M0,0 V6 L6,3 Z" fill="#3b82f6" />
                </marker>
                <marker id="arrow-red" orient="auto" markerWidth="6" markerHeight="6" refX="5" refY="3">
                  <path d="M0,0 V6 L6,3 Z" fill="#ef4444" />
                </marker>
                <marker id="arrow-green" orient="auto" markerWidth="6" markerHeight="6" refX="5" refY="3">
                  <path d="M0,0 V6 L6,3 Z" fill="#22c55e" />
                </marker>
              </defs>

              <g key={step}>
                
                {/* 선 A 그룹 */}
                <motion.g
                  initial={{ opacity: 0.3 }}
                  animate={{ opacity: isA_Active ? [0.3, 1, 0.3] : 0.3 }}
                  transition={isA_Active ? { repeat: Infinity, duration: 1.2, ease: "easeInOut" } : { duration: 0 }}
                >
                  <line
                    x1="130" y1="75" x2="70" y2="195"
                    stroke={isA_Active ? "#3b82f6" : "#4b5563"}
                    strokeWidth={isA_Active ? "6" : "3"}
                    markerStart={isA_Active ? "url(#arrow-blue-rev)" : "url(#arrow-gray-rev)"}
                    markerEnd={isA_Active ? "url(#arrow-blue)" : "url(#arrow-gray)"}
                  />
                  <text 
                    x="80" y="135" textAnchor="middle" fill={isA_Active ? "#3b82f6" : "#4b5563"} fontSize="24" fontWeight="bold"
                  >A</text>
                </motion.g>

                {/* 선 B 그룹 */}
                <motion.g
                  initial={{ opacity: 0.3 }}
                  animate={{ opacity: isB_Active ? [0.3, 1, 0.3] : 0.3 }}
                  transition={isB_Active ? { repeat: Infinity, duration: 1.2, ease: "easeInOut" } : { duration: 0 }}
                >
                  <line
                    x1="210" y1="230" x2="90" y2="230"
                    stroke={isB_Active ? "#ef4444" : "#4b5563"}
                    strokeWidth={isB_Active ? "6" : "3"}
                    markerEnd={isB_Active ? "url(#arrow-red)" : "url(#arrow-gray)"}
                  />
                  <text 
                    x="150" y="215" textAnchor="middle" fill={isB_Active ? "#ef4444" : "#4b5563"} fontSize="24" fontWeight="bold"
                  >B</text>
                </motion.g>

                {/* 선 C 그룹 */}
                <motion.g
                  initial={{ opacity: 0.3 }}
                  animate={{ opacity: isC_Active ? [0.3, 1, 0.3] : 0.3 }}
                  transition={isC_Active ? { repeat: Infinity, duration: 1.2, ease: "easeInOut" } : { duration: 0 }}
                >
                  <line
                     x1="170" y1="75" x2="230" y2="195"
                     stroke={isC_Active ? "#22c55e" : "#4b5563"}
                     strokeWidth={isC_Active ? "6" : "3"}
                     strokeDasharray="10, 10"
                  />
                  <line
                     x1="170" y1="75" x2="230" y2="195"
                     stroke="transparent" strokeWidth="6"
                     markerEnd={isC_Active ? "url(#arrow-green)" : "url(#arrow-gray)"}
                  />
                  <text 
                    x="220" y="135" textAnchor="middle" fill={isC_Active ? "#22c55e" : "#4b5563"} fontSize="24" fontWeight="bold"
                  >C</text>
                </motion.g>


                {/* 꼭짓점 1 (상황) */}
                <motion.g
                  initial={{ opacity: isNode1_Active ? 0.5 : 0.4 }}
                  animate={{ opacity: isNode1_Active ? [0.5, 1, 0.5] : 0.4 }}
                  transition={isNode1_Active ? { repeat: Infinity, duration: 1.2, ease: "easeInOut" } : { duration: 0 }}
                >
                  {isNode1_Active && <circle cx="150" cy="40" r="36" fill="none" stroke="#ffffff" strokeWidth="8" filter="blur(8px)" opacity="0.8" />}
                  <circle cx="150" cy="40" r="32" fill="#1f2937" stroke={isNode1_Active ? "#ffffff" : "#4b5563"} strokeWidth={isNode1_Active ? "3" : "2"} />
                  <text x="150" y="46" textAnchor="middle" fill={isNode1_Active ? "#ffffff" : "#9ca3af"} fontSize="14" fontWeight="bold">상황</text>
                </motion.g>

                {/* 꼭짓점 2 (한국어) */}
                <motion.g
                  initial={{ opacity: isNode2_Active ? 0.5 : 0.4 }}
                  animate={{ opacity: isNode2_Active ? [0.5, 1, 0.5] : 0.4 }}
                  transition={isNode2_Active ? { repeat: Infinity, duration: 1.2, ease: "easeInOut" } : { duration: 0 }}
                >
                  {isNode2_Active && <circle cx="50" cy="230" r="36" fill="none" stroke="#ffffff" strokeWidth="8" filter="blur(8px)" opacity="0.8" />}
                  <circle cx="50" cy="230" r="32" fill="#1f2937" stroke={isNode2_Active ? "#ffffff" : "#4b5563"} strokeWidth={isNode2_Active ? "3" : "2"} />
                  <text x="50" y="235" textAnchor="middle" fill={isNode2_Active ? "#ffffff" : "#9ca3af"} fontSize="14" fontWeight="bold">한국어</text>
                </motion.g>

                {/* 꼭짓점 3 (동적 타겟 언어) */}
                <motion.g
                  initial={{ opacity: isNode3_Active ? 0.5 : 0.4 }}
                  animate={{ opacity: isNode3_Active ? [0.5, 1, 0.5] : 0.4 }}
                  transition={isNode3_Active ? { repeat: Infinity, duration: 1.2, ease: "easeInOut" } : { duration: 0 }}
                >
                  {isNode3_Active && <circle cx="250" cy="230" r="36" fill="none" stroke="#ffffff" strokeWidth="8" filter="blur(8px)" opacity="0.8" />}
                  <circle cx="250" cy="230" r="32" fill="#1f2937" stroke={isNode3_Active ? "#ffffff" : "#4b5563"} strokeWidth={isNode3_Active ? "3" : "2"} />
                  <text x="250" y="235" textAnchor="middle" fill={isNode3_Active ? "#ffffff" : "#9ca3af"} fontSize="14" fontWeight="bold">
                    {targetLang}
                  </text>
                </motion.g>

              </g>
            </motion.svg>
          )}
        </AnimatePresence>
      </div>
      
    </div>
  );
}