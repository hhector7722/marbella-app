'use client';

/* eslint-disable @next/next/no-img-element */

import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import {
    Calendar, X, ChevronDown, ChevronLeft, ChevronRight, Share2
} from 'lucide-react';
import { buildTimesheetPayload, type TimesheetExportPayload, type TimesheetWeekData } from '@/lib/staff/timesheet-export-payload';
import {
    SimulationUnavailableError,
} from '@/lib/staff/staff-schedule-normalizer';
import { buildCoordinatedPlantillaSimulation } from '@/lib/staff/coordinated-plantilla-simulation';
import { generateTimesheetPdf, generateTimesheetPdfMulti } from '@/lib/staff/timesheet-pdf';
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
import { PeriodNav } from '@/components/time/PeriodNav';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { trackUsageModalApply } from '@/lib/usage/client';
import { staffSelectionApplySummary } from '@/lib/usage/modal-apply';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { updateWeeklyWorkerConfig } from '@/app/actions/overtime';
import { AttendanceDetailModal } from '@/components/modals/AttendanceDetailModal';
import { DaySummaryModal } from '@/components/modals/DaySummaryModal';
import { WeekCard } from './WeekCard';
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

/** Línea roja fina con gradiente y difuminado en los extremos; forma parte del borde visual entre semanas (sin añadir espacio). */
function WeekSeparator() {
    return (
        <div className="flex justify-center" aria-hidden>
            <div
                className={cn(
                    'h-0.5 w-[70%] max-w-[280px]',
                    'bg-[linear-gradient(90deg,transparent_0%,rgb(220_38_38/0.3)_4%,rgb(220_38_38)_8%,rgb(220_38_38)_92%,rgb(220_38_38/0.3)_96%,transparent_100%)]'
                )}
            />
        </div>
    );
}

// --- TIPOS ---
interface WeekSummary {
    totalHours: number;
    startBalance: number;
    weeklyBalance: number;
    finalBalance: number;
    estimatedValue: number;
    isPaid: boolean;
    preferStock?: boolean;
    bagModeOverride?: boolean | null;
    hourlyRate?: number;
    limitHours?: number;
}

interface WeekData extends TimesheetWeekData {
    days: (TimesheetWeekData['days'][number] & { clock_out_show_no_registrada?: boolean })[];
    summary: WeekSummary;
}

