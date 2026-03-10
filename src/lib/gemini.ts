import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// ⚠️ API 키는 환경변수에서 가져옵니다.
const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
const genAI = new GoogleGenerativeAI(apiKey);

// ✅ gemini-2.0-flash 모델 사용 (속도 및 성능 최적화)
const MODEL_NAME = "gemini-2.0-flash";

// 공통 안전 설정
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// ---------------------------------------------------------------------------
// 🛡️ [최강의 방패] JSON 파싱 방어벽 (마크다운 찌꺼기 완벽 제거)
// ---------------------------------------------------------------------------
function cleanAndParseJSON(text: string) {
  if (!text) throw new Error("AI returned empty response.");
  let cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();

  // 🚀 [Phase 2] 단일 객체({})뿐만 아니라 배열([]) 형태의 JSON도 안전하게 추출하도록 로직 업그레이드
  const firstOpenObj = cleaned.indexOf("{");
  const firstOpenArr = cleaned.indexOf("[");
  const firstOpen = firstOpenObj === -1 ? firstOpenArr : (firstOpenArr === -1 ? firstOpenObj : Math.min(firstOpenObj, firstOpenArr));

  const lastCloseObj = cleaned.lastIndexOf("}");
  const lastCloseArr = cleaned.lastIndexOf("]");
  const lastClose = Math.max(lastCloseObj, lastCloseArr);

  if (firstOpen === -1 || lastClose === -1) {
    throw new Error("No JSON object or array found in the response.");
  }
  
  cleaned = cleaned.substring(firstOpen, lastClose + 1);

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("JSON Parsing failed. Cleaned text was:", cleaned);
    throw new Error("Failed to parse JSON after cleaning.");
  }
}

// ---------------------------------------------------------------------------
// 🎯 평가 결과 타입 정의
// ---------------------------------------------------------------------------
export interface EvaluationResult {
  isPass: boolean;
  quickPraise: string;
  feedback: string;
  similarSentences?: { en: string; ko: string }[];
}

// 🚀 [Step 3] 라이브 퀴즈 데이터 타입 정의
export interface LiveQuizData {
  questionText: string;
  koreanHint: string;
  blankSentence: string;
  options: string[];
  correctAnswerIndex: number;
}

