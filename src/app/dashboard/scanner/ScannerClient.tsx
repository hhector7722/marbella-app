'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Search, Truck, X } from 'lucide-react'
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

type PendingItem = { id: string; dataUri: string; filename: string }

function newPendingId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

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
  const [carouselIndex, setCarouselIndex] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const carouselRef = useRef<HTMLDivElement>(null)
  const prevBatchLenRef = useRef(0)
  const supabase = createClient()

  const effectiveSupplierId = pendingBatch?.supplierId ?? selectedSupplierId

  useEffect(() => {
    if (!showSupplierModal && !pendingBatch) return
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
  }, [showSupplierModal, pendingBatch, supabase])

  const pendingSupplierName = useMemo(() => {
    if (!pendingBatch) return null
    return suppliers.find((s) => s.id === pendingBatch.supplierId)?.name?.trim() || null
  }, [pendingBatch, suppliers])

  const removePendingItemById = (itemId: string) => {
    setPendingBatch((prev) => {
      if (!prev) return null
      const next = prev.items.filter((x) => x.id !== itemId)
      if (next.length === 0) {
        setSelectedSupplierId(null)
        setCarouselIndex(0)
        prevBatchLenRef.current = 0
        return null
      }
      return { supplierId: prev.supplierId, items: next }
    })
  }

  const scrollCarouselToIndex = (index: number, behavior: ScrollBehavior = 'smooth') => {
    const el = carouselRef.current
    if (!el) return
    const w = el.clientWidth
    if (w <= 0) return
    const n = pendingBatch?.items.length ?? 0
    const i = Math.min(Math.max(0, index), Math.max(0, n - 1))
    el.scrollTo({ left: i * w, behavior })
    setCarouselIndex(i)
  }

  const onCarouselScroll = () => {
    const el = carouselRef.current
    if (!el) return
    const w = el.clientWidth
    if (w <= 0) return
    const n = pendingBatch?.items.length ?? 0
    if (n === 0) return
    const i = Math.min(Math.max(0, Math.round(el.scrollLeft / w)), n - 1)
    setCarouselIndex(i)
  }

  useEffect(() => {
    if (!pendingBatch) {
      prevBatchLenRef.current = 0
      setCarouselIndex(0)
      return
    }
    const n = pendingBatch.items.length
    const prevLen = prevBatchLenRef.current
    prevBatchLenRef.current = n
    const el = carouselRef.current
    if (!el || n === 0) return

    requestAnimationFrame(() => {
      const node = carouselRef.current
      if (!node) return
      const w = node.clientWidth
      if (w <= 0) return
      if (prevLen < n) {
        node.scrollTo({ left: (n - 1) * w, behavior: 'smooth' })
        setCarouselIndex(n - 1)
      } else if (prevLen > n) {
        const idx = Math.min(Math.max(0, Math.round(node.scrollLeft / w)), n - 1)
        node.scrollTo({ left: idx * w, behavior: 'auto' })
        setCarouselIndex(idx)
      } else if (prevLen === 0 && n === 1) {
        node.scrollTo({ left: 0, behavior: 'auto' })
        setCarouselIndex(0)
      }
    })
  }, [pendingBatch])

  const openModal = () => {
    if (pendingBatch) {
      setMessageTone('error')
      setMessage('Primero guarda el borrador con «Guardar» o descártalo con «Cancelar borrador».')
      return
    }
    setMessage(null)
    setShowSupplierModal(true)
  }

  const closeModal = () => {
    setShowSupplierModal(false)
    setSearchQuery('')
  }

  const discardPendingBatch = () => {
    setPendingBatch(null)
    setPreview(null)
    setSelectedSupplierId(null)
    setCarouselIndex(0)
    prevBatchLenRef.current = 0
    setMessage(null)
    requestAnimationFrame(() => {
      carouselRef.current?.scrollTo({ left: 0, behavior: 'auto' })
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
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
      const nextItem: PendingItem = { id: newPendingId(), dataUri, filename: fname }

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
          <div className="flex max-h-[min(92dvh,calc(100svh-8.5rem))] flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm md:max-h-[min(88dvh,calc(100vh-9rem))]">
            <div className="flex shrink-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wider text-[#36606F]">
                  Borrador · {pendingBatch.items.length}{' '}
                  {pendingBatch.items.length === 1 ? 'hoja' : 'hojas'}
                </p>
                {pendingSupplierName ? (
                  <p className="mt-0.5 truncate text-[11px] font-bold text-zinc-600">{pendingSupplierName}</p>
                ) : (
                  <p className="mt-0.5 text-[11px] font-bold text-zinc-500">Proveedor seleccionado</p>
                )}
              </div>
              <button
                type="button"
                onClick={discardPendingBatch}
                disabled={isProcessing}
                className={cn(
                  'shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-zinc-700 hover:bg-zinc-50 min-h-12',
                  isProcessing && 'pointer-events-none opacity-50'
                )}
              >
                Cancelar borrador
              </button>
            </div>

            <div className="relative min-h-0 shrink">
              {pendingBatch.items.length > 1 ? (
                <>
                  <button
                    type="button"
                    className={cn(
                      'absolute left-1 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-[#36606F] shadow-md ring-1 ring-zinc-200/90 hover:bg-white md:h-12 md:w-12',
                      carouselIndex <= 0 && 'pointer-events-none opacity-35'
                    )}
                    aria-label="Foto anterior"
                    onClick={() => scrollCarouselToIndex(carouselIndex - 1)}
                  >
                    <ChevronLeft className="h-6 w-6 md:h-7 md:w-7" strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'absolute right-1 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-[#36606F] shadow-md ring-1 ring-zinc-200/90 hover:bg-white md:h-12 md:w-12',
                      carouselIndex >= pendingBatch.items.length - 1 && 'pointer-events-none opacity-35'
                    )}
                    aria-label="Foto siguiente"
                    onClick={() => scrollCarouselToIndex(carouselIndex + 1)}
                  >
                    <ChevronRight className="h-6 w-6 md:h-7 md:w-7" strokeWidth={2.5} />
                  </button>
                </>
              ) : null}
              <div
                ref={carouselRef}
                onScroll={onCarouselScroll}
                className={cn(
                  'touch-pan-x overscroll-x-contain flex max-h-[calc(100svh-13.5rem)] overflow-x-auto overflow-y-visible rounded-lg bg-zinc-50 snap-x snap-mandatory md:max-h-[calc(100vh-15.5rem)]',
                  '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
                )}
              >
                {pendingBatch.items.map((it) => (
                  <div
                    key={it.id}
                    className="relative flex min-h-[140px] min-w-full shrink-0 snap-center snap-always items-center justify-center px-1 pb-1 pt-3"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.dataUri}
                      alt=""
                      className="mx-auto block max-h-[calc(100svh-14.25rem)] w-full max-w-full object-contain md:max-h-[calc(100vh-16.25rem)]"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removePendingItemById(it.id)
                      }}
                      className="absolute right-1 top-1 z-30 flex h-11 w-11 min-h-[48px] min-w-[48px] items-center justify-center rounded-full bg-rose-600 text-white shadow-md ring-2 ring-white active:scale-95"
                      aria-label="Quitar esta foto del borrador"
                    >
                      <X className="h-5 w-5" strokeWidth={3} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {pendingBatch.items.length > 1 ? (
              <div className="flex justify-center gap-px pt-0.5">
                {pendingBatch.items.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => scrollCarouselToIndex(i)}
                    aria-label={`Ir a la foto ${i + 1}`}
                    aria-current={i === carouselIndex ? 'true' : undefined}
                    className={cn(
                      'inline-flex min-h-9 min-w-9 items-center justify-center rounded-full p-0.5 active:scale-95',
                      i === carouselIndex ? 'text-[#36606F]' : 'text-zinc-300'
                    )}
                  >
                    <span
                      className={cn(
                        'block h-1.5 w-1.5 rounded-full transition-colors',
                        i === carouselIndex ? 'bg-[#36606F]' : 'bg-current'
                      )}
                    />
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex shrink-0 flex-col gap-2">
              <button
                type="button"
                onClick={triggerAnotherCapture}
                disabled={isProcessing}
                className={cn(
                  'min-h-12 w-full rounded-xl border-2 border-[#36606F] bg-white px-4 text-sm font-black uppercase tracking-wider text-[#36606F] hover:bg-zinc-50 active:scale-[0.99] transition',
                  isProcessing && 'opacity-60 pointer-events-none'
                )}
              >
                Añadir otra hoja al mismo albarán
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
