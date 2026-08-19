'use client'

import { useEffect, useState, useMemo } from 'react'
import { AlertCircle, Loader2, Check } from 'lucide-react'
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
  return value.toLocaleString('es-ES', { maximumFractionDigits: 3 })
}

function formatMoney(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits === 2 ? 2 : 4 })} €`
}

export function DocumentEvidenceModal({
  open,
  lineId,
  onClose,
  supplierName = null,
  invoiceNumber = null,
  isManager = false,
  onOpenProduct,
  onOpenEditor,
  onExcludeFromMapping,
  onMarkExpenseOnly,
  onRestoreStatus,
  refreshVersion,
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="work"
      layer="derived"
      instance="albaran-document-evidence"
      parentInstance="albaran-detail"
      usageId="albaran-document-evidence"
      usageLabel="Auditoría de evidencia"
      headerTone="petroleum"
      headerTitleAlign="left"
      title="Auditoría de evidencia"
      subtitle={formatEvidenceSubtitle(supplierName, invoiceNumber)}
    >
      <div className="px-3 py-3 bg-zinc-50/50 min-w-0 max-w-full flex flex-col gap-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center min-h-[200px] text-zinc-500 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-[#36606F]" />
              <p className="text-xs font-medium uppercase tracking-wider">Recuperando evidencia…</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p className="text-xs font-semibold">Error al recuperar la evidencia</p>
              </div>
              <p className="text-xs text-red-600">{error}</p>
            </div>
          ) : data ? (
            <div className="flex flex-col gap-3 min-w-0">

              {/* Línea operativa — misma densidad que la tabla del albarán */}
              <section className="bg-white rounded-lg border border-zinc-200 min-w-0">
                <div className="px-2 py-2 flex flex-col gap-2 min-w-0">
                  <p className="text-[9px] font-black text-zinc-400 uppercase tracking-wider px-1">
                    Línea operativa
                  </p>

                  <div className="flex items-center gap-1.5 sm:gap-3 px-1 py-1 border-b border-zinc-100">
                    <div className="flex-1 min-w-0 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                      Producto
                    </div>
                    <div className="flex items-center justify-end shrink-0 gap-1.5 sm:gap-3">
                      <div className="w-[3.25rem] sm:w-[4.5rem] text-right text-[9px] font-black uppercase tracking-wider text-zinc-400">
                        Cant.
                      </div>
                      <div className="w-[3.75rem] sm:w-[5rem] text-right text-[9px] font-black uppercase tracking-wider text-zinc-400">
                        Precio ud.
                      </div>
                      <div className="w-[3.75rem] sm:w-[5rem] text-right text-[9px] font-black uppercase tracking-wider text-zinc-400">
                        Importe
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-row items-center gap-1.5 sm:gap-3 px-1 py-1.5 min-h-12 min-w-0">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-zinc-900 break-words [overflow-wrap:anywhere]" title={lineName}>
                        {lineName}
                      </span>
                    </div>
                    <div className="flex items-center justify-end shrink-0 gap-1.5 sm:gap-3">
                      <div className="w-[3.25rem] sm:w-[4.5rem] text-right">
                        <span className="text-[10px] sm:text-[11px] font-normal text-zinc-800 tabular-nums">
                          {formatNum(data.line.quantity)}
                        </span>
                      </div>
                      <div className="w-[3.75rem] sm:w-[5rem] text-right">
                        <span className="text-[10px] sm:text-[11px] font-normal text-zinc-800 tabular-nums">
                          {formatMoney(data.line.unit_price, 4)}
                        </span>
                      </div>
                      <div className="w-[3.75rem] sm:w-[5rem] text-right">
                        <span className="text-[10px] sm:text-[11px] font-normal text-zinc-800 tabular-nums">
                          {formatMoney(data.line.total_price)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {(isManager && onOpenEditor) ||
                  onOpenProduct ||
                  (data.line && data.line.status !== 'excluded' && data.line.status !== 'expense_only' && (onExcludeFromMapping || onMarkExpenseOnly)) ||
                  (data.line && (data.line.status === 'excluded' || data.line.status === 'expense_only') && onRestoreStatus) ? (
                    <div className="flex flex-col gap-1.5 pt-1 border-t border-zinc-100 px-1">
                      <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
                        {onOpenProduct && (
                          <button
                            type="button"
                            onClick={() => {
                              onOpenProduct()
                            }}
                            className="min-h-12 text-[10px] font-semibold uppercase tracking-wide text-sky-700 bg-sky-50 hover:bg-sky-100 px-2 rounded-lg transition active:scale-[0.98]"
                          >
                            Ver producto
                          </button>
                        )}
                        {isManager && onOpenEditor && (
                          <button
                            type="button"
                            onClick={() => onOpenEditor()}
                            className="min-h-12 text-[10px] font-semibold uppercase tracking-wide text-[#36606F] bg-zinc-100 hover:bg-zinc-200 px-2 rounded-lg transition active:scale-[0.98]"
                          >
                            <span className="sm:hidden">Corregir</span>
                            <span className="hidden sm:inline">Corregir valores</span>
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
                              className="min-h-12 px-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 rounded-lg transition active:scale-[0.98]"
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
                              className="min-h-12 px-2 text-[10px] font-medium uppercase tracking-wide text-amber-700/80 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition active:scale-[0.98]"
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
                          className="min-h-12 w-full sm:w-auto text-[10px] font-medium uppercase tracking-wide text-zinc-600 bg-white border border-zinc-200 hover:bg-zinc-50 px-2 rounded-lg transition active:scale-[0.98]"
                        >
                          Restaurar estado
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>

              {/* Estado de vínculo — compacto */}
              <section className="bg-white rounded-lg border border-zinc-200 px-2 py-2 flex flex-col gap-1 min-w-0">
                {activeProvenance ? (
                  <div className="flex flex-col gap-0.5 px-1">
                    <span className="inline-flex w-fit items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800 uppercase tracking-wide">
                      <Check className="h-3 w-3" strokeWidth={3} />
                      Evidencia vinculada
                    </span>
                    <p className="text-[10px] font-normal text-zinc-500 leading-snug">
                      por {activeProvenance.linked_by || 'sistema'}
                      <span className="text-zinc-400"> · {new Date(activeProvenance.created_at).toLocaleString()}</span>
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5 px-1">
                    <span className="inline-flex w-fit items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-900 uppercase tracking-wide">
                      Pendiente de verificar
                    </span>
                    <p className="text-[10px] font-normal text-zinc-500 leading-snug">
                      {data.extraction
                        ? 'Confirma la fila OCR correspondiente a esta línea.'
                        : 'No hay extracción OCR disponible para este albarán.'}
                    </p>
                  </div>
                )}
                {data.provenanceChain.length > 1 ? (
                  <p className="px-1 text-[10px] font-normal text-amber-700">
                    Historial: {data.provenanceChain.length} vínculos
                  </p>
                ) : null}
              </section>

              {/* Evidencia de la línea — mismas filas que la tabla del albarán; solo documentRows */}
              {data.extraction && data.documentRows.length > 0 ? (
                <section className="bg-white rounded-lg border border-zinc-200 overflow-hidden flex flex-col min-w-0">
                  <div className="px-2 py-1.5 border-b border-zinc-100 flex flex-col gap-0.5">
                    <h3 className="text-[9px] font-black text-zinc-400 uppercase tracking-wider px-1">
                      {activeProvenance ? 'Evidencia documental vinculada' : 'Candidatas del documento'}
                    </h3>
                    <p className="text-[10px] font-normal text-zinc-500 leading-snug px-1">
                      {activeProvenance
                        ? 'Fila OCR vinculada a esta línea.'
                        : 'Filas OCR similares. Confirmar no cambia producto ni importes.'}
                    </p>
                  </div>

                  <div className="flex flex-col gap-0 min-w-0 px-2 pb-2">
                    <div className="flex items-center gap-1.5 sm:gap-3 px-1 py-1 border-b border-zinc-100">
                      <div className="flex-1 min-w-0 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                        Producto
                      </div>
                      <div className="flex items-center justify-end shrink-0 gap-1.5 sm:gap-3">
                        <div className="w-[3.25rem] sm:w-[4.5rem] text-right text-[9px] font-black uppercase tracking-wider text-zinc-400">
                          Cant.
                        </div>
                        <div className="w-[3.75rem] sm:w-[5rem] text-right text-[9px] font-black uppercase tracking-wider text-zinc-400">
                          Precio ud.
                        </div>
                        <div className="w-[3.75rem] sm:w-[5rem] text-right text-[9px] font-black uppercase tracking-wider text-zinc-400">
                          Importe
                        </div>
                      </div>
                    </div>

                    {data.documentRows.map((row) => {
                      const isActive = activeProvenance?.document_row_id === row.document_row_id
                      const isSelected = selectedRowId === row.document_row_id
                      const occupied = row.linkedOtherLines.length > 0
                      const desc = row.description || 'Sin descripción OCR'

                      const rowBody = (
                        <>
                          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {canSelectRows ? (
                                <span
                                  className={cn(
                                    'h-3 w-3 rounded-full border-2 shrink-0',
                                    isSelected ? 'border-[#36606F] bg-[#36606F]' : 'border-zinc-300'
                                  )}
                                  aria-hidden
                                />
                              ) : isActive ? (
                                <Check className="h-3 w-3 text-sky-600 shrink-0" strokeWidth={3} />
                              ) : null}
                              <span
                                className={cn(
                                  'text-xs font-medium truncate min-w-0',
                                  isActive ? 'text-sky-950' : 'text-zinc-900'
                                )}
                                title={desc}
                              >
                                {desc}
                              </span>
                            </div>
                            <p className="text-[9px] font-normal uppercase tracking-wider text-zinc-400 pl-0 sm:pl-0">
                              T{row.table_index + 1}·F{row.row_index}
                              {!row.isHeuristicCandidate ? ' · fuera heurística' : null}
                              {occupied
                                ? ` · ya vinculada${
                                    row.linkedOtherLines[0]?.original_name
                                      ? ` · «${row.linkedOtherLines[0].original_name}»`
                                      : ''
                                  }`
                                : null}
                            </p>
                          </div>
                          <div className="flex items-center justify-end shrink-0 gap-1.5 sm:gap-3">
                            <div className="w-[3.25rem] sm:w-[4.5rem] text-right">
                              <span className="text-[10px] sm:text-[11px] font-normal text-zinc-800 tabular-nums">
                                {formatNum(row.quantity)}
                              </span>
                            </div>
                            <div className="w-[3.75rem] sm:w-[5rem] text-right">
                              <span className="text-[10px] sm:text-[11px] font-normal text-zinc-800 tabular-nums">
                                {formatMoney(row.unit_price, 4)}
                              </span>
                            </div>
                            <div className="w-[3.75rem] sm:w-[5rem] text-right">
                              <span className="text-[10px] sm:text-[11px] font-normal text-zinc-800 tabular-nums">
                                {formatMoney(row.amount)}
                              </span>
                            </div>
                          </div>
                        </>
                      )

                      if (canSelectRows) {
                        return (
                          <button
                            key={row.document_row_id}
                            type="button"
                            onClick={() => {
                              setSelectedRowId(row.document_row_id)
                              setConfirmError(null)
                            }}
                            className={cn(
                              'group flex flex-row items-center gap-1.5 sm:gap-3 px-1 py-1.5 min-h-12 w-full text-left rounded-lg transition-colors hover:bg-zinc-50 active:bg-zinc-100 min-w-0',
                              isSelected && 'bg-[#36606F]/[0.06]'
                            )}
                          >
                            {rowBody}
                          </button>
                        )
                      }

                      return (
                        <div
                          key={row.document_row_id}
                          className={cn(
                            'flex flex-row items-center gap-1.5 sm:gap-3 px-1 py-1.5 min-h-12 rounded-lg min-w-0',
                            isActive && 'bg-sky-50'
                          )}
                        >
                          {rowBody}
                        </div>
                      )
                    })}
                  </div>

                  {canSelectRows ? (
                    <div className="shrink-0 border-t border-zinc-100 px-2 py-2 flex flex-col gap-1 bg-white">
                      {confirmError ? (
                        <p className="text-xs font-medium text-red-600 px-1">{confirmError}</p>
                      ) : null}
                      <button
                        type="button"
                        disabled={!selectedRowId || confirming}
                        onClick={() => void handleConfirmEvidence()}
                        className={cn(
                          'w-full min-h-12 rounded-lg text-xs font-semibold transition active:scale-[0.99]',
                          selectedRowId && !confirming
                            ? 'bg-[#36606F] text-white hover:bg-[#2c4f5c]'
                            : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                        )}
                      >
                        {confirming ? 'Confirmando…' : 'Confirmar evidencia'}
                      </button>
                      <p className="text-[9px] font-normal text-zinc-400 text-center leading-snug">
                        Solo vínculo documental · no modifica mapping
                      </p>
                    </div>
                  ) : null}
                </section>
              ) : data.extraction && !activeProvenance && data.hasExtractedTables ? (
                <section className="bg-white rounded-lg border border-zinc-200 px-3 py-4 text-center flex flex-col gap-1">
                  <p className="text-xs font-semibold text-zinc-800 uppercase tracking-wider">
                    Sin coincidencia automática
                  </p>
                  <p className="text-[11px] font-normal text-zinc-500 leading-snug">
                    No hay filas OCR razonablemente similares a esta línea.
                  </p>
                </section>
              ) : data.extraction && data.extraction.status === 'no_table' ? (
                <section className="bg-white rounded-lg border border-zinc-200 px-3 py-4 text-center text-[11px] font-medium text-zinc-500">
                  No se ha detectado una tabla documental en el archivo original.
                </section>
              ) : data.extraction && !data.hasExtractedTables ? (
                <section className="bg-white rounded-lg border border-zinc-200 px-3 py-4 text-center text-[11px] font-medium text-zinc-500">
                  El OCR no devolvió ninguna estructura tabular para esta extracción.
                </section>
              ) : !data.extraction ? (
                <section className="bg-white rounded-lg border border-zinc-200 px-3 py-4 text-center text-[11px] font-medium text-zinc-500">
                  No hay extracción OCR registrada para este albarán.
                </section>
              ) : null}

            </div>
          ) : null}
      </div>
    </Modal>
  )
}