// ---------------------------------------------------------------------------
// 🚀 [기능 1] 학생 문장 평가 (evaluateAnswer) - 프랑스어 맞춤형 튜닝
// ---------------------------------------------------------------------------
export async function evaluateAnswer(
  originalText: string,
  userAnswer: string,
  userContext: string,
  languageCode: string = 'fr',
  studentName: string = '학생'
): Promise<EvaluationResult> {
  if (!apiKey) {
    return { isPass: false, quickPraise: "API Key 누락", feedback: "Gemini API Key가 설정되지 않았습니다." };
  }

  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const prompt = `
    You are a warm, encouraging, and highly precise native French tutor.
    Your student, ${studentName}, is learning to speak natural French.
    
    [TASK]
    Evaluate the 'Student Answer' against the 'Target Sentence' and 'Context'.
    
    [INPUT]
    - Target Sentence (The correct native expression): "${originalText}"
    - Context (Situation/Nuance): "${userContext}"
    - Student Answer: "${userAnswer}"

    [INSTRUCTIONS & RULES]
    1. 🚫 CRITICAL RULE (절대 규칙): 절대 틀린 단어나 어색한 문법을 잘했다고 칭찬하지 마세요! (Never praise wrong words or grammar).
    2. 🛑 ROLE CONFUSION PREVENTION (주체 명확화): 절대 사용자가 작성한 문장(Student Answer)과 원문(Target Sentence)을 혼동하지 마세요. 사용자가 쓰지 않은 원문의 단어를 사용자가 썼다고 착각하여 칭찬하는 것은 치명적인 오류입니다.
    3. 🛑 FRENCH GRAMMAR FOCUS (프랑스어 특화 문법 검증): 명사의 성별 및 수 일치(Gender/number agreement), 동사 변형(Verb conjugations), 그리고 악상 기호(é, è, ç, à, ê 등)의 정확한 사용 여부를 매우 엄격하게 평가하세요.
    4. 🛑 LOGIC CHECK (논리 검증): 문법을 설명할 때는 원문의 주어/동사와 사용자의 주어/동사를 정확히 구분하고, 앞뒤 설명 논리가 모순되지 않는지 반드시 한 번 더 체크하세요.
    5. 🛑 FACT-BASED FEEDBACK (팩트 기반 피드백): 억측이나 과장 없이, 두 문장의 차이점(단어 선택, 스펠링, 프랑스어 문법)을 객관적이고 명확하게 지적하는 데 집중하세요.
    6. Compare the student's answer with the Target Sentence strictly based on the rules above.
    7. If the meaning, nuance, and French grammar are highly natural and effectively convey the intended context, mark 'isPass: true'.
    8. If there are awkward phrasing, grammatical errors (especially gender/conjugation/accents), or contextual mismatches, mark 'isPass: false'.
    9. The feedback must be written in friendly Korean, addressing the student as "${studentName}".
    10. ⚠️ REQUIRED FEEDBACK FORMAT: You MUST structure the 'feedback' string exactly with these TWO headings. Make it detailed but easy to read. Do NOT include an overall assessment (평가 결과) heading here.
    
       **💡 문맥적 분석**
       (Write how well the answer fits the situation/context here)

       **📝 상세 평가**
       (Write specific French grammar and vocabulary feedback here)
       
    11. Generate 2 similar, short, native-level French sentences that fit the same context.

    [JSON OUTPUT TEMPLATE]
    You MUST output ONLY a valid JSON object in the exact format below. Do not include markdown code blocks or any other text.
    {
      "isPass": boolean,
      "quickPraise": "string", // [중요] 이 항목은 전체 평가를 관통하는 '객관적이고 군더더기 없는 1줄 요약'입니다. 감정적인 인사말이나 억지 칭찬은 절대 금지합니다!
                               // - isPass가 true일 때: 객관적이고 명확한 1줄 칭찬 (예: '상황에 딱 맞는 완벽한 복합과거 표현입니다.')
                               // - isPass가 false일 때: 객관적이고 부드러운 1줄 문제점 지적 (예: '동사 변형은 좋았지만, 여성형 명사의 성수 일치가 누락되었습니다.')
      "feedback": "string", // MUST include ONLY the TWO headings mentioned in rule #10 (문맥적 분석, 상세 평가), separated by line breaks (\\n\\n).
      "similarSentences": [
        { "en": "Similar French sentence 1", "ko": "한국어 뜻" },
        { "en": "Similar French sentence 2", "ko": "한국어 뜻" }
      ]
    }
  `;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2, 
        maxOutputTokens: 800,
      },
      safetySettings,
    });
    const responseText = result.response.text();
    return cleanAndParseJSON(responseText) as EvaluationResult;
  } catch (error) {
    console.error("Gemini AI Evaluation Error:", error);
    return {
      isPass: false,
      quickPraise: "⚠️ AI 튜터 통신 에러",
      feedback: "앗! AI 튜터와 연결이 끊어졌어요. 인터넷 상태를 확인하고 잠시 후 다시 시도해주세요. 😭"
    };
  }
}

