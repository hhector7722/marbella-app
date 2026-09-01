'use client';

/* eslint-disable @next/next/no-img-element */

import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import {
    X, Share, User
} from 'lucide-react';
import { buildTimesheetPayload, type TimesheetExportPayload, type TimesheetWeekData } from '@/lib/staff/timesheet-export-payload';
import type { HistoryWeekDto } from '@/lib/read-models/week-display-from-engine';
import {
    SimulationUnavailableError,
} from '@/lib/staff/staff-schedule-normalizer';
import { buildCoordinatedPlantillaSimulation } from '@/lib/staff/coordinated-plantilla-simulation';
import { generateTimesheetPdf, generateTimesheetPdfMulti, openPdfBlob, timesheetPdfBlob, timesheetPdfMultiBlob } from '@/lib/staff/timesheet-pdf';
import { generateTimesheetXlsx, generateTimesheetXlsxMulti } from '@/lib/staff/timesheet-xlsx';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import {
    format,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
    isSameDay,
} from 'date-fns';
import { formatMadridHmFromIso, formatYmdInMadrid, madridRangeUtcIso } from '@/lib/madrid-date-bounds';
import { es } from 'date-fns/locale';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { PeriodNav, PeriodFilterButton } from '@/components/time/PeriodNav';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import type { TimeFilterValue } from '@/components/time/time-filter-types';
import { MonthCalendarFrame } from '@/components/time/MonthCalendarFrame';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { trackUsageModalApply } from '@/lib/usage/client';
import { staffSelectionApplySummary } from '@/lib/usage/modal-apply';
import { toast } from 'sonner';
import { updateWeeklyWorkerConfig } from '@/app/actions/overtime';
import { AttendanceDetailModal } from '@/components/modals/AttendanceDetailModal';
import { DaySummaryModal } from '@/components/modals/DaySummaryModal';
import { WeekSummary } from '@/components/staff/WeekSummary';
import { PlantillaWeekCard, type PlantillaWeek, type PlantillaDay, type PlantillaDayLog } from './PlantillaWeekCard';
import { MultiEmployeeExportModal } from '@/components/modals/MultiEmployeeExportModal';
import {
    SimulationPlantillaExportModal,
    type SimulationPlantillaEmployee,
} from '@/components/modals/SimulationPlantillaExportModal';
import {
    getEmployeeHistoryMonth,
    getEmployeeHistoryRange,
} from '@/app/actions/history-read';
import { buildEmployeeWeeksFromTimeLogs } from '@/lib/staff/build-employee-weeks-from-logs';
import {
    filterVisiblePlantillaEmployees,
    PLANTILLA_EMPLOYEE_SELECT,
} from '@/lib/staff/plantilla-employees';

// --- TIPOS ---
type WeekData = HistoryWeekDto;

// --- CONSTANTES ---
const getMonthLabel = (year: number, month: number) =>
    format(new Date(year, month, 1), 'MMMM yyyy', { locale: es });

function buildSimulationPeriodLabel(
    joiningDate: string | null | undefined,
    year: number,
    lastMonth0: number,
): string {
    const endLabel = format(new Date(year, lastMonth0, 1), 'MMM yyyy', { locale: es });
    const joinYmd = joiningDate?.slice(0, 10);
    const yearStart = `${year}-01-01`;
    if (joinYmd && joinYmd > yearStart) {
        const [y, m, d] = joinYmd.split('-').map(Number);
        const startLabel = format(new Date(y, m - 1, d), 'MMM yyyy', { locale: es });
        return `${startLabel} – ${endLabel}`;
    }
    return `Ene – ${endLabel}`;
}

type Employee = { id: string; first_name: string; last_name: string; avatar_url?: string | null };

