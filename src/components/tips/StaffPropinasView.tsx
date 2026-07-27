'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Wallet, X } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Button,
  EmptyState,
  List,
  ListItem,
  LoadingBlock,
  PageActions,
  PageHeader,
  Surface,
  Text,
} from '@/components/mds'
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal'
import {
  filterVisiblePlantillaEmployees,
  PLANTILLA_EMPLOYEE_SELECT,
} from '@/lib/staff/plantilla-employees'
import { isMasterDashboardUser } from '@/lib/master-dashboard'
import {
  mapStaffTipHistoryRows,
  STAFF_TIP_HISTORY_SELECT,
  type TipDistributionLineRow,
} from '@/lib/staff-tip-history'
import {
  formatLocalIsoDateLabel,
  formatRoundedTipMoney,
  type StaffTipHistoryEntry,
} from '@/lib/tip-distribution-display'
import { StaffTipRepartoPanel } from '@/components/tips/StaffTipRepartoPanel'
import { StaffTipDistributionDetailModal } from '@/components/tips/StaffTipDistributionDetailModal'

export type { StaffTipHistoryEntry }

type EmployeeOption = {
  id: string
  first_name: string
  last_name: string
  avatar_url?: string | null
}

export default function StaffPropinasView({
  initialHistory,
  viewerUserId,
  viewerEmail,
  viewerFirstName = '',
}: {
  initialHistory: StaffTipHistoryEntry[]
  viewerUserId: string
  viewerEmail: string
  viewerFirstName?: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const canSelectEmployee = isMasterDashboardUser(viewerEmail)

  const [history, setHistory] = useState(initialHistory)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<StaffTipHistoryEntry | null>(
    null
  )

  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(viewerUserId)
  const [showEmployeeModal, setShowEmployeeModal] = useState(false)

  const lastEntry = useMemo(() => history[0] ?? null, [history])

  const viewingOther = canSelectEmployee && selectedEmployeeId !== viewerUserId
  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId)
  const headerEmployeeLabel = viewingOther
    ? selectedEmployee?.first_name || 'Trabajador'
    : viewerFirstName.trim() || selectedEmployee?.first_name || 'Mis propinas'

  const fetchHistoryForUser = useCallback(
    async (userId: string) => {
      setHistoryLoading(true)
      try {
        const { data, error } = await supabase
          .from('tip_distribution_lines')
          .select(STAFF_TIP_HISTORY_SELECT)
          .eq('user_id', userId)

        if (error) throw error
        setHistory(mapStaffTipHistoryRows(data as TipDistributionLineRow[] | null))
      } catch (e: unknown) {
        console.error(e)
        toast.error('Error crítico al cargar las propinas del trabajador.')
        setHistory([])
      } finally {
        setHistoryLoading(false)
      }
    },
    [supabase]
  )

  useEffect(() => {
    if (!canSelectEmployee) return

    void (async () => {
      const { data: emps, error } = await supabase
        .from('profiles')
        .select(PLANTILLA_EMPLOYEE_SELECT)
        .eq('visible_in_plantilla', true)
        .order('first_name')

      if (error) {
        console.error(error)
        toast.error('No se pudo cargar la lista de trabajadores.')
        return
      }

      setEmployees(filterVisiblePlantillaEmployees((emps ?? []) as EmployeeOption[]))
    })()
  }, [canSelectEmployee, supabase])

  useEffect(() => {
    if (!canSelectEmployee) return
    if (selectedEmployeeId === viewerUserId) {
      setHistory(initialHistory)
      return
    }
    void fetchHistoryForUser(selectedEmployeeId)
  }, [
    canSelectEmployee,
    selectedEmployeeId,
    viewerUserId,
    initialHistory,
    fetchHistoryForUser,
  ])

  const emptyLastMessage = viewingOther
    ? 'Este trabajador aún no tiene repartos confirmados.'
    : 'Aún no tienes repartos confirmados.'

  const emptyHistoryMessage = viewingOther
    ? 'Sin repartos anteriores para este trabajador.'
    : 'Sin repartos anteriores.'

  return (
    <div className="space-y-4">
      <PageHeader
        title="Propinas"
        description="Último reparto e historial personal."
        actions={
          canSelectEmployee ? (
            <PageActions>
              <div className="relative shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEmployeeModal(true)}
                  className={cn(
                    'min-h-12 gap-1.5 px-3 text-[10px] uppercase tracking-widest',
                    viewingOther && 'border-mds-primary/40 bg-mds-primary/5'
                  )}
                >
                  <span className="max-w-[96px] truncate">{headerEmployeeLabel}</span>
                  <ChevronDown className="size-3.5 shrink-0 opacity-50" aria-hidden />
                </Button>
                {viewingOther ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedEmployeeId(viewerUserId)
                    }}
                    className="absolute -right-1.5 -top-1.5 z-30 flex size-[18px] min-h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-mds-surface bg-mds-danger text-white shadow-lg transition-colors hover:bg-mds-danger/90"
                    aria-label="Ver mis propinas"
                  >
                    <X size={8} strokeWidth={4} aria-hidden />
                  </button>
                ) : null}
              </div>
            </PageActions>
          ) : undefined
        }
      />

      <Surface className="overflow-hidden p-0 shadow-sm">
        <div className="border-b border-mds-border px-4 py-3">
          <Text
            as="h2"
            className="text-xs font-black uppercase tracking-widest text-mds-primary"
          >
            Último reparto
          </Text>
        </div>
        <div className="p-4">
          {historyLoading ? (
            <LoadingBlock className="py-8" />
          ) : !lastEntry ? (
            <EmptyState
              variant="compact"
              icon={Wallet}
              title={emptyLastMessage}
            />
          ) : (
            <StaffTipRepartoPanel entry={lastEntry} />
          )}
        </div>
      </Surface>

      <Surface className="overflow-hidden p-0 shadow-sm">
        <div className="border-b border-mds-border px-4 py-3">
          <Text
            as="h2"
            className="text-xs font-black uppercase tracking-widest text-mds-primary"
          >
            Historial
          </Text>
        </div>
        <div className="p-4">
          {historyLoading ? (
            <LoadingBlock className="py-6" />
          ) : history.length === 0 ? (
            <EmptyState
              variant="compact"
              icon={Wallet}
              title={emptyHistoryMessage}
            />
          ) : (
            <List className="rounded-none border-0 shadow-none">
              {history.map((entry) => (
                <ListItem key={entry.lineId} className="p-0 hover:bg-transparent">
                  <button
                    type="button"
                    onClick={() => setSelectedEntry(entry)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 px-1 py-3 text-left transition-colors hover:bg-mds-muted-surface/80 active:scale-[0.99]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-mds-foreground">
                        {formatLocalIsoDateLabel(entry.periodStart, 'd MMM')} –{' '}
                        {formatLocalIsoDateLabel(entry.periodEnd, 'd MMM yyyy')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-base font-black tabular-nums text-mds-success">
                        {formatRoundedTipMoney(entry.totalAmount)}
                      </span>
                      <ChevronRight
                        size={18}
                        className="text-mds-muted"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    </div>
                  </button>
                </ListItem>
              ))}
            </List>
          )}
        </div>
      </Surface>

      <StaffTipDistributionDetailModal
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />

      {canSelectEmployee ? (
        <StaffSelectionModal
          isOpen={showEmployeeModal}
          onClose={() => setShowEmployeeModal(false)}
          employees={employees}
          title="Trabajador"
          onSelect={(emp) => {
            setSelectedEmployeeId(emp.id)
            setShowEmployeeModal(false)
          }}
        />
      ) : null}
    </div>
  )
}
