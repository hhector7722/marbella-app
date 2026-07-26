'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Truck, X } from 'lucide-react'
import { assessScannerImageReadability } from '@/lib/scanner-image-quality'
import { compressImageFileToDataUri } from '@/lib/scanner-image-compress'
import { appendScannerPageToInvoiceAction, processScannerImage } from './actions'
import { cn } from '@/lib/utils'
import { getSupplierLogo } from '@/lib/supplier-logos'
import { createClient } from '@/utils/supabase/client'
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking'
import { useTrackModalApply } from '@/hooks/useTrackModalApply'
import { namedEntitySummary } from '@/lib/usage/modal-apply'
import {
  ActionDialog,
  Alert,
  Button,
  EmptyState,
  SearchInput,
  Surface,
  Text,
} from '@/components/mds'

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

export function ScannerClient({
  onSuccess,
  onInvoiceSaved,
  embedded = false,
}: {
  onSuccess?: () => void
  /** Se invoca tras guardar la cabecera del albarán (processScannerImage). */
  onInvoiceSaved?: (invoiceId: string) => void
  /** Modo embebido (p. ej. paso del modal de compra): sin márgenes extra. */
  embedded?: boolean
}) {
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

  useModalUsageTracking({
    open: showSupplierModal,
    usageId: 'scanner-supplier',
    usageLabel: 'Proveedor escáner',
  })
  const trackScannerSupplier = useTrackModalApply('scanner-supplier', 'Proveedor escáner')
  /** Android: cámara directa (desde la UI nativa se puede ir a galería). iOS: selector nativo del SO. */
  const [fileInputCapture, setFileInputCapture] = useState<'environment' | undefined>('environment')
  const supabase = createClient()

  useEffect(() => {
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    if (isIOS) setFileInputCapture(undefined)
  }, [])

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

  const triggerNativeImagePicker = () => {
    setTimeout(() => fileInputRef.current?.click(), 200)
  }

  const clearFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const openModal = () => {
    if (pendingBatch) {
      setMessageTone('error')
      setMessage('Primero guarda el albarán en curso con «Guardar».')
      return
    }
    setMessage(null)
    if (selectedSupplierId) {
      triggerNativeImagePicker()
      return
    }
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
          ? `Albarán con ${pendingBatch.items.length} hojas recibido. Se está leyendo en segundo plano.`
          : 'Albarán recibido. Se está leyendo en segundo plano.'
      )
      setPendingBatch(null)
      setSelectedSupplierId(null)
      onInvoiceSaved?.(invoiceId)
      onSuccess?.()
    } catch (error: unknown) {
      setMessageTone('error')
      setMessage(error instanceof Error ? error.message : 'Error al guardar. Reintenta.')
    } finally {
      setIsProcessing(false)
      clearFileInput()
    }
  }

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const supplierId = effectiveSupplierId
    if (!supplierId) {
      setMessageTone('error')
      setMessage('Selecciona primero el proveedor antes de añadir la imagen.')
      clearFileInput()
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
      setMessage(error instanceof Error ? error.message : 'No se pudo procesar. Repite la foto o elige otra imagen.')
      setPreview(null)
    } finally {
      setIsProcessing(false)
      clearFileInput()
    }
  }

  const filteredSuppliers = suppliers.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const handleSelectSupplier = (id: number) => {
    const supplierName = suppliers.find((s) => s.id === id)?.name ?? String(id)
    trackScannerSupplier(namedEntitySummary(supplierName), { supplierId: String(id) })
    setSelectedSupplierId(id)
    setShowSupplierModal(false)
    setSearchQuery('')
    triggerNativeImagePicker()
  }

  const triggerAnotherCapture = () => {
    if (!pendingBatch) return
    fileInputRef.current?.click()
  }

  return (
    <div className={cn('flex flex-col', embedded ? 'gap-2' : 'gap-4')}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture={fileInputCapture}
        onChange={handleCapture}
        className="hidden"
      />

      <div className="flex flex-col gap-3">
        {!pendingBatch ? (
          <Button
            type="button"
            variant="primary"
            className="w-full uppercase tracking-widest"
            onClick={openModal}
            disabled={isProcessing}
          >
            Escanear albarán
          </Button>
        ) : (
          <Surface
            variant="default"
            className={cn(
              'flex flex-col p-2 md:p-3',
              pendingBatch.items.length > 1 ? 'gap-1' : 'gap-2 md:gap-3'
            )}
          >
            <div className="relative shrink-0 overflow-visible md:min-h-0 md:flex-1">
              {pendingBatch.items.length > 1 ? (
                <>
                  <Button
                    type="button"
                    variant="icon"
                    className={cn(
                      'absolute left-1 top-1/2 z-20 hidden size-10 min-h-10 min-w-10 -translate-y-1/2 rounded-full bg-mds-surface/95 text-mds-primary shadow-md ring-1 ring-mds-border hover:bg-mds-surface md:flex',
                      carouselIndex <= 0 && 'pointer-events-none opacity-35'
                    )}
                    aria-label="Foto anterior"
                    onClick={() => scrollCarouselToIndex(carouselIndex - 1)}
                  >
                    <ChevronLeft className="size-6" strokeWidth={2.5} />
                  </Button>
                  <Button
                    type="button"
                    variant="icon"
                    className={cn(
                      'absolute right-1 top-1/2 z-20 hidden size-10 min-h-10 min-w-10 -translate-y-1/2 rounded-full bg-mds-surface/95 text-mds-primary shadow-md ring-1 ring-mds-border hover:bg-mds-surface md:flex',
                      carouselIndex >= pendingBatch.items.length - 1 &&
                        'pointer-events-none opacity-35'
                    )}
                    aria-label="Foto siguiente"
                    onClick={() => scrollCarouselToIndex(carouselIndex + 1)}
                  >
                    <ChevronRight className="size-6" strokeWidth={2.5} />
                  </Button>
                </>
              ) : null}
              <div
                ref={carouselRef}
                onScroll={onCarouselScroll}
                className={cn(
                  'touch-pan-x flex w-full snap-x snap-mandatory overflow-x-auto overflow-y-visible bg-transparent',
                  'min-h-[10rem] h-[calc(100svh-26rem)] md:h-[min(56vh,calc(100vh-16rem))]',
                  '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
                )}
              >
                {pendingBatch.items.map((it) => (
                  <div
                    key={it.id}
                    className="box-border flex h-full min-h-0 min-w-full shrink-0 snap-center snap-always items-center justify-center px-2 pb-1 pl-2 pr-6 pt-5"
                  >
                    <div className="relative inline-flex max-h-full max-w-full">
                      <div className="relative inline-block max-h-full max-w-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={it.dataUri}
                          alt=""
                          className="block h-auto max-h-[min(48dvh,calc(100svh-30rem))] w-auto max-w-full rounded-xl object-contain md:max-h-[min(52vh,calc(100vh-18rem))]"
                        />
                        <Button
                          type="button"
                          variant="danger"
                          className="absolute left-full top-0 z-40 size-8 min-h-8 min-w-8 -translate-x-1/2 -translate-y-1/2 rounded-full p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            removePendingItemById(it.id)
                          }}
                          aria-label="Quitar esta foto del borrador"
                        >
                          <X className="size-3.5" strokeWidth={3} />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {pendingBatch.items.length > 1 ? (
              <div className="flex shrink-0 justify-center gap-0 pb-0 pt-0">
                {pendingBatch.items.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => scrollCarouselToIndex(i)}
                    aria-label={`Ir a la foto ${i + 1}`}
                    aria-current={i === carouselIndex ? 'true' : undefined}
                    className={cn(
                      'inline-flex min-h-9 min-w-[1.125rem] shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 shadow-none ring-0 outline-none active:scale-95',
                      i === carouselIndex ? 'text-mds-primary' : 'text-mds-muted'
                    )}
                  >
                    <span
                      className={cn(
                        'block h-1.5 w-1.5 rounded-full transition-colors',
                        i === carouselIndex ? 'bg-mds-primary' : 'bg-current'
                      )}
                    />
                  </button>
                ))}
              </div>
            ) : null}

            <Button
              type="button"
              variant="ghost"
              className="w-full uppercase tracking-wide text-mds-primary"
              onClick={triggerAnotherCapture}
              disabled={isProcessing}
            >
              Añadir hoja
            </Button>

            <Button
              type="button"
              variant="primary"
              className="w-full uppercase tracking-widest"
              loading={isProcessing}
              onClick={() => void commitPendingBatch()}
            >
              {isProcessing ? 'Subiendo…' : 'Guardar'}
            </Button>
          </Surface>
        )}

        {preview ? (
          <Surface variant="default" className="relative w-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Previsualización"
              className="h-auto max-h-[60vh] w-full object-cover opacity-40"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-mds-surface/50 px-4 text-mds-foreground backdrop-blur-sm">
              <Loader2 className="mb-3 size-10 animate-spin text-mds-primary" />
              <Text as="p" variant="title" className="text-center text-lg">
                Validando imagen…
              </Text>
              <Text variant="body" muted className="mt-1 text-center text-sm">
                Comprobando nitidez y detalle
              </Text>
            </div>
          </Surface>
        ) : null}

        {message ? (
          <Alert
            tone={
              messageTone === 'error'
                ? 'danger'
                : messageTone === 'success'
                  ? 'success'
                  : 'info'
            }
            title={message}
          />
        ) : null}
      </div>

      <ActionDialog
        open={showSupplierModal}
        onOpenChange={(open) => {
          if (!open) closeModal()
        }}
        title="Proveedor"
        description="Selecciona proveedor para el albarán"
        className="sm:max-w-lg"
      >
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-hidden">
          <SearchInput
            placeholder="Buscar proveedor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingSuppliers ? (
              <div className="flex justify-center py-10">
                <Loader2 className="size-8 animate-spin text-mds-primary" />
              </div>
            ) : filteredSuppliers.length === 0 ? (
              <EmptyState
                variant="compact"
                title="Sin proveedores"
                description="No se encontraron proveedores con ese nombre."
              />
            ) : (
              <div className="grid grid-cols-3 gap-5 p-2 sm:grid-cols-4">
                {filteredSuppliers.map((s) => {
                  const logo = getSupplierLogo(s.image_url, s.name)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectSupplier(s.id)}
                      className="flex aspect-square min-h-12 flex-col items-center justify-center gap-1.5 rounded-xl p-2 transition-all hover:bg-mds-muted-surface active:scale-95"
                    >
                      <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden">
                        {logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={logo}
                            alt={s.name}
                            className="size-full object-contain"
                          />
                        ) : (
                          <Truck className="size-6 text-mds-muted" aria-hidden />
                        )}
                      </div>
                      <span className="line-clamp-2 px-0.5 text-center text-[9px] font-black uppercase leading-tight tracking-wider text-mds-foreground">
                        {s.name}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </ActionDialog>
    </div>
  )
}