// ---------------------------------------------------------------------------
// 🚀 [기능 2] 자동 힌트/상황 생성 (generateRecallTrigger) - 프랑스어 맞춤
// ---------------------------------------------------------------------------
export async function generateRecallTrigger(
  originalText: string,
  userContext: string,
  languageCode: string = 'fr'
): Promise<string> {
  if (!apiKey) return "API 키가 설정되지 않아 힌트를 생성할 수 없습니다.";
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const prompt = `
    You are an expert bilingual translator specializing in casual, everyday spoken Korean (구어체).
    
    [TASK]
    Translate the French 'Target Sentence' into natural, conversational Korean.
    If the 'Context' contains specific Korean hints or meanings, you MUST use them in your translation to help the user recall the exact French sentence.
    
    [INPUT]
    Target Sentence: "${originalText}"
    Context / Hint: "${userContext}"

    [RULES]
    1. 🎯 ESSENTIAL: The output must capture the EXACT meaning of the French sentence as a FULL, COMPLETE Korean sentence. Do not just output fragments.
    2. 🧩 CONTEXT INTEGRATION: If 'Context' is provided, you MUST weave that exact Korean word/phrase into the translation.
    3. 🗣️ ONLY SPOKEN CONVERSATION (완벽한 구어체): The output MUST sound like a real person talking naturally to someone else.
    4. 🚫 NO DICTIONARY FORMS (사전형/명사형 종결 금지): NEVER end with dictionary verbs (~하다, ~다) or base nouns (~함). ALWAYS use conversational endings (~어/아., ~해., ~할게., ~야., ~요., ~죠.).
    5. 🚫 STRICT NO FILLER (절대 딴소리 금지): DO NOT add any prefixes. Output absolutely NOTHING but the final translated Korean sentence itself.
    6. **ONLY JSON:** You must output ONLY a valid JSON object matching the template below. No extra explanations.

    [JSON OUTPUT TEMPLATE]
    {
      "trigger": "여기에 완벽하게 번역된 구어체 한국어 문장 딱 하나만 작성하세요. 부연 설명 절대 금지."
    }
  `;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1, 
        maxOutputTokens: 200,
      },
      safetySettings,
    });
    const responseText = result.response.text();
    const parsed = cleanAndParseJSON(responseText);
    return parsed.trigger;
  } catch (error) {
    console.error("Gemini AI Hint Generation Error:", error);
    return "⚠️ 힌트 생성 실패: 잠시 후 다시 시도해주세요.";
  }
}

