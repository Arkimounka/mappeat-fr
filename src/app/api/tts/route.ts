import { NextResponse } from 'next/server';

// 🌐 언어별 최고급(Neural2 / Studio) 목소리 매핑 객체 (향후 언어 추가 시 여기만 수정하면 됨)
const VOICE_MAP: Record<string, string> = {
    'ko-KR': 'ko-KR-Neural2-A', // 한국어 (여성)
    'en-US': 'en-US-Neural2-F', // 미국 영어 (여성)
    'fr-FR': 'fr-FR-Neural2-A', // 프랑스어 (여성) - 프랑스어 맵핏을 위한 추가!
    'es-ES': 'es-ES-Neural2-A', // 스페인어 (여성) - 향후 확장을 위한 미리 추가!
};

export async function POST(req: Request) {
    try {
        const { text, lang } = await req.json();

        // 환경변수에서 Google Cloud API 키를 가져옵니다.
        const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "API key is missing" }, { status: 500 });
        }

        const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;

        // 💡 동적 할당 및 예외 처리 (Fallback)
        // 매핑 객체에서 요청받은 언어(lang)에 맞는 목소리 이름을 찾습니다.
        // 만약 우리가 지원하지 않는 언어 코드가 들어왔다면 기본값으로 영어를 사용하도록 안전장치를 둡니다.
        const voiceName = VOICE_MAP[lang] || VOICE_MAP['en-US'];
        const safeLanguageCode = VOICE_MAP[lang] ? lang : 'en-US';

        const payload = {
            input: { text },
            voice: { languageCode: safeLanguageCode, name: voiceName },
            audioConfig: { audioEncoding: 'MP3' }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Google TTS API responded with status ${response.status}`);
        }

        const data = await response.json();
        
        // 생성된 MP3의 Base64 오디오 데이터를 반환합니다.
        return NextResponse.json({ audioContent: data.audioContent });

    } catch (error: any) {
        console.error("TTS API Error:", error);
        return NextResponse.json({ error: "Failed to generate audio" }, { status: 500 });
    }
}