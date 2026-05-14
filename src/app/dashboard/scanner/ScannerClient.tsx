'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, Loader2, Search, Truck, X } from 'lucide-react'
import { assessScannerImageReadability } from '@/lib/scanner-image-quality'
import {
  appendScannerPageToInvoiceAction,
  listRecentInvoicesForSupplierAction,
  processScannerImage,
  type RecentInvoiceForSupplierItem,
} from './actions'
import { cn } from '@/lib/utils'
import { getSupplierLogo } from '@/lib/supplier-logos'
import { createClient } from '@/utils/supabase/client'

interface Supplier {
  id: number
  name: string
  image_url?: string | null
}

type SupplierWizardStep = 'supplier' | 'invoice'

function formatInvoiceRow(it: RecentInvoiceForSupplierItem) {
  const d = String(it.invoice_date ?? '').trim()
  const num = String(it.invoice_number ?? '').trim()
  const datePart = d || '—'
  const numPart = num || 'Sin nº'
  return `${datePart} · ${numPart}`
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
  const [appendMode, setAppendMode] = useState(false)
  const [supplierWizardStep, setSupplierWizardStep] = useState<SupplierWizardStep>('supplier')
  const [appendInvoiceId, setAppendInvoiceId] = useState<string | null>(null)
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoiceForSupplierItem[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

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
      fetchSuppliers()
    }
  }, [showSupplierModal, supabase])

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

  const openModal = () => {
    setMessage(null)
    setSupplierWizardStep('supplier')
    setRecentInvoices([])
    setAppendInvoiceId(null)
    setShowSupplierModal(true)
  }

  const closeModal = () => {
    setShowSupplierModal(false)
    setSearchQuery('')
    setSupplierWizardStep('supplier')
    setRecentInvoices([])
    setLoadingInvoices(false)
  }

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!selectedSupplierId) {
      setMessageTone('error')
      setMessage('Selecciona primero el proveedor antes de hacer la foto.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    if (appendMode && !appendInvoiceId) {
      setMessageTone('error')
      setMessage('En modo «Añadir hoja» debes elegir el albarán antes de la foto.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

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

      const fname = file.name.replace(/\.[^/.]+$/, '') + '.jpg'
      const res = appendInvoiceId
        ? await appendScannerPageToInvoiceAction({
            base64DataUri: dataUri,
            filename: fname,
            supplierId: selectedSupplierId,
            invoiceId: appendInvoiceId,
          })
        : await processScannerImage(dataUri, fname, selectedSupplierId)

      if (!res?.success) {
        setMessageTone('error')
        setMessage(res?.message || 'No se pudo procesar. Repite la foto.')
        setPreview(null)
        return
      }

      setMessageTone('success')
      setMessage(appendInvoiceId ? 'OK. Hoja añadida al albarán.' : 'OK. Albarán recibido.')
      setPreview(null)
      setSelectedSupplierId(null)
      setAppendInvoiceId(null)
      setSupplierWizardStep('supplier')
      onSuccess?.()
    } catch (error: any) {
      setMessageTone('error')
      setMessage(error?.message || 'No se pudo procesar. Repite la foto.')
      setPreview(null)
    } finally {
      setIsProcessing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const filteredSuppliers = suppliers.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const handleSelectSupplier = (id: number) => {
    setSelectedSupplierId(id)
    if (appendMode) {
      setSupplierWizardStep('invoice')
      setLoadingInvoices(true)
      void listRecentInvoicesForSupplierAction({ supplierId: id, limit: 40 }).then((res) => {
        setLoadingInvoices(false)
        if (res.success) {
          setRecentInvoices(res.items)
        } else {
          setMessageTone('error')
          setMessage(res.message)
          setSupplierWizardStep('supplier')
        }
      })
      return
    }
    setShowSupplierModal(false)
    setSearchQuery('')
    setTimeout(() => {
      fileInputRef.current?.click()
    }, 300)
  }

  const handleSelectInvoiceForAppend = (invoiceId: string) => {
    setAppendInvoiceId(invoiceId)
    setShowSupplierModal(false)
    setSearchQuery('')
    setSupplierWizardStep('supplier')
    setTimeout(() => {
      fileInputRef.current?.click()
    }, 300)
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
        <label className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-3 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={appendMode}
            onChange={(e) => {
              setAppendMode(e.target.checked)
              setAppendInvoiceId(null)
              setSupplierWizardStep('supplier')
              setRecentInvoices([])
            }}
            className="mt-1 h-5 w-5 rounded border-zinc-300 text-[#36606F] focus:ring-[#36606F]"
          />
          <span className="text-sm font-bold text-zinc-800 leading-snug">
            Añadir hoja a un albarán ya registrado (2.ª página, continuación…)
          </span>
        </label>

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
                {supplierWizardStep === 'invoice' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSupplierWizardStep('supplier')
                      setRecentInvoices([])
                      setLoadingInvoices(false)
                    }}
                    className="flex items-center gap-2 text-white/90 hover:text-white text-xs font-black uppercase tracking-wider mb-2 shrink-0 min-h-[40px]"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Volver a proveedores
                  </button>
                ) : null}
                <h3 className="text-lg font-black uppercase tracking-wider leading-none">
                  {supplierWizardStep === 'supplier' ? 'Proveedor' : 'Albarán a ampliar'}
                </h3>
                <p className="text-white/70 text-[10px] font-black uppercase tracking-[0.2em] mt-1.5 flex items-center gap-1">
                  <Truck size={12} />
                  {supplierWizardStep === 'supplier'
                    ? 'Selecciona proveedor para el albarán'
                    : 'Elige el albarán al que sumar esta hoja'}
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
              {supplierWizardStep === 'supplier' ? (
                <>
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
                </>
              ) : (
                <div className="flex flex-col gap-2 overflow-y-auto min-h-0 flex-1">
                  {loadingInvoices ? (
                    <div className="py-12 flex justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-[#36606F]" />
                    </div>
                  ) : recentInvoices.length === 0 ? (
                    <p className="text-sm font-bold text-zinc-500 text-center py-8">
                      No hay albaranes recientes para este proveedor. Primero escanea la hoja 1 sin «Añadir hoja».
                    </p>
                  ) : (
                    recentInvoices.map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => handleSelectInvoiceForAppend(it.id)}
                        className="min-h-[48px] w-full text-left rounded-xl border border-zinc-200 px-4 py-3 hover:bg-zinc-50 active:scale-[0.99] transition"
                      >
                        <span className="text-xs font-black uppercase text-[#36606F] tracking-wide">Albarán</span>
                        <p className="text-sm font-black text-zinc-900 mt-0.5">{formatInvoiceRow(it)}</p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
