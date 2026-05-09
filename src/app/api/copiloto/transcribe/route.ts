import { NextRequest, NextResponse } from 'next/server';


export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No se recibió ningún archivo de audio' }, { status: 400 });
    }

    // Convertir File a Buffer/Blob para OpenAI
    const whisperData = new FormData();
    whisperData.append('file', file);
    whisperData.append('model', 'whisper-1');
    whisperData.append('language', 'es');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: whisperData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Fallo en OpenAI Whisper');
    }

    const data = await response.json();
    return NextResponse.json({ text: data.text });
  } catch (error: any) {
    console.error('Error en transcripción:', error);
    return NextResponse.json({ error: error.message || 'Error transcribiendo audio' }, { status: 500 });
  }
}