// ---------------------------------------------------------------------------
// 🚀 [기능 3] 실시간 라이브 퀴즈 다중 생성 (generateLiveQuiz) - 프랑스어 맞춤
// ---------------------------------------------------------------------------
export async function generateLiveQuiz(
  sentences: { originalText: string; userContext: string }[]
): Promise<LiveQuizData[] | null> {
  if (!apiKey) {
    console.error("API Key 누락");
    return null;
  }

  if (!sentences || sentences.length === 0) return [];

  const model = genAI.getGenerativeModel({ model: MODEL_NAME });
  const inputJSON = JSON.stringify(sentences, null, 2);

  const prompt = `
    당신은 프랑스어 단어와 숙어를 가르치는 훌륭한 원어민 프랑스어 선생님입니다.
    아래의 [입력 데이터 (배열)]을 바탕으로, 각 문장마다 학생들을 위한 4지선다형(객관식) 프랑스어 빈칸 채우기 문제를 만들어주세요.

    [입력 데이터]
    ${inputJSON}

    [출력 규칙]
    1. 각 입력된 문장마다 '선생님의 힌트/키워드(userContext)'에 해당하는 핵심 표현(프랑스어 단어 또는 숙어) 부분을 빈칸 ( ____ )으로 뚫어서 문제를 출제하세요. (만약 키워드가 없다면 문장에서 가장 중요한 핵심 프랑스어 단어나 숙어를 빈칸으로 만드세요.)
    2. 각 문제의 보기는 총 4개이며, 1개는 정답, 3개는 아주 그럴싸하고 헷갈리는 오답(유사한 형태의 숙어나 단어, 동사 변형 등)으로 구성하세요. 보기의 배치 순서는 무작위로 섞어주세요.
    3. 'koreanHint'에는 원본 문장의 자연스러운 전체 한국어 해석을 적어주세요.
    4. 앱에서 바로 사용할 수 있도록 반드시 아래의 JSON **배열(Array)** 포맷으로만 출력하세요. (마크다운 등 다른 설명 절대 금지)

    [JSON 출력 포맷 (반드시 배열 형태로 작성)]
    [
      {
        "questionText": "다음 한국어 뜻에 맞게 빈칸에 들어갈 알맞은 프랑스어 표현을 고르시오.",
        "koreanHint": "여기에 자연스러운 한국어 뜻 전체 작성",
        "blankSentence": "빈칸이 ( ____ ) 뚫린 프랑스어 문장",
        "options": ["보기1", "보기2", "보기3", "보기4"],
        "correctAnswerIndex": 1
      }
    ]
  `;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3, 
        maxOutputTokens: 2000, 
      },
      safetySettings,
    });
    const responseText = result.response.text();
    return cleanAndParseJSON(responseText) as LiveQuizData[];
  } catch (error) {
    console.error("Gemini AI Live Quiz Generation Error:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 🚀 [기능 4] 맞춤형 오답 숙제 생성 (generateRemedialHomework) - 프랑스어 맞춤
// ---------------------------------------------------------------------------
export interface RemedialData {
  originalSentenceId: string;
  aiSentence: string;
  aiKorean: string;
}

export async function generateRemedialHomework(
  wrongSentences: { id: string; originalText: string; userContext: string }[]
): Promise<RemedialData[] | null> {
  if (!apiKey || !wrongSentences || wrongSentences.length === 0) return null;

  const model = genAI.getGenerativeModel({ model: MODEL_NAME });
  const inputJSON = JSON.stringify(wrongSentences, null, 2);

  const prompt = `
    You are a creative native French tutor.
    Based on the following JSON array of wrong sentences:
    ${inputJSON}

    For EACH sentence, create ONE similar, natural French sentence that uses the same core vocabulary/idiom or grammatical structure, but in a slightly different everyday context.

    [JSON OUTPUT FORMAT (MUST be an Array)]
    [
      {
        "originalSentenceId": "The 'id' from the input",
        "aiSentence": "The new similar French sentence",
        "aiKorean": "Natural Korean translation of the new sentence"
      }
    ]
  `;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2000 },
      safetySettings,
    });
    const responseText = result.response.text();
    return cleanAndParseJSON(responseText) as RemedialData[];
  } catch (error) {
    console.error("Remedial Homework Generation Error:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 🚀 [기능 5] 학생별 취약점 AI 진단 (analyzeStudentWeakness) - 프랑스어 맞춤
// ---------------------------------------------------------------------------
export async function analyzeStudentWeakness(
  wrongAnswers: { originalText: string; userAnswer: string; hint: string }[],
  dateStr: string
): Promise<string | null> {
  if (!apiKey || !wrongAnswers || wrongAnswers.length === 0) return null;

  const model = genAI.getGenerativeModel({ model: MODEL_NAME });
  const inputJSON = JSON.stringify(wrongAnswers, null, 2);

  const prompt = `
    You are an expert French tutor diagnosing a student's learning gaps.
    Based on the following JSON array of the student's wrong answers from a recent quiz:
    ${inputJSON}

    Analyze their common grammatical, vocabulary, or structural weaknesses (e.g., gender agreements, verb conjugations).
    Create a very concise, 1-2 line diagnostic summary in Korean.
    Start the summary with the date format exactly like this: [${dateStr}]
    Example: "[${dateStr}] 여성형 명사의 성수 일치 오류 및 복합과거 조동사 혼동"

    [JSON OUTPUT TEMPLATE]
    {
      "diagnosis": "Your concise 1-2 line diagnosis here"
    }
  `;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
      safetySettings,
    });
    const responseText = result.response.text();
    const parsed = cleanAndParseJSON(responseText);
    return parsed.diagnosis;
  } catch (error) {
    console.error("Diagnosis Generation Error:", error);
    return null;
  }
}