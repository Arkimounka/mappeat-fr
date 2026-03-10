import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { text, lang } = await req.json();

        // 환경변수에서 Google Cloud API 키를 가져옵니다.
        const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "API key is missing" }, { status: 500 });
        }

        const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;

        // 언어에 맞춘 최고급(Neural2 / Studio) 목소리 세팅
        const voiceName = lang === 'ko-KR' ? 'ko-KR-Neural2-A' : 'en-US-Neural2-F';

        const payload = {
            input: { text },
            voice: { languageCode: lang, name: voiceName },
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