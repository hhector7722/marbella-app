'use client'

import { useEffect, useState, useMemo } from 'react'
import { AlertCircle, FileText, Loader2, X, ChevronRight, Info, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  confirmInvoiceLineProvenanceAction,
  getInvoiceLineEvidenceAction,
  type DocumentEvidencePayload,
} from '@/app/dashboard/albaranes/actions'
import { Modal } from '@/components/ui/modal'
import { resolveActiveProvenance } from '@/lib/albaranes/document-evidence'

interface DocumentEvidenceModalProps {
  open: boolean
  lineId: string | null
  onClose: () => void
  /** Nombre del proveedor del albarán abierto (contexto de cabecera). */
  supplierName?: string | null
  /** Nº de albarán / factura del documento abierto (contexto de cabecera). */
  invoiceNumber?: string | null
  isManager?: boolean
  onOpenProduct?: () => void
  onOpenEditor?: () => void
  onExcludeFromMapping?: () => void
  onMarkExpenseOnly?: () => void
  onRestoreStatus?: () => void
  refreshVersion?: number
}

function formatEvidenceSubtitle(
  supplierName: string | null | undefined,
  invoiceNumber: string | null | undefined,
): string {
  const supplier = typeof supplierName === 'string' ? supplierName.trim() : ''
  const number = typeof invoiceNumber === 'string' ? invoiceNumber.trim() : ''
  if (supplier && number) return `${supplier} · ${number}`
  if (supplier) return supplier
  if (number) return number
  return 'Operativo vs OCR del documento'
}

function formatNum(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('es-ES', { maximumFractionDigits: 4 })
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(2)} €`
}

function formatCompactQty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toLocaleString('es-ES', { maximumFractionDigits: 4 })} ud`
}