// --- CONSTANTES ---
const getMonthLabel = (year: number, month: number) =>
    new Date(year, month, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

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

    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

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
    const [exportFormat, setExportFormat] = useState<'pdf' | 'xlsx'>('pdf');

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
    const viewingOther = isManager && selectedEmployeeId && selectedEmployeeId !== currentUserId;
    const isMaster = isMasterDashboardUser(userEmail);
    const hasRealExportData = weeksData.length > 0;
    const showExportButton =
        (isPlantilla && isMaster && plantillaWeeksData.length > 0) ||
        (!isPlantilla && (hasRealExportData || isMaster));

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
                weeksData,
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
                weeksByUserId,
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

                const payload = buildTimesheetPayload(allWeeks, fullName, dni, first.year, first.month, periodLabel, contractedHoursWeekly);
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
                maxWidthClass="max-w-4xl"
                contentClassName="p-0 flex flex-col min-h-0"
                rightSlot={
                    <div className="flex items-center gap-2 justify-end">
                        {showExportButton && (
                                <div className="relative">
                                    <Button
                                        type="button"
                                        variant="tertiary"
                                        instance="staff-history-export-menu"
                                        onClick={() => setShowExportMenu((v) => !v)}
                                        disabled={isExporting}
                                        aria-label="Exportar historial de jornada"
                                        icon={<Share2 size={16} strokeWidth={2} />}
                                    />

                                    {showExportMenu && (
                                        <>
                                            {/* Overlay transparente para cerrar al clicar fuera */}
                                            <button
                                                type="button"
                                                aria-label="Cerrar menú"
                                                className="fixed inset-0 z-[40] cursor-default"
                                                onClick={() => setShowExportMenu(false)}
                                                tabIndex={-1}
                                            />
                                            {/* Mini-menú */}
                                            <div
                                                role="menu"
                                                className="absolute right-0 top-full mt-1.5 z-[50] bg-white rounded-xl shadow-lg border border-zinc-100 overflow-hidden min-w-[210px] animate-in fade-in zoom-in-95 duration-150"
                                            >
                                                {isPlantilla && isMaster ? (
                                                    <>
                                                        <Button
                                                            type="button"
                                                            variant="secondary"
                                                            instance="staff-history-export-all-pdf"
                                                            onClick={() => { setShowExportMenu(false); setExportFormat('pdf'); setShowExportEmployeeModal(true); }}
                                                            layout="fill"
                                                        >
                                                            Exportar todos (PDF)
                                                        </Button>
                                                        <div className="h-px bg-zinc-100 mx-3" />
                                                        <Button
                                                            type="button"
                                                            variant="secondary"
                                                            instance="staff-history-export-all-xlsx"
                                                            onClick={() => { setShowExportMenu(false); setExportFormat('xlsx'); setShowExportEmployeeModal(true); }}
                                                            layout="fill"
                                                        >
                                                            Exportar todos (Excel)
                                                        </Button>
                                                        <div className="h-px bg-zinc-100 mx-3" />
                                                        <button
                                                            type="button"
                                                            role="menuitem"
                                                            onClick={() => void openSimulationExportModal()}
                                                            className="w-full flex items-center gap-3 px-4 py-3 text-left text-[11px] font-bold text-zinc-700 hover:bg-zinc-50 transition-colors"
                                                        >
                                                            <span className="text-base leading-none">📄</span>
                                                            <span>PDF <span className="font-normal text-zinc-400">(Simulación horas contratadas)</span></span>
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        {hasRealExportData ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    role="menuitem"
                                                                    onClick={() => handleExport('pdf')}
                                                                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-[11px] font-bold text-zinc-700 hover:bg-zinc-50 transition-colors"
                                                                >
                                                                    <span className="text-base leading-none">📄</span>
                                                                    <span>PDF <span className="font-normal text-zinc-400">(Registros reales)</span></span>
                                                                </button>
                                                                <div className="h-px bg-zinc-100 mx-3" />
                                                                <button
                                                                    type="button"
                                                                    role="menuitem"
                                                                    onClick={() => handleExport('xlsx')}
                                                                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-[11px] font-bold text-zinc-700 hover:bg-zinc-50 transition-colors"
                                                                >
                                                                    <span className="text-base leading-none">📊</span>
                                                                    <span>Excel <span className="font-normal text-zinc-400">(Registros reales)</span></span>
                                                                </button>
                                                                <div className="h-px bg-zinc-100 mx-3" />
                                                            </>
                                                        ) : null}
                                                        {isMaster ? (
                                                            <button
                                                                type="button"
                                                                role="menuitem"
                                                                onClick={() => void openSimulationExportModal()}
                                                                className="w-full flex items-center gap-3 px-4 py-3 text-left text-[11px] font-bold text-zinc-700 hover:bg-zinc-50 transition-colors"
                                                            >
                                                                <span className="text-base leading-none">📄</span>
                                                                <span>PDF <span className="font-normal text-zinc-400">(Simulación horas contratadas)</span></span>
                                                            </button>
                                                        ) : null}
                                                    </>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {isManager && (
                                <div className="relative">
                                    <button
                                        onClick={() => setShowEmployeeDropdown(true)}
                                        className={cn(
                                            "flex items-center justify-center text-[8px] font-black uppercase tracking-widest transition-all active:scale-95 text-white shrink-0",
                                            isPlantilla
                                                ? "min-h-0 px-1 py-0 bg-transparent border-0 shadow-none rounded-none hover:bg-transparent hover:text-white/85"
                                                : "h-8 px-3 bg-white/10 hover:bg-white/20 rounded-lg border border-white/10 shadow-sm",
                                            viewingOther && !isPlantilla && "bg-white/20 border-white/30"
                                        )}
                                    >
                                        <span className="max-w-[120px] md:max-w-[160px] truncate">{headerLabel}</span>
                                        <ChevronDown size={10} className="ml-1.5 opacity-40 shrink-0" />
                                    </button>
                                    {!isPlantilla && selectedEmployeeId && (
                                        <button
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
                                            className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors z-30 border-2 border-[#36606F]"
                                        >
                                            <X size={8} strokeWidth={4} />
                                        </button>
                                    )}
                                </div>
                            )}
                    </div>
                }
            >
            <div className="px-4 md:px-8 pt-3 pb-2 shrink-0">
                <PeriodNav
                    label={getMonthLabel(filterYear, filterMonth)}
                    onPrev={prevMonth}
                    onNext={nextMonth}
                    onLabelClick={() => {
                        setPickerYear(filterYear);
                        setShowMonthPicker(true);
                    }}
                />
            </div>

                    {loading ? (
                        <div className="py-20 flex justify-center">
                            <LoadingSpinner size="md" className="text-ds-marca" />
                        </div>
                    ) : isPlantilla ? (
                        plantillaWeeksData.length === 0 ? (
                            <div className="py-20 text-center text-zinc-400">
                                <Calendar size={40} className="mx-auto mb-3 opacity-30" />
                                <p className="text-sm font-bold">No hay registros este mes</p>
                            </div>
                        ) : (
                            <div className="px-4 pt-8 pb-8 bg-zinc-50/50">
                                {plantillaWeeksData.map((week, idx) => (
                                    <PlantillaWeekCard
                                        key={week.weekNumber}
                                        week={week}
                                        idx={idx}
                                        onDayClick={handleDayClick}
                                    />
                                ))}
                            </div>
                        )
                    ) : weeksData.length === 0 ? (
                        <div className="py-20 text-center text-zinc-400">
                            <Calendar size={40} className="mx-auto mb-3 opacity-30" />
                            <p className="text-sm font-bold">No hay registros este mes</p>
                        </div>
                    ) : (
                        <div className="p-4 bg-zinc-50/50">
                            {weeksData.map((week, idx) => (
                                <React.Fragment key={week.weekNumber}>
                                    <WeekCard
                                        week={week}
                                        idx={idx}
                                        filterMonth={filterMonth}
                                        filterYear={filterYear}
                                        onDayClick={handleDayClick}
                                        showWeekOverrides={isManager}
                                        userId={selectedEmployeeId || currentUserId}

                                        onApplyWeekOverrides={async (contractedHours, preferStock, overtimeCostPerHour) => {
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
                                    {idx < weeksData.length - 1 && <WeekSeparator />}
                                </React.Fragment>
                            ))}
                        </div>
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

            <Modal
                open={showMonthPicker}
                onClose={() => setShowMonthPicker(false)}
                variant="compact"
                layer="base"
                instance="staff-history-month-picker"
                usageId="staff-history-month-picker"
                usageLabel="Selector de mes"
                title="Seleccionar mes"
                headerTone="petroleum"
            >
                <div>
                    <div className="flex items-center justify-between mb-6 px-2">
                        <button type="button" onClick={() => setPickerYear(pickerYear - 1)} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center"><ChevronLeft size={20} className="text-zinc-400" /></button>
                        <span className="font-black text-xl text-zinc-900 tracking-tighter">{pickerYear}</span>
                        <button type="button" onClick={() => setPickerYear(pickerYear + 1)} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center"><ChevronRight size={20} className="text-zinc-400" /></button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {Array.from({ length: 12 }).map((_, i) => {
                            const date = new Date(pickerYear, i, 1);
                            const isSelected = filterMonth === i && filterYear === pickerYear;
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => {
                                        setFilterMonth(i);
                                        setFilterYear(pickerYear);
                                        setShowMonthPicker(false);
                                        trackUsageModalApply(
                                            'staff-history-month-picker',
                                            'Selector de mes',
                                            pathname,
                                            format(date, 'MMMM yyyy', { locale: es })
                                        );
                                    }}
                                    className={cn(
                                        "py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2 min-h-[48px]",
                                        isSelected ? "bg-[#36606F] border-[#36606F] text-white shadow-lg" : "bg-zinc-50 border-transparent text-zinc-400 hover:border-[#36606F]/20 hover:text-zinc-900 hover:bg-[#36606F]/5"
                                    )}
                                >
                                    {format(date, 'MMM', { locale: es })}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </Modal>
        </>
    );
}