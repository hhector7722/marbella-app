'use client'

import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { assessScannerImageReadability } from '@/lib/scanner-image-quality'
import { processScannerImage } from './actions'
import { cn } from '@/lib/utils'

export function ScannerClient() {
  const [isProcessing, setIsProcessing] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [messageTone, setMessageTone] = useState<'error' | 'success' | 'info'>('info')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const MAX_WIDTH = 1200
          const scale = Math.min(MAX_WIDTH / img.width, 1)
          canvas.width = Math.round(img.width * scale)
          canvas.height = Math.round(img.height * scale)
          const ctx = canvas.getContext('2d')
          if (!ctx) return reject(new Error('No canvas context'))
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', 0.8))
        }
        img.onerror = () => reject(new Error('Error al cargar imagen'))
        img.src = e.target?.result as string
      }
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
      reader.readAsDataURL(file)
    })
  }

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsProcessing(true)
    setMessage(null)
    try {
      const dataUri = await compressImage(file)
      setPreview(dataUri)

      const q = await assessScannerImageReadability(dataUri)
      if (!q.ok) {
        setMessageTone('error')
        setMessage(q.message)
        setPreview(null)
        return
      }
      setMessageTone('info')
      setMessage('Foto correcta. Enviando…')

      const res = await processScannerImage(dataUri, file.name.replace(/\.[^/.]+$/, '') + '.jpg')
      if (!res?.success) {
        setMessageTone('error')
        setMessage(res?.message || 'No se pudo procesar. Repite la foto.')
        setPreview(null)
        return
      }

      setMessageTone('success')
      setMessage('OK. Albarán recibido.')
      setPreview(null)
    } catch (error: any) {
      setMessageTone('error')
      setMessage(error?.message || 'No se pudo procesar. Repite la foto.')
      setPreview(null)
    } finally {
      setIsProcessing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
      />

      <div
        className={cn(
          'rounded-2xl border border-zinc-100 bg-white shadow-sm',
          'p-4 md:p-6 flex flex-col gap-4'
        )}
      >
        <button
          type="button"
          onClick={() => {
            setMessage(null)
            fileInputRef.current?.click()
          }}
          disabled={isProcessing}
          className={cn(
            'min-h-12 w-full rounded-xl px-4 font-black uppercase tracking-widest',
            'bg-[#36606F] text-white hover:bg-[#2A4C58] active:scale-[0.99] transition-all',
            'disabled:opacity-60 disabled:pointer-events-none shrink-0'
          )}
        >
          Escanear albarán
        </button>

        {preview ? (
          <div className="w-full relative rounded-2xl overflow-hidden border border-zinc-100 bg-white">
            <img src={preview} alt="Previsualización" className="w-full h-auto max-h-[60vh] object-cover opacity-40" />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-900 bg-white/50 backdrop-blur-sm px-4">
              <Loader2 className="w-10 h-10 animate-spin mb-3 text-[#36606F]" />
              <span className="font-black text-lg text-center">Analizando…</span>
              <span className="text-sm font-medium mt-1 text-center text-zinc-700">Espera unos segundos</span>
            </div>
          </div>
        ) : null}

        {message ? (
          <div
            className={cn(
              'rounded-xl border p-3 text-sm font-semibold',
              messageTone === 'error' && 'border-rose-200 bg-rose-50 text-rose-900',
              messageTone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-900',
              messageTone === 'info' && 'border-zinc-200 bg-zinc-50 text-zinc-800'
            )}
            role={messageTone === 'error' ? 'alert' : 'status'}
          >
            {message}
          </div>
        ) : null}
      </div>
    </div>
  )
}