export function DocumentEvidenceModal({ 
  open, lineId, onClose,
  supplierName = null,
  invoiceNumber = null,
  isManager = false,
  onOpenProduct, onOpenEditor, 
  onExcludeFromMapping, onMarkExpenseOnly, onRestoreStatus,
  refreshVersion 
}: DocumentEvidenceModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DocumentEvidencePayload | null>(null)
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [localRefresh, setLocalRefresh] = useState(0)

  useEffect(() => {
    if (!open || !lineId) return

    let isSubscribed = true

    void (async () => {
      // Diferir setState fuera del cuerpo síncrono del effect (react-hooks/set-state-in-effect).
      await Promise.resolve()
      if (!isSubscribed) return

      setLoading(true)
      setError(null)
      setConfirmError(null)

      try {
        const res = await getInvoiceLineEvidenceAction(lineId)
        if (!isSubscribed) return
        if (res.success) {
          setData(res.data)
          const active = resolveActiveProvenance(res.data.provenanceChain)
          setSelectedRowId(active?.document_row_id ?? null)
        } else {
          setData(null)
          setSelectedRowId(null)
          setError(res.message)
        }
      } catch (err) {
        if (!isSubscribed) return
        setData(null)
        setSelectedRowId(null)
        setError(err instanceof Error ? err.message : 'Error desconocido')
      } finally {
        if (isSubscribed) setLoading(false)
      }
    })()

    return () => {
      isSubscribed = false
    }
  }, [open, lineId, refreshVersion, localRefresh])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const activeProvenance = useMemo(() => {
    if (!data) return null
    return resolveActiveProvenance(data.provenanceChain)
  }, [data])

  const canSelectRows = Boolean(isManager && data && !activeProvenance && data.documentRows.length > 0)

  async function handleConfirmEvidence() {
    if (!lineId || !selectedRowId || !canSelectRows || confirming) return
    setConfirming(true)
    setConfirmError(null)
    try {
      const res = await confirmInvoiceLineProvenanceAction({
        invoiceLineId: lineId,
        documentRowId: selectedRowId,
      })
      if (!res.success) {
        setConfirmError(res.message)
        return
      }
      setLocalRefresh((v) => v + 1)
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Error al confirmar evidencia')
    } finally {
      setConfirming(false)
    }
  }

  if (!open) return null

  const lineName = data?.line.original_name || 'Sin nombre'
  const compactMetrics = data
    ? `${formatCompactQty(data.line.quantity)} | ${formatMoney(data.line.unit_price)} | ${formatMoney(data.line.total_price)}`
    : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      hideHeader={true}
      wrapperClassName="max-w-5xl"
      panelHostClassName="p-0"
      className="max-h-[90vh]"
      /** Por encima del detalle de albarán (z-[10050]); no apilar otras superficies encima. */
      zIndexClass="z-[10100]"
      title="Auditoría de evidencia"
    >
      <div className="flex flex-col h-full w-full min-w-0">
        {/* HEADER — CONTEXTO */}
        <div className="bg-[#36606F] px-3 py-2.5 sm:px-5 sm:py-4 flex items-start justify-between gap-2 text-white shrink-0">
          <div className="min-w-0 flex-1 flex items-start gap-2 sm:gap-3">
            <FileText className="hidden sm:block h-5 w-5 text-white/70 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[13px] sm:text-sm font-black uppercase tracking-wide sm:tracking-wider text-balance leading-snug">
                Auditoría de evidencia
              </p>
              <p className="text-[11px] font-medium text-white/70 mt-0.5 leading-snug break-words [overflow-wrap:anywhere]">
                {formatEvidenceSubtitle(supplierName, invoiceNumber)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 min-w-12 inline-flex items-center justify-center rounded-xl hover:bg-white/10 transition active:scale-[0.99] shrink-0"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-3 py-3 sm:p-4 md:p-6 overflow-auto flex-1 bg-zinc-50/50 min-w-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center min-h-[240px] text-zinc-500 gap-3">
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
            <div className="flex flex-col gap-3 sm:gap-5 md:gap-6 min-w-0">

              {/* LÍNEA OPERATIVA */}
              <section className="bg-white rounded-xl border border-zinc-200 sm:shadow-sm min-w-0">
                <div className="px-3 py-3 sm:p-4 flex flex-col gap-3 min-w-0">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    Línea operativa
                  </p>

                  {/* Móvil: nombre + métricas en una línea compacta */}
                  <div className="sm:hidden min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 leading-snug break-words">
                      {lineName}
                    </p>
                    <p className="mt-1.5 text-xs font-normal text-zinc-600 tabular-nums tracking-tight">
                      {compactMetrics}
                    </p>
                  </div>

                  {/* Desktop: bloques etiquetados */}
                  <div className="hidden sm:flex sm:flex-row sm:items-center gap-4 md:gap-8 min-w-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">Descripción</p>
                      <p className="text-base font-black text-zinc-900 break-words">{lineName}</p>
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

                  {/* Acciones: primarias / secundarias */}
                  {(isManager && onOpenEditor) ||
                  onOpenProduct ||
                  (data.line && data.line.status !== 'excluded' && data.line.status !== 'expense_only' && (onExcludeFromMapping || onMarkExpenseOnly)) ||
                  (data.line && (data.line.status === 'excluded' || data.line.status === 'expense_only') && onRestoreStatus) ? (
                    <div className="flex flex-col gap-2 pt-1 border-t border-zinc-100">
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                        {onOpenProduct && (
                          <button
                            type="button"
                            onClick={() => {
                              onOpenProduct()
                            }}
                            className="min-h-12 text-xs font-bold uppercase tracking-wide text-sky-700 bg-sky-50 hover:bg-sky-100 px-3 rounded-lg transition active:scale-[0.98]"
                          >
                            Ver producto
                          </button>
                        )}
                        {isManager && onOpenEditor && (
                          <button
                            type="button"
                            onClick={() => onOpenEditor()}
                            className="min-h-12 text-xs font-bold uppercase tracking-wide text-[#36606F] bg-zinc-100 hover:bg-zinc-200 px-3 rounded-lg transition active:scale-[0.98]"
                          >
                            <span className="sm:hidden">Corregir</span>
                            <span className="hidden sm:inline">Corregir valores operativos</span>
                          </button>
                        )}
                      </div>

                      {data.line && data.line.status !== 'excluded' && data.line.status !== 'expense_only' && (onExcludeFromMapping || onMarkExpenseOnly) ? (
                        <div className="flex flex-wrap items-center gap-1">
                          {onExcludeFromMapping && (
                            <button
                              type="button"
                              onClick={() => {
                                onExcludeFromMapping()
                                onClose()
                              }}
                              className="min-h-12 px-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 rounded-lg transition active:scale-[0.98]"
                            >
                              Portes
                            </button>
                          )}
                          {onMarkExpenseOnly && (
                            <button
                              type="button"
                              onClick={() => {
                                onMarkExpenseOnly()
                                onClose()
                              }}
                              className="min-h-12 px-3 text-[11px] font-semibold uppercase tracking-wide text-amber-700/80 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition active:scale-[0.98]"
                            >
                              Gasto
                            </button>
                          )}
                        </div>
                      ) : null}

                      {data.line && (data.line.status === 'excluded' || data.line.status === 'expense_only') && onRestoreStatus ? (
                        <button
                          type="button"
                          onClick={() => {
                            onRestoreStatus()
                            onClose()
                          }}
                          className="min-h-12 w-full sm:w-auto text-[11px] font-semibold uppercase tracking-wide text-zinc-600 bg-white border border-zinc-200 hover:bg-zinc-50 px-3 rounded-lg transition active:scale-[0.98]"
                        >
                          Restaurar estado (volver a mapear)
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>

              {/* VÍNCULO (PROVENANCE) — estado compacto */}
              <section className="bg-white rounded-xl border border-zinc-200 sm:shadow-sm px-3 py-2.5 sm:p-4 flex flex-col gap-2 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 min-w-0">
                  <div className="min-w-0">
                    {activeProvenance ? (
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex w-fit items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-800 uppercase tracking-wide">
                          <Check className="h-3 w-3" strokeWidth={3} />
                          Evidencia vinculada
                        </span>
                        <p className="text-[11px] sm:text-sm font-medium text-zinc-500 leading-snug">
                          por <span className="text-zinc-700">{activeProvenance.linked_by || 'sistema'}</span>
                          <span className="text-zinc-400"> · {new Date(activeProvenance.created_at).toLocaleString()}</span>
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex w-fit items-center rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-900 uppercase tracking-wide">
                          Pendiente de verificar
                        </span>
                        <p className="text-[11px] sm:text-sm font-medium text-zinc-500 leading-snug">
                          {data.extraction
                            ? 'Confirma la fila OCR correspondiente a esta línea.'
                            : 'No hay extracción OCR disponible para este albarán.'}
                        </p>
                      </div>
                    )}
                  </div>

                  {data.provenanceChain.length > 1 && (
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 shrink-0">
                      <Info className="h-3.5 w-3.5" />
                      Historial: {data.provenanceChain.length} vínculos
                    </div>
                  )}
                </div>
              </section>

              {/* Candidatas OCR de ESTA línea — lista densa */}
              {data.extraction && data.documentRows.length > 0 ? (
                <section className="bg-white rounded-xl border border-zinc-200 sm:shadow-sm overflow-hidden flex flex-col min-w-0">
                  <div className="px-3 py-2 sm:px-4 sm:py-3 border-b border-zinc-100 flex flex-col gap-0.5">
                    <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      {activeProvenance ? 'Evidencia documental vinculada' : 'Candidatas del documento'}
                    </h3>
                    <p className="text-[11px] font-medium text-zinc-500 leading-snug">
                      {activeProvenance
                        ? 'Fila OCR vinculada. La tabla completa aparece abajo.'
                        : 'Filas OCR similares. Confirmar no cambia producto ni importes.'}
                    </p>
                  </div>

                  <div className="divide-y divide-zinc-100">
                    {data.documentRows.map((row) => {
                      const isActive = activeProvenance?.document_row_id === row.document_row_id
                      const isSelected = selectedRowId === row.document_row_id
                      const occupied = row.linkedOtherLines.length > 0

                      return (
                        <button
                          key={row.document_row_id}
                          type="button"
                          disabled={!canSelectRows}
                          onClick={() => {
                            if (!canSelectRows) return
                            setSelectedRowId(row.document_row_id)
                            setConfirmError(null)
                          }}
                          className={cn(
                            'w-full text-left min-h-12 px-3 py-2.5 sm:px-4 sm:py-3 flex flex-col gap-1 transition min-w-0',
                            canSelectRows && 'hover:bg-zinc-50 active:bg-zinc-100',
                            isActive && 'bg-sky-50',
                            !isActive && isSelected && canSelectRows && 'bg-[#36606F]/[0.06]',
                            !canSelectRows && !isActive && 'opacity-80'
                          )}
                        >
                          <div className="flex items-start gap-2 min-w-0">
                            {isActive ? (
                              <ChevronRight className="h-3.5 w-3.5 text-sky-600 shrink-0 mt-1" strokeWidth={3} />
                            ) : canSelectRows ? (
                              <span
                                className={cn(
                                  'mt-1 h-3.5 w-3.5 rounded-full border-2 shrink-0',
                                  isSelected ? 'border-[#36606F] bg-[#36606F]' : 'border-zinc-300'
                                )}
                                aria-hidden
                              />
                            ) : (
                              <span className="w-3.5 shrink-0" aria-hidden />
                            )}

                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  'text-[13px] sm:text-sm font-semibold leading-snug break-words',
                                  isActive ? 'text-sky-950' : 'text-zinc-900'
                                )}
                              >
                                {row.description || 'Sin descripción OCR'}
                              </p>
                              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <p className="text-[11px] font-normal text-zinc-600 tabular-nums">
                                  {formatNum(row.quantity)} | {formatMoney(row.unit_price)} | {formatMoney(row.amount)}
                                </p>
                                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                                  T{row.table_index + 1}·F{row.row_index}
                                  {!row.isHeuristicCandidate ? ' · fuera heurística' : null}
                                </p>
                              </div>
                              {occupied ? (
                                <p className="mt-1 text-[11px] font-medium text-amber-700/90 leading-snug">
                                  Ya vinculada
                                  {row.linkedOtherLines[0]?.original_name
                                    ? ` · «${row.linkedOtherLines[0].original_name}»`
                                    : ''}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {canSelectRows ? (
                    <div className="shrink-0 border-t border-zinc-100 px-3 py-2.5 sm:p-4 flex flex-col gap-1.5 bg-white">
                      {confirmError ? (
                        <p className="text-sm font-semibold text-red-600">{confirmError}</p>
                      ) : null}
                      <button
                        type="button"
                        disabled={!selectedRowId || confirming}
                        onClick={() => void handleConfirmEvidence()}
                        className={cn(
                          'w-full min-h-12 rounded-lg text-sm font-semibold transition active:scale-[0.99]',
                          selectedRowId && !confirming
                            ? 'bg-[#36606F] text-white hover:bg-[#2c4f5c]'
                            : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                        )}
                      >
                        {confirming ? 'Confirmando…' : 'Confirmar evidencia'}
                      </button>
                      <p className="text-[10px] font-medium text-zinc-400 text-center leading-snug">
                        Solo vínculo documental · no modifica mapping
                      </p>
                    </div>
                  ) : null}
                </section>
              ) : data.extraction && !activeProvenance && data.tables.length > 0 ? (
                <section className="bg-white rounded-xl border border-zinc-200 px-3 py-5 sm:p-8 text-center flex flex-col gap-1.5">
                  <p className="text-sm font-bold text-zinc-800 uppercase tracking-wider">
                    Sin coincidencia automática
                  </p>
                  <p className="text-[13px] font-medium text-zinc-500 leading-snug">
                    No hay filas OCR razonablemente similares a esta línea.
                  </p>
                </section>
              ) : data.extraction && data.extraction.status === 'no_table' ? (
                <section className="bg-white rounded-xl border border-zinc-200 px-3 py-5 sm:p-8 text-center text-[13px] sm:text-sm font-semibold text-zinc-500">
                  No se ha detectado una tabla documental en el archivo original.
                </section>
              ) : data.extraction && data.tables.length === 0 ? (
                <section className="bg-white rounded-xl border border-zinc-200 px-3 py-5 sm:p-8 text-center text-[13px] sm:text-sm font-semibold text-zinc-500">
                  El OCR no devolvió ninguna estructura tabular para esta extracción.
                </section>
              ) : !data.extraction ? (
                <section className="bg-white rounded-xl border border-zinc-200 px-3 py-5 sm:p-8 text-center text-[13px] sm:text-sm font-semibold text-zinc-500">
                  No hay extracción OCR registrada para este albarán.
                </section>
              ) : null}

              {/* Tabla completa solo cuando ya hay provenance (auditoría detallada) */}
              {activeProvenance && data.extraction && data.tables.length > 0 ? (
                <section className="bg-white rounded-xl border border-zinc-200 sm:shadow-sm overflow-hidden flex flex-col min-w-0">
                  <div className="px-3 py-2 sm:px-4 sm:py-3 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                    <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      Evidencia tabular extraída
                    </h3>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">
                      {data.extraction.extractor_version} · {new Date(data.extraction.extracted_at).toLocaleString()}
                    </p>
                  </div>
                  
                  <div className="p-3 sm:p-4 overflow-x-auto flex flex-col gap-6 sm:gap-8 -mx-0">
                    {data.tables.map((table) => {
                      const isTargetTable = table.rows.some((r) => r.id === activeProvenance.document_row_id)
                      
                      return (
                        <div key={table.id} className="flex flex-col min-w-0">
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
                </section>
              ) : null}

            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