export default function HistoryPage() {
    const supabase = createClient();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const [loading, setLoading] = useState(true);
    const [weeksData, setWeeksData] = useState<WeekData[]>([]);

    // Auth & Rol
    const [userRole, setUserRole] = useState<string>('staff');
    const [currentUserId, setCurrentUserId] = useState<string>('');
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
    const [selectedEmployeeLabel, setSelectedEmployeeLabel] = useState<string>('');
    const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);

    const [filterYear, setFilterYear] = useState(new Date().getFullYear());
    const [filterMonth, setFilterMonth] = useState(new Date().getMonth()); // 0-indexed

    const [isTimeFilterOpen, setIsTimeFilterOpen] = useState(false);

    useModalUsageTracking({
        open: showEmployeeDropdown,
        usageId: 'staff-history-employee-filter',
        usageLabel: 'Filtro asistencia',
    });

    const [editingDate, setEditingDate] = useState<string | null>(null);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [plantillaWeeksData, setPlantillaWeeksData] = useState<PlantillaWeek[]>([]);
    const [summaryDate, setSummaryDate] = useState<string | null>(null);
    const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [userEmail, setUserEmail] = useState<string>('');
    const [showExportEmployeeModal, setShowExportEmployeeModal] = useState(false);
    const [showSimulationExportModal, setShowSimulationExportModal] = useState(false);
    const [simulationEmployees, setSimulationEmployees] = useState<SimulationPlantillaEmployee[]>([]);

    const initUser = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        if (!user) return;
        setCurrentUserId(user.id);
        setUserEmail(user.email ?? '');

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profile) setUserRole(profile.role);
        if (profile?.role === 'manager') {
            setSelectedEmployeeId('');
            setSelectedEmployeeLabel('');
        } else {
            setSelectedEmployeeId(user.id);
        }

        if (profile?.role === 'manager') {
            const { data: emps } = await supabase
                .from('profiles')
                .select(PLANTILLA_EMPLOYEE_SELECT)
                .eq('visible_in_plantilla', true)
                .order('first_name');

            setEmployees(filterVisiblePlantillaEmployees((emps || []) as Employee[]));
        }
    }, [supabase]);

    useEffect(() => { void initUser(); }, [initUser]);
    // Manager: si se entra con ?id=xxx (ej. desde /profile?id=xxx), preseleccionar ese trabajador
    useEffect(() => {
        const id = searchParams.get('id');
        if (userRole !== 'manager' || !id || !currentUserId) return;

        setSelectedEmployeeId(id);
        const emp = employees.find((e) => e.id === id);
        if (emp) {
            setSelectedEmployeeLabel(staffSelectionApplySummary(emp));
            return;
        }

        void supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .eq('id', id)
            .maybeSingle()
            .then(({ data }) => {
                if (!data) return;
                setSelectedEmployeeLabel(staffSelectionApplySummary(data as Employee));
            });
    }, [searchParams, userRole, currentUserId, employees, supabase]);

    useEffect(() => {
        if (!currentUserId) return;
        const isPlantilla = userRole === 'manager' && selectedEmployeeId === '';
        if (isPlantilla) {
            fetchPlantilla();
        } else {
            fetchCalendar();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedEmployeeId, currentUserId, filterYear, filterMonth, userRole]);

    async function fetchCalendar() {
        setLoading(true);
        try {
            const targetUserId = selectedEmployeeId || currentUserId;
            const res = await getEmployeeHistoryMonth({
                userId: targetUserId,
                filterYear,
                filterMonth,
            });
            if (!res.success) {
                toast.error(res.error || 'Error al cargar el historial del empleado.');
                setWeeksData([]);
                return;
            }
            setWeeksData(res.weeks as WeekData[]);
        } catch (err) {
            console.error('fetchCalendar error:', err);
            const detail = err instanceof Error && err.message ? err.message : '';
            toast.error(
                detail
                    ? `Error al cargar el historial: ${detail}`
                    : 'Error al cargar el historial del empleado.',
            );
            setWeeksData([]);
        } finally {
            setLoading(false);
        }
    }

    async function fetchPlantilla() {
        setLoading(true);
        try {
            const monthStart = new Date(filterYear, filterMonth, 1);
            const monthEnd = new Date(filterYear, filterMonth + 1, 0);
            const rangeStart = startOfWeek(startOfMonth(monthStart), { weekStartsOn: 1 });
            const rangeEnd = endOfWeek(endOfMonth(monthEnd), { weekStartsOn: 1 });

            const rangeStartYmd = format(rangeStart, 'yyyy-MM-dd');
            const rangeEndYmd = format(rangeEnd, 'yyyy-MM-dd');
            const { startIso, endIso } = madridRangeUtcIso(rangeStartYmd, rangeEndYmd);

            const logsRes = await supabase
                .from('time_logs')
                .select('id, user_id, clock_in, clock_out, event_type, clock_out_show_no_registrada')
                .gte('clock_in', startIso)
                .lte('clock_in', endIso);

            const logsRaw = logsRes.data || [];
            const userIds = [...new Set(logsRaw.map((log: { user_id: string }) => log.user_id))];

            let profiles: { id: string; first_name?: string; last_name?: string }[] = [];
            if (userIds.length > 0) {
                const { data: profilesData, error: profilesError } = await supabase
                    .from('profiles')
                    .select('id, first_name, last_name')
                    .in('id', userIds);

                if (profilesError) {
                    console.error('Error fetching profiles for plantilla:', profilesError);
                } else {
                    profiles = profilesData || [];
                }
            }

            profiles = profiles.filter((p: { first_name?: string }) => {
                const name = (p.first_name || '').trim().toLowerCase();
                return name !== 'ramon' && name !== 'ramón' && name !== 'empleado';
            });

            const profileMap = new Map(profiles.map((p: { id: string }) => [p.id, p]));
            const enrichedLogs = logsRaw.map((log: { user_id: string; clock_in: string; clock_out: string | null; event_type?: string; clock_out_show_no_registrada?: boolean; id: string }) => {
                const p = profileMap.get(log.user_id) as { first_name?: string; last_name?: string } | undefined;
                return {
                    ...log,
                    first_name: p?.first_name ?? '',
                    last_name: p?.last_name ?? '',
                    in_time: formatMadridHmFromIso(log.clock_in) ?? '',
                    out_time: log.clock_out ? (formatMadridHmFromIso(log.clock_out) ?? '') : '',
                };
            });

            const calendarDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
            const weeks: PlantillaWeek[] = [];
            for (let i = 0; i < calendarDays.length; i += 7) {
                const weekDays = calendarDays.slice(i, i + 7);
                const weekStart = weekDays[0];
                const weekNumber = Math.ceil((weekStart.getDate() + startOfMonth(monthStart).getDay() - 1) / 7) || 1;
                const days = weekDays.map((day): PlantillaDay => {
                    const dayYmd = format(day, 'yyyy-MM-dd');
                    const dayLogs = enrichedLogs.filter((l: { clock_in: string }) => formatYmdInMadrid(l.clock_in) === dayYmd);
                    const y = day.getFullYear();
                    const m = day.getMonth();
                    const isOtherMonth = m !== filterMonth || y !== filterYear;
                    const logs: PlantillaDayLog[] = dayLogs.map((l: { id: string; user_id: string; first_name?: string; last_name?: string; clock_in: string; clock_out: string | null; event_type?: string; clock_out_show_no_registrada?: boolean; in_time: string; out_time: string }) => ({
                        id: l.id,
                        user_id: l.user_id,
                        first_name: l.first_name,
                        last_name: l.last_name,
                        clock_in: l.clock_in,
                        clock_out: l.clock_out,
                        event_type: l.event_type || 'regular',
                        clock_out_show_no_registrada: l.clock_out_show_no_registrada === true,
                        in_time: l.in_time,
                        out_time: l.out_time,
                    }));
                    return {
                        date: format(day, 'yyyy-MM-dd'),
                        dayNumber: day.getDate(),
                        dayName: format(day, 'EEE', { locale: es }),
                        isToday: isSameDay(day, new Date()),
                        isOtherMonth,
                        logs,
                    };
                });
                weeks.push({
                    weekNumber: weeks.length + 1,
                    startDate: format(weekStart, 'yyyy-MM-dd'),
                    days,
                });
            }
            setPlantillaWeeksData(weeks);
        } catch (err) {
            console.error('fetchPlantilla error:', err);
            setPlantillaWeeksData([]);
        } finally {
            setLoading(false);
        }
    }

    const nextMonth = () => {
        if (filterMonth === 11) {
            setFilterMonth(0);
            setFilterYear(prev => prev + 1);
        } else {
            setFilterMonth(prev => prev + 1);
        }
    };

    const prevMonth = () => {
        if (filterMonth === 0) {
            setFilterMonth(11);
            setFilterYear(prev => prev - 1);
        } else {
            setFilterMonth(prev => prev - 1);
        }
    };

    const isManager = userRole === 'manager';
    const isPlantilla = isManager && selectedEmployeeId === '';
    const isMaster = isMasterDashboardUser(userEmail);

    const headerLabel = isPlantilla
        ? 'Plantilla'
        : selectedEmployeeLabel ||
          staffSelectionApplySummary(
              employees.find((e) => e.id === selectedEmployeeId) ?? {
                  id: selectedEmployeeId,
                  first_name: '',
                  last_name: '',
              }
          );
    const filteredEmployee = employees.find((e) => e.id === selectedEmployeeId);
    const filteredInitials = (() => {
        if (filteredEmployee) {
            const a = filteredEmployee.first_name.trim().charAt(0);
            const b = filteredEmployee.last_name.trim().charAt(0);
            return `${a}${b}`.toUpperCase() || '?';
        }
        const parts = selectedEmployeeLabel.trim().split(/\s+/).filter(Boolean);
        return parts.slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase() || '?';
    })();

    const summaryLogs = (() => {
        if (!summaryDate || !plantillaWeeksData.length) return [];
        for (const w of plantillaWeeksData) {
            const d = w.days.find((day) => day.date === summaryDate);
            if (d) return d.logs.map((l) => ({ ...l, employee_name: l.first_name }));
        }
        return [];
    })();

    /**
     * Construye el payload de exportación obteniendo el DNI del empleado
     * de forma lazy (solo al pulsar exportar, no al cargar la página).
     */
    async function handleExport(type: 'pdf' | 'xlsx') {
        setShowExportMenu(false);
        setIsExporting(true);
        try {
            const targetId = selectedEmployeeId || currentUserId;

            const targetEmployee = employees.find((e) => e.id === targetId);
            const fullName = targetEmployee
                ? `${targetEmployee.first_name} ${targetEmployee.last_name}`.trim()
                : headerLabel;

            let dni: string | null = null;
            let contractedHoursWeekly = 0;
            try {
                const { data: profileRow } = await supabase
                    .from('profiles')
                    .select('dni, contracted_hours_weekly')
                    .eq('id', targetId)
                    .maybeSingle();
                dni = profileRow?.dni ?? null;
                contractedHoursWeekly = Number(profileRow?.contracted_hours_weekly ?? 0);
            } catch {
                // DNI opcional
            }

            const payload = buildTimesheetPayload(
                weeksData as TimesheetWeekData[],
                fullName,
                dni,
                filterYear,
                filterMonth,
                undefined,
                contractedHoursWeekly,
            );

            if (type === 'pdf') {
                await generateTimesheetPdf(payload);
            } else {
                generateTimesheetXlsx(payload);
            }
        } catch (err) {
            console.error('Export error:', err);
            toast.error('Error al generar el documento');
        } finally {
            setIsExporting(false);
        }
    }

    async function buildCurrentViewPdf(): Promise<{ blob: Blob; filename: string } | null> {
        if (isPlantilla) {
            const selectedIds = employees.map((e) => e.id);
            const exportPayloads: Array<{
                employee: { fullName: string; dni: string | null };
                payload: TimesheetExportPayload;
            }> = [];

            for (const id of selectedIds) {
                const emp = employees.find((e) => e.id === id);
                if (!emp) continue;
                const fullName = `${emp.first_name} ${emp.last_name}`.trim();
                const { data: profileRow } = await supabase
                    .from('profiles')
                    .select('dni, contracted_hours_weekly')
                    .eq('id', id)
                    .maybeSingle();
                const dni = profileRow?.dni ?? null;
                const contractedHoursWeekly = Number(profileRow?.contracted_hours_weekly ?? 0);
                const res = await getEmployeeHistoryMonth({
                    userId: id,
                    filterYear,
                    filterMonth,
                });
                if (!res.success) continue;
                const payload = buildTimesheetPayload(
                    res.weeks as TimesheetWeekData[],
                    fullName,
                    dni,
                    filterYear,
                    filterMonth,
                    undefined,
                    contractedHoursWeekly,
                );
                if (payload.rows.length === 0) continue;
                exportPayloads.push({ employee: { fullName, dni }, payload });
            }

            if (exportPayloads.length === 0) {
                toast.error('No hay registros para exportar');
                return null;
            }
            return timesheetPdfMultiBlob(exportPayloads);
        }

        const targetId = selectedEmployeeId || currentUserId;
        const targetEmployee = employees.find((e) => e.id === targetId);
        const fullName = targetEmployee
            ? `${targetEmployee.first_name} ${targetEmployee.last_name}`.trim()
            : headerLabel;
        let dni: string | null = null;
        let contractedHoursWeekly = 0;
        try {
            const { data: profileRow } = await supabase
                .from('profiles')
                .select('dni, contracted_hours_weekly')
                .eq('id', targetId)
                .maybeSingle();
            dni = profileRow?.dni ?? null;
            contractedHoursWeekly = Number(profileRow?.contracted_hours_weekly ?? 0);
        } catch {
            // DNI opcional
        }
        const payload = buildTimesheetPayload(
            weeksData as TimesheetWeekData[],
            fullName,
            dni,
            filterYear,
            filterMonth,
            undefined,
            contractedHoursWeekly,
        );
        if (payload.rows.length === 0) {
            toast.error('No hay registros para exportar');
            return null;
        }
        return timesheetPdfBlob(payload);
    }

    async function handleShareExportPdf() {
        setShowExportMenu(false);
        setIsExporting(true);
        try {
            const result = await buildCurrentViewPdf();
            if (!result) return;
            openPdfBlob(result.blob, result.filename);
        } catch (err) {
            console.error('Export PDF error:', err);
            toast.error('Error al generar el PDF');
        } finally {
            setIsExporting(false);
        }
    }

    async function fetchWeeksYearToDate(userId: string, year: number): Promise<WeekData[]> {
        const rangeStart = startOfWeek(new Date(year, 0, 1), { weekStartsOn: 1 });
        const rangeEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
        const res = await getEmployeeHistoryRange({
            userId,
            rangeStartIso: rangeStart.toISOString(),
            rangeEndIso: rangeEnd.toISOString(),
        });
        if (!res.success) throw new Error(res.error);
        return res.weeks as WeekData[];
    }

    const openSimulationExportModal = useCallback(async () => {
        setShowExportMenu(false);
        if (!isMasterDashboardUser(userEmail)) {
            toast.error('No tienes permiso para exportar la simulación');
            return;
        }

        const { data, error } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, joining_date, end_date, visible_in_plantilla')
            .eq('visible_in_plantilla', true)
            .order('first_name');

        if (error) {
            toast.error('No se pudo cargar la plantilla para la simulación');
            return;
        }

        const visible = filterVisiblePlantillaEmployees((data ?? []) as SimulationPlantillaEmployee[]);
        if (visible.length === 0) {
            toast.error('No hay empleados disponibles para simular');
            return;
        }

        setSimulationEmployees(visible);
        setShowSimulationExportModal(true);
    }, [supabase, userEmail]);

    async function handleSimulationBatchExport(selectedIds: string[]) {
        setShowSimulationExportModal(false);
        setIsExporting(true);
        try {
            if (selectedIds.length === 0) {
                toast.error('Selecciona al menos un empleado');
                return;
            }

            const year = new Date().getFullYear();
            const lastMonth = new Date().getMonth();
            const todayYmd = new Date().toISOString().slice(0, 10);
            const plantillaBounds = { start: `${year}-01-01`, end: todayYmd };

            const { data: profileRows, error: profilesError } = await supabase
                .from('profiles')
                .select('id, first_name, last_name, email, dni, contracted_hours_weekly, joining_date, end_date, visible_in_plantilla')
                .in('id', selectedIds);

            if (profilesError || !profileRows?.length) {
                toast.error('No se pudo cargar el contrato de los empleados seleccionados');
                return;
            }

            const selectedProfiles = filterVisiblePlantillaEmployees(profileRows);
            const weeksByUserId = new Map<string, WeekData[]>();

            await Promise.all(
                selectedProfiles.map(async (profile) => {
                    const weeks = await fetchWeeksYearToDate(profile.id, year);
                    if (weeks.length > 0) {
                        weeksByUserId.set(profile.id, weeks);
                    }
                }),
            );

            if (weeksByUserId.size === 0) {
                toast.error('No hay datos de jornada para simular en este período');
                return;
            }

            const coordinated = buildCoordinatedPlantillaSimulation(
                selectedProfiles,
                weeksByUserId as Map<string, TimesheetWeekData[]>,
                plantillaBounds,
                todayYmd,
            );

            if (coordinated.entries.length === 0) {
                toast.error('No hay información suficiente para simular el histórico');
                return;
            }

            const skippedCount = selectedIds.length - coordinated.entries.length;
            if (skippedCount > 0) {
                toast.warning(
                    `${skippedCount} empleado(s) sin histórico suficiente; se omiten de la exportación.`,
                    { duration: 5000 },
                );
            }

            if (coordinated.coordination.understaffedDates.length > 0) {
                toast.warning(
                    `${coordinated.coordination.understaffedDates.length} días quedan con menos de 3 personas. Incluye más empleados en la simulación.`,
                    { duration: 6000 },
                );
            }

            const profileById = new Map(selectedProfiles.map((p) => [p.id, p]));
            let generated = 0;

            for (const entry of coordinated.entries) {
                const profile = profileById.get(entry.userId);
                if (!profile) continue;

                const periodLabel = buildSimulationPeriodLabel(profile.joining_date, year, lastMonth);
                const payload = buildTimesheetPayload(
                    entry.weeks,
                    entry.fullName,
                    profile.dni ?? null,
                    year,
                    0,
                    periodLabel,
                    entry.contractedHoursWeekly,
                );

                if (payload.rows.length === 0) continue;

                await generateTimesheetPdf(payload);
                generated += 1;
                if (generated < coordinated.entries.length) {
                    await new Promise((resolve) => setTimeout(resolve, 450));
                }
            }

            if (generated === 0) {
                toast.error('No hay jornadas simuladas para exportar en este período');
                return;
            }

            trackUsageModalApply(
                'staff-history-simulation-export',
                'Exportar simulación',
                pathname,
                `${generated} PDF · ${selectedIds.length} empleados`,
            );
            toast.success(`${generated} PDF${generated !== 1 ? 's' : ''} de simulación generados`);
        } catch (err) {
            if (err instanceof SimulationUnavailableError) {
                toast.error(err.message);
                return;
            }
            console.error('Simulated export error:', err);
            toast.error('Error al generar la simulación');
        } finally {
            setIsExporting(false);
        }
    }

    /**
     * Exporta la jornada de varios empleados y meses seleccionados.
     * Todos los meses se combinan en un único payload por empleado.
     */
    async function handleMultiExport(
        selectedIds: string[],
        months: { year: number; month: number }[],
        type: 'pdf' | 'xlsx',
    ) {
        setShowExportEmployeeModal(false);
        setIsExporting(true);
        try {
            const sorted = [...months].sort((a, b) => a.year - b.year || a.month - b.month);
            const first = sorted[0];
            const last = sorted[sorted.length - 1];
            const periodLabel =
                first.year === last.year && first.month === last.month
                    ? undefined
                    : `${format(new Date(first.year, first.month, 1), 'MMM yyyy', { locale: es })} — ${format(new Date(last.year, last.month, 1), 'MMM yyyy', { locale: es })}`;

            const exportPayloads: Array<{
                employee: { fullName: string; dni: string | null };
                payload: TimesheetExportPayload;
            }> = [];

            // Fetch data for each employee — combine all months into one payload
            for (const id of selectedIds) {
                const emp = employees.find((e) => e.id === id);
                if (!emp) continue;
                const fullName = `${emp.first_name} ${emp.last_name}`.trim();

                const { data: profileRow } = await supabase
                    .from('profiles')
                    .select('dni, contracted_hours_weekly')
                    .eq('id', id)
                    .maybeSingle();
                const dni = profileRow?.dni ?? null;
                const contractedHoursWeekly = Number(profileRow?.contracted_hours_weekly ?? 0);

                const allWeeks: WeekData[] = [];

                for (const m of months) {
                    const monthStart = new Date(m.year, m.month, 1);
                    const monthEnd = endOfMonth(monthStart);
                    const rangeStart = startOfWeek(startOfMonth(monthStart), { weekStartsOn: 1 });
                    const rangeEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
                    const rangeStartYmd = format(rangeStart, 'yyyy-MM-dd');
                    const rangeEndYmd = format(rangeEnd, 'yyyy-MM-dd');
                    const { startIso, endIso } = madridRangeUtcIso(rangeStartYmd, rangeEndYmd);

                    const { data: monthLogs, error: monthLogsError } = await supabase
                        .from('time_logs')
                        .select('clock_in, clock_out, total_hours, justified_hours, event_type, clock_out_show_no_registrada')
                        .eq('user_id', id)
                        .gte('clock_in', startIso)
                        .lte('clock_in', endIso);

                    if (monthLogsError) {
                        console.error('Multi export time_logs:', monthLogsError);
                        continue;
                    }

                    const weeks = buildEmployeeWeeksFromTimeLogs({
                        filterYear: m.year,
                        filterMonth: m.month,
                        logs: monthLogs ?? [],
                        isPaidByWeek: () => false,
                    }) as WeekData[];
                    allWeeks.push(...weeks);
                }

                if (allWeeks.length === 0) continue;

                const payload = buildTimesheetPayload(allWeeks as TimesheetWeekData[], fullName, dni, first.year, first.month, periodLabel, contractedHoursWeekly);
                if (payload.rows.length === 0) continue;

                exportPayloads.push({ employee: { fullName, dni }, payload });
            }

            if (exportPayloads.length === 0) {
                toast.error('No se encontraron registros para los empleados y meses seleccionados');
                return;
            }

            if (type === 'pdf') {
                await generateTimesheetPdfMulti(exportPayloads);
            } else {
                generateTimesheetXlsxMulti(exportPayloads);
            }

            toast.success(
                `Documento generado con ${exportPayloads.length} empleado${exportPayloads.length !== 1 ? 's' : ''}` +
                ` y ${months.length} mes${months.length !== 1 ? 'es' : ''}`,
            );
        } catch (err) {
            console.error('Multi export error:', err);
            toast.error('Error al generar el documento');
        } finally {
            setIsExporting(false);
        }
    }

    const handleDayClick = (date: string) => {

        if (isPlantilla) {
            setSummaryDate(date);
            setIsSummaryModalOpen(true);
        } else {
            setEditingDate(date);
            setEditingUserId(selectedEmployeeId || currentUserId);
        }
    };

    const handleSelectLogFromSummary = (userId: string) => {
        setEditingDate(summaryDate);
        setEditingUserId(userId);
        setIsSummaryModalOpen(false);
    };

    const handleCloseSummary = () => {
        setSummaryDate(null);
        setIsSummaryModalOpen(false);
    };

    const handleDetailModalSuccess = () => {
        if (isPlantilla) fetchPlantilla(); else fetchCalendar();
    };

    const handleCloseDetailModal = () => {
        setEditingDate(null);
        setEditingUserId(null);
    };

    return (
        <>
            <DashboardDetailLayout
                title="Asistencia"
                showBackButton={false}
                template="list"
                work="calendar"
                maxWidthClass="max-w-4xl"
                contentClassName="p-0 flex flex-col min-h-0"
                periodSlot={
                    <PeriodNav
                        label={getMonthLabel(filterYear, filterMonth)}
                        onPrev={prevMonth}
                        onNext={nextMonth}
                        onLabelClick={() => setIsTimeFilterOpen(true)}
                    />
                }
                rightSlot={
                    <div className="flex items-center gap-1 justify-end">
                        <PeriodFilterButton
                            instance="staff-history-period-filter"
                            onClick={() => setIsTimeFilterOpen(true)}
                        />
                        <Button
                            type="button"
                            variant="tertiary"
                            instance="staff-history-export-menu"
                            onClick={() => setShowExportMenu(true)}
                            disabled={isExporting}
                            aria-label="Compartir"
                            icon={<Share size={16} strokeWidth={2} />}
                        />

                            {isManager && (
                                <div className="relative shrink-0">
                                    {isPlantilla ? (
                                        <Button
                                            type="button"
                                            variant="tertiary"
                                            instance="staff-history-employee-filter"
                                            onClick={() => setShowEmployeeDropdown(true)}
                                            aria-label="Filtrar por trabajador"
                                            icon={<User size={20} strokeWidth={2.25} />}
                                        />
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setShowEmployeeDropdown(true)}
                                                aria-label={`Filtrado: ${headerLabel}`}
                                                className="relative flex h-9 w-9 items-center justify-center bg-transparent p-0"
                                            >
                                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[10px] font-black uppercase leading-none text-ds-marca">
                                                    {filteredInitials}
                                                </span>
                                            </button>
                                            {selectedEmployeeId ? (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedEmployeeId('');
                                                        setSelectedEmployeeLabel('');
                                                        trackUsageModalApply(
                                                            'staff-history-employee-filter',
                                                            'Filtro asistencia',
                                                            pathname,
                                                            'Plantilla (todos)'
                                                        );
                                                    }}
                                                    aria-label="Quitar filtro de trabajador"
                                                    className="absolute top-0 right-0 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-600 text-white"
                                                >
                                                    <X size={8} strokeWidth={3} />
                                                </button>
                                            ) : null}
                                        </>
                                    )}
                                </div>
                            )}
                    </div>
                }
            >
                    {loading ? (
                        <div className="py-20 flex justify-center">
                            <LoadingSpinner size="md" className="text-ds-marca" />
                        </div>
                    ) : isPlantilla ? (
                        plantillaWeeksData.length === 0 ? (
                            <EmptyState
                                instance="staff-history-plantilla-empty"
                                variant="none"
                                title="No hay registros este mes"
                            />
                        ) : (
                        <MonthCalendarFrame>
                            <div className="month-cal-weeks">
                                {plantillaWeeksData.map((week) => (
                                    <PlantillaWeekCard
                                        key={week.weekNumber}
                                        week={week}
                                        onDayClick={handleDayClick}
                                    />
                                ))}
                            </div>
                        </MonthCalendarFrame>
                        )
                    ) : weeksData.length === 0 ? (
                        <EmptyState
                            instance="staff-history-empty"
                            variant="none"
                            title="No hay registros este mes"
                        />
                    ) : (
                        <WeekSummary
                            weeks={weeksData}
                            filterMonth={filterMonth}
                            filterYear={filterYear}
                            onDayClick={handleDayClick}
                            showWeekOverrides={isManager}
                            userId={selectedEmployeeId || currentUserId}
                            onApplyWeekOverrides={async (week, contractedHours, preferStock, overtimeCostPerHour) => {
                                const uid = selectedEmployeeId || currentUserId;
                                const weekStart = typeof week.startDate === 'string' ? week.startDate.split('T')[0] : String(week.startDate);
                                const result = await updateWeeklyWorkerConfig(uid, weekStart, {
                                    contractedHours,
                                    preferStock,
                                    overtimeCostPerHour,
                                });
                                if (result.success) {
                                    toast.success('Semana actualizada');
                                    fetchCalendar();
                                } else {
                                    toast.error(result.error ?? 'Error al guardar');
                                }
                                return result;
                            }}
                        />
                    )}
            </DashboardDetailLayout>

                <DaySummaryModal
                    isOpen={isSummaryModalOpen}
                    onClose={handleCloseSummary}
                    date={summaryDate ? new Date(summaryDate + 'T12:00:00') : null}
                    logs={summaryLogs}
                    onSelectLog={handleSelectLogFromSummary}
                    employees={employees}
                    onFichajeCreated={handleDetailModalSuccess}
                    isManager={isManager}
                />

                <AttendanceDetailModal
                    isOpen={!!editingDate && !!editingUserId}
                    onClose={handleCloseDetailModal}
                    date={editingDate ? new Date(editingDate + 'T12:00:00') : null}
                    userId={editingUserId}
                    userRole={userRole}
                    onSuccess={handleDetailModalSuccess}
                />

                <MultiEmployeeExportModal
                    isOpen={showExportEmployeeModal}
                    onClose={() => setShowExportEmployeeModal(false)}
                    employees={employees}
                    onExport={(ids, months, format) => handleMultiExport(ids, months, format)}
                    isExporting={isExporting}
                    initialYear={filterYear}
                    initialMonth={filterMonth}
                />

            <StaffSelectionModal
                isOpen={showEmployeeDropdown}
                onClose={() => setShowEmployeeDropdown(false)}
                employees={employees}
                title="Empleado"
                usageId="staff-history-employee-filter"
                usageLabel="Filtro asistencia"
                allowPlantilla={isManager}
                plantillaSelected={isPlantilla}
                onSelect={(emp) => {
                    setSelectedEmployeeId(emp.id);
                    setSelectedEmployeeLabel(staffSelectionApplySummary(emp));
                    setShowEmployeeDropdown(false);
                }}
            />

            {isMaster ? (
                <SimulationPlantillaExportModal
                    isOpen={showSimulationExportModal}
                    onClose={() => setShowSimulationExportModal(false)}
                    employees={simulationEmployees}
                    onExport={(ids) => void handleSimulationBatchExport(ids)}
                    isExporting={isExporting}
                    year={new Date().getFullYear()}
                />
            ) : null}

            <TimeFilterModal
                isOpen={isTimeFilterOpen}
                onClose={() => setIsTimeFilterOpen(false)}
                allowedKinds={['month']}
                defaultKind="month"
                initialValue={{ kind: 'month', year: filterYear, month: filterMonth + 1 }}
                onApply={(v: TimeFilterValue) => {
                    if (v.kind !== 'month') return;
                    setFilterYear(v.year);
                    setFilterMonth(v.month - 1);
                }}
            />

            {showExportMenu && (
                <Modal
                    open={showExportMenu}
                    onClose={() => setShowExportMenu(false)}
                    instance="staff-history-share-menu"
                    title="Exportar"
                    variant="compact"
                >
                    <div className="flex flex-col gap-3">
                        <Button
                            type="button"
                            variant="primary"
                            instance="staff-history-export-pdf"
                            onClick={() => void handleShareExportPdf()}
                            layout="fill"
                            disabled={isExporting}
                        >
                            Exportar PDF
                        </Button>
                        {!isPlantilla ? (
                            <Button
                                type="button"
                                variant="secondary"
                                instance="staff-history-export-excel"
                                onClick={() => void handleExport('xlsx')}
                                layout="fill"
                                disabled={isExporting}
                            >
                                Exportar Excel
                            </Button>
                        ) : null}
                    </div>
                </Modal>
            )}
        </>
    );
}