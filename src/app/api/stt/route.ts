import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as Blob | null;

        if (!file) {
            return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
        }

        // Preparar form data para OpenAI
        const openAiFormData = new FormData();
        openAiFormData.append('file', file, 'audio.webm');
        openAiFormData.append('model', 'whisper-1');
        openAiFormData.append('language', 'es'); // Optimizamos para español de España/Marbella

        const openAiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: openAiFormData
        });

        if (!openAiResponse.ok) {
            const errorText = await openAiResponse.text();
            console.error('[STT_OPENAI_ERROR]', errorText);
            throw new Error('Error en transcripción de OpenAI');
        }

        const result = await openAiResponse.json();
        return NextResponse.json({ text: result.text });

    } catch (error: any) {
        console.error('[STT_API_ERROR]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
