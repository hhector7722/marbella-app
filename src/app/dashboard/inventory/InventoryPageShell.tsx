'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Modal } from '@/components/ui/modal'
import { InventoryClient, type ManagerIngredientRow } from './InventoryClient'
import {
  certifyInventoryCount,
  getInventoryCountDetail,
  listPendingInventoryCounts,
  rejectInventoryCount,
  type PendingInventoryCount,
  type PendingInventoryCountDetail,
} from './actions'

type Props = {
  userId: string
  visibleIngredients: ManagerIngredientRow[]
  managerFullList: ManagerIngredientRow[]
  managerEmptyHint: boolean
  initialPending: PendingInventoryCount[]
}

function formatPendingDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function InventoryPageShell({
  userId,
  visibleIngredients,
  managerFullList,
  managerEmptyHint,
  initialPending,
}: Props) {
  const router = useRouter()
  const [visibilityEditMode, setVisibilityEditMode] = useState(false)
  const [pending, setPending] = useState<PendingInventoryCount[]>(initialPending)
  const [pendingOpen, setPendingOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<PendingInventoryCountDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)

  const refreshPending = useCallback(async () => {
    const rows = await listPendingInventoryCounts()
    setPending(rows)
  }, [])

  const closePanel = () => {
    setPendingOpen(false)
    setSelectedId(null)
    setDetail(null)
  }

  const openPanel = () => {
    setSelectedId(null)
    setDetail(null)
    setPendingOpen(true)
    void refreshPending()
  }

  const openDetail = async (id: string) => {
    setSelectedId(id)
    setDetail(null)
    setDetailLoading(true)
    try {
      setDetail(await getInventoryCountDetail(id))
    } finally {
      setDetailLoading(false)
    }
  }

  const handleCertify = async () => {
    if (!selectedId) return
    setBusy(true)
    try {
      const res = await certifyInventoryCount(selectedId)
      toast.success(res.message)
      setSelectedId(null)
      setDetail(null)
      await refreshPending()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo certificar el recuento.')
    } finally {
      setBusy(false)
    }
  }

  const handleReject = async () => {
    if (!selectedId) return
    setBusy(true)
    try {
      await rejectInventoryCount(selectedId)
      toast.success('Recuento rechazado.')
      setRejectOpen(false)
      setSelectedId(null)
      setDetail(null)
      await refreshPending()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo rechazar el recuento.')
    } finally {
      setBusy(false)
    }
  }

  const footer =
    selectedId && detail ? (
      <div className="flex w-full min-w-0 items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          instance="inventory-pending-back"
          onClick={() => {
            setSelectedId(null)
            setDetail(null)
          }}
          disabled={busy}
        >
          Atrás
        </Button>
        <Button
          type="button"
          variant="destructive"
          instance="inventory-pending-reject"
          onClick={() => setRejectOpen(true)}
          disabled={busy}
        >
          Rechazar
        </Button>
        <Button
          type="button"
          variant="primary"
          instance="inventory-pending-certify"
          onClick={handleCertify}
          loading={busy}
        >
          Certificar
        </Button>
      </div>
    ) : undefined

  return (
    <>
      <InventoryClient
        initialIngredients={visibleIngredients}
        userId={userId}
        managerFullList={managerFullList}
        visibilityEditMode={visibilityEditMode}
        onCloseVisibilityEditMode={() => setVisibilityEditMode(false)}
        managerEmptyHint={managerEmptyHint}
        pendingCount={pending.length}
        onOpenPending={openPanel}
        rightSlot={
          <Button
            type="button"
            variant="tertiary"
            instance="inventory-visibility-edit"
            icon={<Pencil strokeWidth={2} />}
            aria-label={visibilityEditMode ? 'Salir de edición de lista' : 'Editar lista de inventario'}
            onClick={() => setVisibilityEditMode((v) => !v)}
          />
        }
      />

      <Modal
        open={pendingOpen}
        onClose={closePanel}
        title={selectedId ? 'Certificar recuento' : 'Recuentos pendientes'}
        variant="compact"
        layer="base"
        instance="inventory-pending-counts"
        usageId="inventory-pending-counts"
        usageLabel="Certificar recuentos de inventario"
        footer={footer}
        loading={detailLoading}
      >
        {selectedId && detail ? (
          <div className="flex flex-col gap-3 p-3">
            <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400">
              {detail.createdByName} · {formatPendingDate(detail.createdAt)}
            </p>
            {detail.lines.length === 0 ? (
              <p className="text-sm text-zinc-500">Este recuento no tiene líneas.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-zinc-100">
                {detail.lines.map((line) => (
                  <li
                    key={line.ingredientId}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm font-bold text-zinc-800">
                      {line.ingredientName}
                    </span>
                    <span className="shrink-0 text-right text-[11px] font-black tabular-nums text-zinc-500">
                      {line.physicalStock} / {line.theoreticalStock} {line.unit}
                      <span className={line.delta === 0 ? 'text-zinc-300' : 'text-amber-600'}>
                        {' '}
                        ({line.delta > 0 ? '+' : ''}
                        {line.delta})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : pending.length === 0 ? (
          <div className="p-6">
            <p className="text-center text-sm text-zinc-500">No hay recuentos pendientes.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-3">
            {pending.map((row) => (
              <Button
                key={row.id}
                type="button"
                variant="secondary"
                layout="fill"
                instance={`inventory-pending-row-${row.id}`}
                onClick={() => void openDetail(row.id)}
              >
                {`${row.createdByName} · ${formatPendingDate(row.createdAt)} · ${row.differenceCount} dif.`}
              </Button>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Rechazar recuento"
        confirmLabel="Rechazar"
        confirmVariant="destructive"
        instance="inventory-pending-reject-confirm"
        usageLabel="Confirmar rechazo de recuento de inventario"
        confirming={busy}
        onConfirm={() => void handleReject()}
      >
        El recuento se marcará como rechazado y no producirá movimientos de stock.
      </ConfirmModal>
    </>
  )
}
