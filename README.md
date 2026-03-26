This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Voz (STT) para el chat IA

La app soporta grabación de voz en el cliente (MediaRecorder) y transcripción en servidor vía `/api/ai/stt`.

### Requisitos servidor

- **ffmpeg** instalado (para convertir `webm` → `wav` 16k mono).
  - Debian/Ubuntu: `apt install ffmpeg`

### Variables de entorno

- `STT_PROVIDER=openai` + `OPENAI_API_KEY=...`
  - Usa OpenAI Audio Transcriptions con `whisper-1` (puede tener coste).
- `STT_PROVIDER=whisper_local` + `WHISPER_COMMAND="... {file} ..."`
  - Ejecuta un comando local. Debe aceptar `{file}` como placeholder al `.wav` y devolver el texto por stdout (o generar un `.txt`).

### STT file size limit

- **Variable**: `MAX_STT_FILE_MB` (MB)
- **Default**: 10
- **Uso**: ajusta este valor si envías audios muy largos; valores pequeños reducen uso de disco/CPU. Reinicia la app tras cambiarlo.

## Llamada de voz (WebSocket streaming)

Opcional: puedes ejecutar un servidor WS independiente para “llamada” en tiempo real (baja latencia).

- **Token efímero**: el cliente pide un token a `POST /api/ai/voice-token` (requiere sesión) y abre WS con `?token=...`.
- **Secret**: `VOICE_WS_SECRET` existe solo en servidor (Next + voice-server). No se expone en `NEXT_PUBLIC_*`.
- **Arranque voice-server**:
  - `cd voice-server && npm install && npm run build && npm start`
  - Requiere `ffmpeg` instalado y `STT_PROVIDER` configurado (igual que `/api/ai/stt`).

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
