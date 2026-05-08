'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type TranscriptEvent = {
  role: 'user' | 'assistant'
  text: string
}

export function CopilotVoiceCall() {
  const [isActive, setIsActive] = useState(false)
  const [transcripts, setTranscripts] = useState<TranscriptEvent[]>([])
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)

  async function startCall() {
    setIsActive(true)
    setTranscripts([])

    try {
      const tokenReq = await fetch('/api/copiloto/voice/token')

      if (!tokenReq.ok) {
        let msg = 'No se pudo obtener autorización.'
        try {
          const j = (await tokenReq.json()) as { error?: string }
          if (typeof j?.error === 'string') msg = j.error
        } catch {
          /**/
        }
        throw new Error(msg)
      }

      const { client_secret: clientSecret } = (await tokenReq.json()) as {
        client_secret: string
      }

      const pc = new RTCPeerConnection()
      pcRef.current = pc

      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      audioElRef.current = audioEl
      pc.ontrack = (evt) => {
        audioEl.srcObject = evt.streams[0]
      }

      const ms = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = ms
      ms.getTracks().forEach((track) => pc.addTrack(track, ms))

      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc

      dc.addEventListener('message', (e) => {
        try {
          const event = JSON.parse(e.data as string) as {
            type?: string
            transcript?: string
          }

          if (event.type === 'response.audio_transcript.done') {
            const tx = typeof event.transcript === 'string' ? event.transcript.trim() : ''
            if (!tx) return
            setTranscripts((prev) => [...prev, { role: 'assistant', text: tx }])
          }

          if (event.type === 'conversation.item.input_audio_transcription.completed') {
            const tx = typeof event.transcript === 'string' ? event.transcript.trim() : ''
            if (!tx) return
            setTranscripts((prev) => [...prev, { role: 'user', text: tx }])
          }
        } catch {
          /**/
        }
      })

      dc.addEventListener('error', () => {
        toast.error('Error en el canal de datos de voz.')
      })

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const sdpResponse = await fetch(
        'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
        {
          method: 'POST',
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${clientSecret}`,
            'Content-Type': 'application/sdp',
          },
        }
      )

      if (!sdpResponse.ok) {
        throw new Error('Fallo en la negociación SDP con OpenAI.')
      }

      const answerSdp = await sdpResponse.text()
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('WebRTC copiloto voz:', err)
      toast.error(`No se pudo iniciar la llamada: ${msg}`)
      stopCall()
    }
  }

  function stopCall() {
    setIsActive(false)
    dcRef.current?.close()
    pcRef.current?.close()
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    if (audioElRef.current) {
      audioElRef.current.srcObject = null
    }
    dcRef.current = null
    pcRef.current = null
    localStreamRef.current = null
    audioElRef.current = null
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-zinc-100 bg-white shadow-sm shrink-0',
        'flex flex-col gap-4 p-4 w-full max-w-xl'
      )}
    >
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-zinc-900 tracking-tight">
            Manos libres
          </h3>
          <p className="text-sm text-zinc-500">WebRTC • Baja latencia</p>
        </div>
        {isActive ? (
          <button
            type="button"
            onClick={stopCall}
            className={cn(
              'border border-red-200 bg-red-50 text-red-700 font-medium',
              'px-4 rounded-lg shrink-0 min-h-[48px] min-w-[120px] transition-colors',
              'hover:bg-red-100'
            )}
          >
            Finalizar
          </button>
        ) : (
          <button
            type="button"
            onClick={startCall}
            className={cn(
              'bg-emerald-600 hover:bg-emerald-700 text-white font-medium',
              'px-4 rounded-lg shrink-0 min-h-[48px] min-w-[140px]'
            )}
          >
            Iniciar
          </button>
        )}
      </div>

      <div
        className={cn(
          'h-48 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50',
          'p-3 text-sm flex flex-col gap-2'
        )}
      >
        {transcripts.length === 0 ? (
          <p className="text-zinc-400 text-center text-sm m-auto px-4">
            {isActive ? 'Escuchando… Habla cuando quieras.' : 'Pulsa Iniciar para la llamada por voz.'}
          </p>
        ) : (
          transcripts.map((t, i) => (
            <div key={i} className={t.role === 'user' ? 'text-right' : 'text-left'}>
              <span
                className={cn(
                  'inline-block px-3 py-2 rounded-xl max-w-[90%] break-words',
                  t.role === 'user'
                    ? 'bg-blue-50 text-blue-900 border border-blue-100'
                    : 'bg-white border border-zinc-200 text-zinc-800'
                )}
              >
                <span className="block text-[11px] uppercase tracking-wide opacity-50 mb-1">
                  {t.role === 'user' ? 'Tú' : 'Copiloto'}
                </span>
                {t.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
