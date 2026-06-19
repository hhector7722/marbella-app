'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
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
        .select('id, first_name, last_name, avatar_url')
        .is('end_date', null)
        .order('first_name');

      if (error) {
        console.error(error);
        toast.error('No se pudo cargar la lista de trabajadores.');
        return;
      }

      setEmployees(
        (emps ?? []).filter((e) => {
          const name = (e.first_name || '').trim().toLowerCase();
          return name !== 'ramon' && name !== 'ramón' && name !== 'empleado';
        }) as EmployeeOption[]
      );
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
    <div className="min-h-screen bg-[#5B8FB9] pb-24">
      <main className="mx-auto max-w-lg space-y-4 px-4 py-4">
        <section className="overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="border-b border-zinc-100 bg-[#36606F] px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-black uppercase tracking-wide text-white">Propinas</h2>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-white/75">
                  Último reparto
                </p>
              </div>

              {canSelectEmployee ? (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowEmployeeModal(true)}
                    className={cn(
                      'flex h-8 min-h-[48px] shrink-0 items-center justify-center rounded-lg border px-3 text-[8px] font-black uppercase tracking-widest text-white transition-all active:scale-95',
                      viewingOther
                        ? 'border-white/30 bg-white/20'
                        : 'border-white/10 bg-white/10 hover:bg-white/20'
                    )}
                  >
                    <span className="max-w-[72px] truncate">{headerEmployeeLabel}</span>
                    <ChevronDown size={10} className="ml-1.5 shrink-0 opacity-40" />
                  </button>
                  {viewingOther ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEmployeeId(viewerUserId);
                      }}
                      className="absolute -right-1.5 -top-1.5 z-30 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-[#36606F] bg-red-500 text-white shadow-lg transition-colors hover:bg-red-600"
                      aria-label="Ver mis propinas"
                    >
                      <X size={8} strokeWidth={4} />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="p-4">
            {historyLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner className="text-[#36606F]" />
              </div>
            ) : !lastEntry ? (
              <p className="text-sm font-medium text-zinc-500">{emptyLastMessage}</p>
            ) : (
              <StaffTipRepartoPanel entry={lastEntry} />
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="border-b border-zinc-100 bg-[#36606F] px-4 py-3">
            <h2 className="text-sm font-black uppercase tracking-wide text-white">Historial</h2>
          </div>

          <div className="p-4">
            {historyLoading ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner className="text-[#36606F]" />
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm font-medium text-zinc-500">{emptyHistoryMessage}</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {history.map((entry) => (
                  <li key={entry.lineId}>
                    <button
                      type="button"
                      onClick={() => setSelectedEntry(entry)}
                      className="flex min-h-12 w-full items-center justify-between gap-3 py-4 text-left transition-colors hover:bg-zinc-50/80 active:scale-[0.99] first:pt-0 last:pb-0"
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
        </section>
      </main>

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
    </div>
  );
}
