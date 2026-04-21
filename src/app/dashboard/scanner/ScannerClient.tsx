'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Camera, Loader2 } from 'lucide-react'
import { assessScannerImageReadability } from '@/lib/scanner-image-quality'
import { processScannerImage } from './actions'
import { cn } from '@/lib/utils'

export function ScannerClient() {
  const [isProcessing, setIsProcessing] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
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
    try {
      toast.info('Optimizando imagen…')
      const dataUri = await compressImage(file)
      setPreview(dataUri)

      const q = await assessScannerImageReadability(dataUri)
      if (!q.ok) {
        toast.error(q.message)
        setPreview(null)
        return
      }
      toast.success('Foto correcta — enviando al servidor…')

      toast.info('Extrayendo datos con IA…')
      await processScannerImage(dataUri, file.name.replace(/\.[^/.]+$/, '') + '.jpg')

      toast.success('Albarán registrado. El mapeo de líneas y stock se puede completar después.')
      setPreview(null)
    } catch (error: any) {
      toast.error(error?.message || 'Error al procesar')
      setPreview(null)
    } finally {
      setIsProcessing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
      />

      {!preview ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
          className={cn(
            'w-48 h-48 rounded-full text-white flex flex-col items-center justify-center gap-3 transition-all',
            'shadow-xl active:scale-95 disabled:opacity-60 disabled:pointer-events-none',
            'bg-[#36606F] hover:bg-[#2A4C58] shadow-[#36606F]/20'
          )}
        >
          <Camera className="w-16 h-16" />
          <span className="font-black text-lg uppercase tracking-widest">Escanear</span>
        </button>
      ) : (
        <div className="w-full relative rounded-2xl overflow-hidden shadow-lg border border-gray-100 bg-white">
          <img
            src={preview}
            alt="Preview"
            className="w-full h-auto max-h-[60vh] object-cover opacity-50"
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-900 bg-white/40 backdrop-blur-sm px-4">
            <Loader2 className="w-12 h-12 animate-spin mb-4 text-[#36606F]" />
            <span className="font-black text-xl drop-shadow-md text-center">Analizando documento…</span>
            <span className="text-sm font-medium mt-2 text-center">Puede tardar hasta 10 segundos</span>
          </div>
        </div>
      )}

      <p className="text-gray-400 text-sm text-center max-w-xs">
        Al recibir mercancía: la app comprueba que la foto sea legible, registra el albarán y evita duplicar la misma imagen o el mismo documento (proveedor + número + fecha).
      </p>
    </div>
  )
}

