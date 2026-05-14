'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Search, Truck, X } from 'lucide-react'
import { assessScannerImageReadability } from '@/lib/scanner-image-quality'
import { compressImageFileToDataUri } from '@/lib/scanner-image-compress'
import { appendScannerPageToInvoiceAction, processScannerImage } from './actions'
import { cn } from '@/lib/utils'
import { getSupplierLogo } from '@/lib/supplier-logos'
import { createClient } from '@/utils/supabase/client'

interface Supplier {
  id: number
  name: string
  image_url?: string | null
}

type PendingItem = { dataUri: string; filename: string }

export function ScannerClient({ onSuccess }: { onSuccess?: () => void }) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [messageTone, setMessageTone] = useState<'error' | 'success' | 'info'>('info')
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingSuppliers, setLoadingSuppliers] = useState(false)
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null)
  /** Borrador: fotos validadas listas para guardar en un solo albarán (1ª = cabecera, resto = adjuntos). */
  const [pendingBatch, setPendingBatch] = useState<{ supplierId: number; items: PendingItem[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const effectiveSupplierId = pendingBatch?.supplierId ?? selectedSupplierId

  useEffect(() => {
    if (showSupplierModal) {
      const fetchSuppliers = async () => {
        setLoadingSuppliers(true)
        const { data, error } = await supabase
          .from('suppliers')
          .select('id, name, image_url')
          .order('name')
        if (!error && data) setSuppliers(data)
        setLoadingSuppliers(false)
      }
      void fetchSuppliers()
    }
  }, [showSupplierModal, supabase])

  const openModal = () => {
    if (pendingBatch) {
      setMessageTone('error')
      setMessage('Primero guarda el albarán en curso con «Guardar».')
      return
    }
    setMessage(null)
    setShowSupplierModal(true)
  }

  const closeModal = () => {
    setShowSupplierModal(false)
    setSearchQuery('')
  }

  const commitPendingBatch = async () => {
    if (!pendingBatch || pendingBatch.items.length === 0) return
    setIsProcessing(true)
    setMessage(null)
    setPreview(null)
    try {
      const first = pendingBatch.items[0]!
      const res = await processScannerImage(first.dataUri, first.filename, pendingBatch.supplierId)
      if (!res.success) {
        setMessageTone('error')
        setMessage(res.message)
        return
      }
      const invoiceId = res.invoiceId
      if (!invoiceId) {
        setMessageTone('error')
        setMessage('No se obtuvo el id del albarán. Reintenta con una sola foto.')
        return
      }
      const rest = pendingBatch.items.slice(1)
      for (let i = 0; i < rest.length; i++) {
        const it = rest[i]!
        const ar = await appendScannerPageToInvoiceAction({
          base64DataUri: it.dataUri,
          filename: it.filename,
          supplierId: pendingBatch.supplierId,
          invoiceId,
        })
        if (!ar.success) {
          setMessageTone('error')
          setMessage(
            `Se guardó la hoja 1, pero falló la hoja ${i + 2}: ${ar.message}. Revisa el albarán y añade las hojas que falten desde el detalle.`
          )
          setPendingBatch(null)
          setSelectedSupplierId(null)
          onSuccess?.()
          return
        }
      }
      setMessageTone('success')
      setMessage(
        pendingBatch.items.length > 1
          ? `OK. Albarán con ${pendingBatch.items.length} hojas registrado.`
          : 'OK. Albarán recibido.'
      )
      setPendingBatch(null)
      setSelectedSupplierId(null)
      onSuccess?.()
    } catch (error: unknown) {
      setMessageTone('error')
      setMessage(error instanceof Error ? error.message : 'Error al guardar. Reintenta.')
    } finally {
      setIsProcessing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const supplierId = effectiveSupplierId
    if (!supplierId) {
      setMessageTone('error')
      setMessage('Selecciona primero el proveedor antes de hacer la foto.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setIsProcessing(true)
    setMessage(null)
    try {
      const dataUri = await compressImageFileToDataUri(file)
      setPreview(dataUri)

      const q = await assessScannerImageReadability(dataUri)
      if (!q.ok) {
        setMessageTone('error')
        setMessage(q.message)
        setPreview(null)
        return
      }

      const fname = file.name.replace(/\.[^/.]+$/, '') + '.jpg'
      const nextItem: PendingItem = { dataUri, filename: fname }

      setPendingBatch((prev) => {
        if (prev) {
          return { supplierId: prev.supplierId, items: [...prev.items, nextItem] }
        }
        return { supplierId, items: [nextItem] }
      })

      setPreview(null)
    } catch (error: unknown) {
      setMessageTone('error')
      setMessage(error instanceof Error ? error.message : 'No se pudo procesar. Repite la foto.')
      setPreview(null)
    } finally {
      setIsProcessing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const filteredSuppliers = suppliers.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const handleSelectSupplier = (id: number) => {
    setSelectedSupplierId(id)
    setShowSupplierModal(false)
    setSearchQuery('')
    setTimeout(() => {
      fileInputRef.current?.click()
    }, 300)
  }

  const triggerAnotherCapture = () => {
    if (!pendingBatch) return
    fileInputRef.current?.click()
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

      <div className="flex flex-col gap-3">
        {!pendingBatch ? (
          <button
            type="button"
            onClick={openModal}
            disabled={isProcessing}
            className={cn(
              'min-h-12 w-full rounded-xl px-4 font-black uppercase tracking-widest',
              'bg-[#36606F] text-white hover:bg-[#2A4C58] active:scale-[0.99] transition-all',
              'disabled:opacity-60 disabled:pointer-events-none shrink-0'
            )}
          >
            Escanear albarán
          </button>
        ) : (
          <div className="rounded-xl bg-white p-3 space-y-3">
            {pendingBatch.items.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto pb-1 shrink-0">
                {pendingBatch.items.slice(0, -1).map((it, idx) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${idx}-${it.filename}`}
                    src={it.dataUri}
                    alt=""
                    className="h-14 w-auto max-w-[88px] shrink-0 rounded-md border border-zinc-100 object-cover"
                  />
                ))}
              </div>
            ) : null}
            {(() => {
              const last = pendingBatch.items[pendingBatch.items.length - 1]
              if (!last) return null
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={last.dataUri}
                  alt=""
                  className="w-full max-h-[55vh] rounded-lg bg-zinc-50 object-contain"
                />
              )
            })()}
            <div className="flex flex-col gap-2 shrink-0">
              <button
                type="button"
                onClick={triggerAnotherCapture}
                disabled={isProcessing}
                className={cn(
                  'w-full min-h-11 rounded-lg px-3 text-xs font-medium uppercase tracking-wide text-[#36606F] bg-transparent hover:bg-zinc-50 active:scale-[0.99] transition',
                  isProcessing && 'opacity-60 pointer-events-none'
                )}
              >
                Añadir hoja
              </button>
              <button
                type="button"
                onClick={() => void commitPendingBatch()}
                disabled={isProcessing}
                className={cn(
                  'min-h-12 w-full rounded-xl px-4 font-black uppercase tracking-widest text-sm',
                  'bg-[#36606F] text-white hover:bg-[#2A4C58] active:scale-[0.99] transition',
                  isProcessing && 'opacity-60 pointer-events-none'
                )}
              >
                {isProcessing ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        )}

        {preview ? (
          <div className="w-full relative rounded-2xl overflow-hidden border border-zinc-100 bg-white">
            <img src={preview} alt="Previsualización" className="w-full h-auto max-h-[60vh] object-cover opacity-40" />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-900 bg-white/50 backdrop-blur-sm px-4">
              <Loader2 className="w-10 h-10 animate-spin mb-3 text-[#36606F]" />
              <span className="font-black text-lg text-center">Validando imagen…</span>
              <span className="text-sm font-medium mt-1 text-center text-zinc-700">Comprobando nitidez y detalle</span>
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

      {showSupplierModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => closeModal()}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#36606F] px-6 py-4 flex justify-between items-center text-white shrink-0 shadow-md">
              <div className="flex flex-col min-w-0">
                <h3 className="text-lg font-black uppercase tracking-wider leading-none">Proveedor</h3>
                <p className="text-white/70 text-[10px] font-black uppercase tracking-[0.2em] mt-1.5 flex items-center gap-1">
                  <Truck size={12} />
                  Selecciona proveedor para el albarán
                </p>
              </div>
              <button
                onClick={() => closeModal()}
                className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90 shrink-0"
              >
                <X size={20} strokeWidth={3} />
              </button>
            </div>

            <div className="p-4 bg-white flex-1 overflow-hidden flex flex-col">
              <div className="relative mb-4 shrink-0">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar proveedor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-12 pl-10 pr-4 rounded-xl border-2 border-zinc-200 text-sm font-bold text-zinc-700 bg-white focus:ring-2 focus:ring-[#36606F] focus:border-[#36606F] outline-none transition-all placeholder:text-zinc-300"
                />
              </div>

              <div className="overflow-y-auto grid grid-cols-3 sm:grid-cols-4 gap-5 p-2">
                {loadingSuppliers ? (
                  <div className="col-span-full py-10 flex justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-[#36606F]" />
                  </div>
                ) : filteredSuppliers.length === 0 ? (
                  <div className="col-span-full py-10 text-center">
                    <span className="text-sm font-bold text-gray-400">No se encontraron proveedores</span>
                  </div>
                ) : (
                  filteredSuppliers.map((s) => {
                    const logo = getSupplierLogo(s.image_url, s.name)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSelectSupplier(s.id)}
                        className="p-2 flex flex-col items-center justify-center gap-1.5 aspect-square transition-all active:scale-95 hover:bg-zinc-50 rounded-xl"
                      >
                        <div className="w-11 h-11 flex items-center justify-center overflow-hidden shrink-0">
                          {logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logo} alt={s.name} className="w-full h-full object-contain" />
                          ) : (
                            <Truck className="w-6 h-6 text-gray-300" />
                          )}
                        </div>
                        <span className="text-[9px] font-black uppercase text-gray-800 tracking-wider text-center line-clamp-2 leading-tight px-0.5">
                          {s.name}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
