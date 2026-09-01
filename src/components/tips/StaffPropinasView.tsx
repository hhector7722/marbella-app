'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import {
  filterVisiblePlantillaEmployees,
  PLANTILLA_EMPLOYEE_SELECT,
} from '@/lib/staff/plantilla-employees';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import {
  mapStaffTipHistoryRows,
  STAFF_TIP_HISTORY_SELECT,
  type TipDistributionLineRow,
} from '@/lib/staff-tip-history';
import {
  formatLocalIsoDateLabel,
  formatRoundedTipMoney,
  type StaffTipHistoryEntry,
} from '@/lib/tip-distribution-display';
import { StaffTipRepartoPanel } from '@/components/tips/StaffTipRepartoPanel';
import { StaffTipDistributionDetailModal } from '@/components/tips/StaffTipDistributionDetailModal';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/Surface';
import { EmptyState } from '@/components/ui/EmptyState';

export type { StaffTipHistoryEntry };

type EmployeeOption = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
};

export default function StaffPropinasView({
  initialHistory,
  viewerUserId,
  viewerEmail,
  viewerFirstName = '',
}: {
  initialHistory: StaffTipHistoryEntry[];
  viewerUserId: string;
  viewerEmail: string;
  viewerFirstName?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const canSelectEmployee = isMasterDashboardUser(viewerEmail);

  const [history, setHistory] = useState(initialHistory);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<StaffTipHistoryEntry | null>(null);

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(viewerUserId);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);

  const lastEntry = useMemo(() => history[0] ?? null, [history]);

  const viewingOther = canSelectEmployee && selectedEmployeeId !== viewerUserId;
  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);
  const headerEmployeeLabel = viewingOther
    ? selectedEmployee?.first_name || 'Trabajador'
    : viewerFirstName.trim() || selectedEmployee?.first_name || 'Mis propinas';

  const fetchHistoryForUser = useCallback(
    async (userId: string) => {
      setHistoryLoading(true);
      try {
        const { data, error } = await supabase
          .from('tip_distribution_lines')
          .select(STAFF_TIP_HISTORY_SELECT)
          .eq('user_id', userId);

        if (error) throw error;
        setHistory(mapStaffTipHistoryRows(data as TipDistributionLineRow[] | null));
      } catch (e: unknown) {
        console.error(e);
        toast.error('Error crítico al cargar las propinas del trabajador.');
        setHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    if (!canSelectEmployee) return;

    void (async () => {
      const { data: emps, error } = await supabase
        .from('profiles')
        .select(PLANTILLA_EMPLOYEE_SELECT)
        .eq('visible_in_plantilla', true)
        .order('first_name');

      if (error) {
        console.error(error);
        toast.error('No se pudo cargar la lista de trabajadores.');
        return;
      }

      setEmployees(filterVisiblePlantillaEmployees((emps ?? []) as EmployeeOption[]));
    })();
  }, [canSelectEmployee, supabase]);

  useEffect(() => {
    if (!canSelectEmployee) return;
    if (selectedEmployeeId === viewerUserId) {
      setHistory(initialHistory);
      return;
    }
    void fetchHistoryForUser(selectedEmployeeId);
  }, [canSelectEmployee, selectedEmployeeId, viewerUserId, initialHistory, fetchHistoryForUser]);

  const emptyLastMessage = viewingOther
    ? 'Este trabajador aún no tiene repartos confirmados.'
    : 'Aún no tienes repartos confirmados.';

  const emptyHistoryMessage = viewingOther
    ? 'Sin repartos anteriores para este trabajador.'
    : 'Sin repartos anteriores.';

  return (
    <>
      <DashboardDetailLayout
        title="Propinas"
        showBackButton={false}
        template="detail"
        work="catalog"
        maxWidthClass="max-w-2xl"
        contentClassName="flex flex-col gap-4 p-0"
        rightSlot={
          canSelectEmployee ? (
            <div className="relative shrink-0">
              <Button
                type="button"
                variant="tertiary"
                instance="staff-propinas-select-employee"
                onClick={() => setShowEmployeeModal(true)}
              >
                {headerEmployeeLabel}
              </Button>
              {viewingOther ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedEmployeeId(viewerUserId);
                  }}
                  className="absolute -right-1.5 -top-1.5 z-30 flex h-6 w-6 min-h-12 min-w-12 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-colors hover:bg-red-600"
                  aria-label="Ver mis propinas"
                >
                  <X size={10} strokeWidth={4} />
                </button>
              ) : null}
            </div>
          ) : null
        }
      >
        <Surface variant="block" instance="staff-propinas-last">
          <div data-element="header">
            <span data-element="title">Último reparto</span>
          </div>
          <div className="p-4">
            {historyLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner className="text-ds-marca" />
              </div>
            ) : !lastEntry ? (
              <EmptyState
                instance="staff-propinas-last-empty"
                variant="none"
                title={emptyLastMessage}
              />
            ) : (
              <StaffTipRepartoPanel entry={lastEntry} />
            )}
          </div>
        </Surface>

        <Surface variant="block" instance="staff-propinas-history">
          <div data-element="header">
            <span data-element="title">Historial</span>
          </div>
          <div className="px-4 pb-2">
            {historyLoading ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner className="text-ds-marca" />
              </div>
            ) : history.length === 0 ? (
              <EmptyState
                instance="staff-propinas-history-empty"
                variant="none"
                title={emptyHistoryMessage}
              />
            ) : (
              <ul className="divide-y divide-zinc-100">
                {history.map((entry) => (
                  <li key={entry.lineId}>
                    <button
                      type="button"
                      onClick={() => setSelectedEntry(entry)}
                      className="flex min-h-12 w-full items-center justify-between gap-3 py-4 text-left transition-colors hover:bg-zinc-50/80 active:scale-[0.99] first:pt-3 last:pb-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-zinc-900">
                          {formatLocalIsoDateLabel(entry.periodStart, 'd MMM')} –{' '}
                          {formatLocalIsoDateLabel(entry.periodEnd, 'd MMM yyyy')}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-base font-black tabular-nums text-emerald-600">
                          {formatRoundedTipMoney(entry.totalAmount)}
                        </span>
                        <ChevronRight size={18} className="text-zinc-300" strokeWidth={2.5} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Surface>
      </DashboardDetailLayout>

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
            setSelectedEmployeeId(emp.id);
            setShowEmployeeModal(false);
          }}
        />
      ) : null}
    </>
  );
}
