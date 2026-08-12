'use client'

import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, FileText, Loader2, X, ChevronRight, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getInvoiceLineEvidenceAction, type DocumentEvidencePayload } from '@/app/dashboard/albaranes/actions'

interface DocumentEvidenceModalProps {
  open: boolean
  lineId: string | null
  onClose: () => void
  portalTarget: HTMLElement | null
}

export function DocumentEvidenceModal({ open, lineId, onClose, portalTarget }: DocumentEvidenceModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DocumentEvidencePayload | null>(null)

  useEffect(() => {
    if (!open || !lineId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(null)
      return
    }

    let isSubscribed = true
    setLoading(true)
    setError(null)

    getInvoiceLineEvidenceAction(lineId)
      .then((res) => {
        if (!isSubscribed) return
        if (res.success) {
          setData(res.data)
        } else {
          setError(res.message)
        }
      })
      .catch((err) => {
        if (!isSubscribed) return
        setError(err instanceof Error ? err.message : 'Error desconocido')
      })
      .finally(() => {
        if (isSubscribed) setLoading(false)
      })

    return () => {
      isSubscribed = false
    }
  }, [open, lineId])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  // Determinar la procedencia activa
  const activeProvenance = useMemo(() => {
    if (!data || data.provenanceChain.length === 0) return null
    const supersededIds = new Set(data.provenanceChain.map((p) => p.supersedes_id).filter(Boolean))
    return data.provenanceChain.find((p) => !supersededIds.has(p.id)) || data.provenanceChain[0]
  }, [data])

  if (!open || !portalTarget) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[10100] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* HEADER */}
        <div className="bg-[#36606F] px-5 py-4 flex items-center justify-between gap-3 text-white shrink-0">
          <div className="min-w-0 flex items-center gap-3">
            <FileText className="h-5 w-5 text-white/70 shrink-0" />
            <div>
              <p className="text-sm font-black uppercase tracking-wider truncate">Auditoría de Evidencia Documental</p>
              <p className="text-[11px] font-bold text-white/70 truncate mt-0.5">
                Datos operativos vs Transcripción OCR original
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl hover:bg-white/10 transition active:scale-[0.99] shrink-0"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 md:p-6 overflow-auto flex-1 bg-zinc-50/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] text-zinc-500 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-[#36606F]" />
              <p className="text-sm font-bold uppercase tracking-wider">Recuperando evidencia...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-red-700">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p className="text-sm font-black">Error al recuperar la evidencia</p>
              </div>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : data ? (
            <div className="flex flex-col gap-6">
              
              {/* LÍNEA OPERATIVA */}
              <section className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm">
                <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">Línea Operativa Actual</h3>
                <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">Descripción</p>
                    <p className="text-base font-black text-zinc-900 truncate">{data.line.original_name || 'Sin nombre'}</p>
                  </div>
                  <div className="flex items-center gap-8 shrink-0">
                    <div>
                      <p className="text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider text-right">Cantidad</p>
                      <p className="text-base font-black text-zinc-900 tabular-nums text-right">
                        {data.line.quantity != null ? data.line.quantity : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider text-right">Precio Ud.</p>
                      <p className="text-base font-black text-zinc-900 tabular-nums text-right">
                        {data.line.unit_price != null ? `${data.line.unit_price.toFixed(2)} €` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider text-right">Total</p>
                      <p className="text-base font-black text-[#36606F] tabular-nums text-right">
                        {data.line.total_price != null ? `${data.line.total_price.toFixed(2)} €` : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* VÍNCULO (PROVENANCE) */}
              <section className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Vínculo de Procedencia (Provenance)</h3>
                  {activeProvenance ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black text-emerald-800 uppercase tracking-wide">
                        Vinculado
                      </span>
                      <p className="text-sm font-bold text-zinc-700">
                        por <span className="text-zinc-900">{activeProvenance.linked_by || 'sistema'}</span>
                        <span className="text-zinc-400 font-medium"> · {new Date(activeProvenance.created_at).toLocaleString()}</span>
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-black text-rose-800 uppercase tracking-wide">
                        Sin Evidencia
                      </span>
                      <p className="text-sm font-bold text-zinc-500">
                        Esta línea no tiene procedencia documental registrada.
                      </p>
                    </div>
                  )}
                </div>

                {data.provenanceChain.length > 1 && (
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg shrink-0 border border-amber-200">
                    <Info className="h-4 w-4" />
                    Historial: {data.provenanceChain.length} vínculos (mostrando activo)
                  </div>
                )}
              </section>

              {/* EVIDENCIA DOCUMENTAL */}
              {activeProvenance && data.extraction ? (
                <section className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="bg-zinc-100/50 px-4 py-3 border-b border-zinc-200 flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5" />
                      Evidencia Tabular Extraída
                    </h3>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">
                      {data.extraction.extractor_version} · {new Date(data.extraction.extracted_at).toLocaleString()}
                    </p>
                  </div>
                  
                  {data.extraction.status === 'no_table' ? (
                    <div className="p-8 text-center text-sm font-bold text-zinc-500">
                      No se ha detectado una tabla documental en el archivo original.
                    </div>
                  ) : data.tables.length === 0 ? (
                    <div className="p-8 text-center text-sm font-bold text-zinc-500">
                      El OCR no devolvió ninguna estructura tabular para esta extracción.
                    </div>
                  ) : (
                    <div className="p-4 overflow-x-auto flex flex-col gap-8">
                      {data.tables.map((table) => {
                        const isTargetTable = table.rows.some((r) => r.id === activeProvenance.document_row_id)
                        
                        return (
                          <div key={table.id} className="flex flex-col">
                            <h4 className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-2">
                              Tabla {table.table_index + 1}
                              {!isTargetTable && <span className="ml-2 text-[10px] font-bold bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">Sin coincidencia activa</span>}
                            </h4>
                            
                            <table className="w-full text-left border-collapse min-w-[600px]">
                              <thead>
                                <tr>
                                  <th className="w-8 border-b-2 border-zinc-200 px-3 py-2 text-[10px] font-black uppercase text-zinc-400 bg-zinc-50 rounded-tl-lg">
                                    #
                                  </th>
                                  {table.columns.map((col) => (
                                    <th
                                      key={col.id}
                                      className="border-b-2 border-zinc-200 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-zinc-500 bg-zinc-50 first:rounded-tl-lg last:rounded-tr-lg"
                                    >
                                      {col.original_name || <span className="text-zinc-300 italic normal-case">Sin encabezado</span>}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-100">
                                {table.rows.map((row) => {
                                  const isActiveRow = row.id === activeProvenance.document_row_id
                                  
                                  return (
                                    <tr
                                      key={row.id}
                                      className={cn(
                                        'transition-colors',
                                        isActiveRow ? 'bg-sky-50 ring-1 ring-sky-200 ring-inset' : 'hover:bg-zinc-50',
                                        !isActiveRow && isTargetTable && 'opacity-60'
                                      )}
                                    >
                                      <td className="px-3 py-2.5 text-[10px] font-black text-zinc-300 whitespace-nowrap">
                                        {isActiveRow ? (
                                          <div className="flex items-center gap-1 text-sky-600">
                                            <ChevronRight className="h-3 w-3" strokeWidth={3} />
                                            {row.row_index}
                                          </div>
                                        ) : (
                                          row.row_index
                                        )}
                                      </td>
                                      {table.columns.map((col) => {
                                        const cell = row.cells.find((c) => c.column_id === col.id)
                                        return (
                                          <td
                                            key={`${row.id}-${col.id}`}
                                            className={cn(
                                              'px-3 py-2.5 text-xs font-mono font-medium whitespace-nowrap',
                                              isActiveRow ? 'text-sky-950 font-bold' : 'text-zinc-700'
                                            )}
                                          >
                                            {cell?.raw_value != null ? cell.raw_value : <span className="text-zinc-300">—</span>}
                                          </td>
                                        )
                                      })}
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              ) : null}

            </div>
          ) : null}
        </div>
      </div>
    </div>,
    portalTarget
  )
}
