'use client'; // Force update v3 - polishing calendar cards

import { useEffect, useState, useMemo, useRef } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    Calendar,
    CloudSun,
    Receipt,
    ChevronLeft,
    ChevronRight,
    X,
    TrendingUp,
    Pencil,
    Trash2,
    Save,
    ChevronRight as ChevronRightIcon,
    Banknote,
    Minus,
    Printer,
    Share,
    Download,
    Filter,
} from 'lucide-react';
import { ImageLightbox, type ImageLightboxSlide } from '@/components/ui/ImageLightbox';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, startOfMonth, endOfMonth, isSameDay, addDays, subMonths, isSameMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, isToday, isBefore, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import CashClosingModal, { BILLS, COINS } from '@/components/CashClosingModal';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';
import { TimeFilterButton } from '@/components/time/TimeFilterButton';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import {
    closingDetailUsageLabel,
    formatMonthYear,
    formatYmdShort,
    periodRangeSummary,
} from '@/lib/usage/modal-apply';
import type { TimeFilterValue } from '@/components/time/time-filter-types';
import * as XLSX from 'xlsx';
import { deleteCashClosingPhotosAction, getCashClosingPhotoUrlsAction } from '@/app/actions/cash-closing-photos';

// --- TYPES & CONSTANTS ---
type MetricType = 'net_sales' | 'tpv_sales' | 'avg_ticket' | 'tickets_count' | 'cash_counted';

const CALENDAR_WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

const CLOSING_CELL_ROWS = [
    { field: 'net_sales' as const, dotClass: 'bg-emerald-500' },
    { field: 'tpv_sales' as const, dotClass: 'bg-blue-500' },
    { field: 'cash_counted' as const, dotClass: 'bg-amber-400' },
    { field: 'sales_card' as const, dotClass: 'bg-red-500' },
];

const CLOSING_CALENDAR_LEGEND = [
    { label: 'Venta neta', dotClass: 'bg-emerald-500' },
    { label: 'Ventas', dotClass: 'bg-blue-500' },
    { label: 'Efectivo', dotClass: 'bg-amber-400' },
    { label: 'Tarjeta', dotClass: 'bg-red-500' },
] as const;

function formatClosingCellValue(val: number | null | undefined): string {
    const n = Number(val ?? 0);
    if (!n || Math.abs(n) < 0.005) return '\u00a0';
    return `${n.toFixed(2)}€`;
}

function ClosingCalendarMetricRow({ dotClass, value }: { dotClass: string; value: string }) {
    return (
        <div className="flex flex-1 items-center gap-1 sm:gap-1.5 min-w-0 w-full min-h-0">
            <span className={cn('w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0', dotClass)} aria-hidden />
            <span className="flex-1 min-w-0 text-[10px] sm:text-xs md:text-sm lg:text-base font-black text-zinc-900 tabular-nums leading-none truncate">
                {value}
            </span>
        </div>
    );
}

function ClosingCalendarLegend() {
    return (
        <div
            className="grid grid-cols-4 gap-2 px-3 sm:px-4 py-3 border-t border-zinc-100 bg-white print:hidden"
            aria-label="Leyenda del calendario de cierres"
        >
            {CLOSING_CALENDAR_LEGEND.map((item) => (
                <div key={item.label} className="flex items-center justify-center gap-1.5 min-w-0">
                    <span className="text-[8px] sm:text-[9px] md:text-[10px] font-semibold text-zinc-600 whitespace-nowrap truncate">
                        {item.label}
                    </span>
                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', item.dotClass)} aria-hidden />
                </div>
            ))}
        </div>
    );
}

// --- MINI COMPONENTS ---

const Sparkline = ({ data, color = "#10b981", height = 40, width = 120 }: { data: number[], color?: string, height?: number, width?: number }) => {
    if (!data.length) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const points = data.map((v, i) => ({
        x: (i / (data.length - 1)) * width,
        y: height - ((v - min) / range) * height
    }));

    const pathData = points.reduce((acc, p, i) =>
        acc + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`), ""
    );

    return (
        <svg width={width} height={height} className="overflow-visible">
            <path
                d={pathData}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="drop-shadow-sm"
            />
        </svg>
    );
};

const DonutChart = ({ size = 60, percentage = 75, color = "#10b981" }: { size?: number, percentage?: number, color?: string }) => {
    const radius = size / 2.5;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
        <svg width={size} height={size} className="transform -rotate-90">
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="currentColor"
                strokeWidth="6"
                fill="transparent"
                className="text-gray-100"
            />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={color}
                strokeWidth="6"
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
            />
        </svg>
    );
};

const CashBreakdownModal = ({
    isOpen,
    onClose,
    breakdown,
    date,
    total,
    isEditing = false,
    onUpdate,
    onSave,
    saving = false,
}: {
    isOpen: boolean,
    onClose: () => void,
    breakdown: any,
    date: string,
    total: number,
    isEditing?: boolean,
    onUpdate?: (den: string, qty: number) => void,
    onSave?: () => void,
    saving?: boolean,
}) => {
    const [calculatorOpen, setCalculatorOpen] = useState(false);

    useModalUsageTracking({
        open: isOpen,
        usageId: 'history-cash-breakdown',
        usageLabel: 'Arqueo de efectivo',
    });

    if (!isOpen) return null;

    const displayBreakdown = isEditing ? {
        ...BILLS.reduce((acc, b) => ({ ...acc, [b.toString()]: 0 }), {}),
        ...COINS.reduce((acc, c) => ({ ...acc, [c.toString()]: 0 }), {}),
        ...breakdown
    } : breakdown;

    return (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white rounded-[3rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="bg-[#36606F] p-8 text-white text-center relative">
                    <div className="absolute top-6 right-6 flex items-center gap-1">
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-all min-h-[48px] min-w-[48px] flex items-center justify-center"><X size={20} /></button>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 mb-1 block">Arqueo de Efectivo</span>
                    <h3 className="text-xl font-black uppercase tracking-tighter">
                        {(() => {
                            const d = new Date(date);
                            return isNaN(d.getTime()) ? "Fecha Inválida" : format(d, 'eeee d MMM', { locale: es });
                        })()}
                    </h3>
                </div>
                <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
                <FloatingCalculatorFab isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />
                <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    <div className="space-y-2">
                        {Object.entries(displayBreakdown || {}).sort((a, b) => parseFloat(b[0]) - parseFloat(a[0])).map(([den, qty]) => (
                            <div key={den} className="flex items-center justify-between p-4 bg-gray-50 rounded-[1.5rem] border border-gray-100/50">
                                <span className="text-xs font-black text-gray-400">{parseFloat(den) < 1 ? (parseFloat(den) * 100).toFixed(0) + 'c' : den + '€'}</span>
                                <div className="flex items-center gap-4">
                                    {isEditing ? (
                                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-gray-200 shadow-sm">
                                            <span className="text-[10px] font-black text-gray-300 uppercase">x</span>
                                            <input
                                                type="number"
                                                className="w-12 bg-transparent text-sm font-black text-[#36606F] text-center outline-none"
                                                value={qty as number || ''}
                                                onChange={e => onUpdate?.(den, parseInt(e.target.value) || 0)}
                                            />
                                        </div>
                                    ) : (
                                        <span className="text-xs font-black text-gray-400">x{qty as number}</span>
                                    )}
                                    <span className="text-sm font-black text-[#36606F] min-w-[50px] text-right">{(parseFloat(den) * (qty as number || 0)).toFixed(2)}€</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-8 pt-6 border-t border-gray-100 flex justify-between items-center px-2">
                        <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Total Contado</span>
                        <span className="text-2xl font-black text-[#36606F]">{total.toFixed(2)}€</span>
                    </div>
                </div>
                {isEditing && (
                    <div className="p-6 bg-gray-50/50 border-t border-gray-100">
                        <button
                            onClick={onSave}
                            disabled={saving}
                            className={cn(
                                "w-full h-12 bg-[#36606F] text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg transition-all",
                                "hover:scale-[1.02] active:scale-[0.98]",
                                saving ? "opacity-70 pointer-events-none" : ""
                            )}
                        >
                            {saving ? 'Guardando…' : 'Guardar desglose'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- MAIN PAGE ---

export default function HistoryPage() {
    const supabase = createClient();
    const router = useRouter();
    const trackHistoryMonthPicker = useTrackModalApply('history-month-picker', 'Selector de mes historial');
    const trackHistoryDateSingle = useTrackModalApply('history-date-single', 'Calendario día historial');
    const trackHistoryDateRange = useTrackModalApply('history-date-range', 'Calendario periodo historial');

    const [filterMode, setFilterMode] = useState<'single' | 'range'>('range');
    const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [rangeStart, setRangeStart] = useState<string | null>(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [rangeEnd, setRangeEnd] = useState<string | null>(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));

    const parseLocalSafe = (dateStr: string | null) => {
        if (!dateStr) return new Date();
        const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
        return new Date(y, m - 1, d);
    };

    const handlePrevMonth = () => {
        const current = parseLocalSafe(rangeStart);
        const prev = subMonths(current, 1);
        setRangeStart(format(startOfMonth(prev), 'yyyy-MM-dd'));
        setRangeEnd(format(endOfMonth(prev), 'yyyy-MM-dd'));
        setFilterMode('range');
    };

    const handleNextMonth = () => {
        const current = parseLocalSafe(rangeStart);
        const next = addMonths(current, 1);
        setRangeStart(format(startOfMonth(next), 'yyyy-MM-dd'));
        setRangeEnd(format(endOfMonth(next), 'yyyy-MM-dd'));
        setFilterMode('range');
    };

    const [loading, setLoading] = useState(true);
    const [showCalendar, setShowCalendar] = useState<'single' | 'range' | null>(null);
    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [calendarBaseDate, setCalendarBaseDate] = useState(new Date());
    const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
    const [isTimeFilterOpen, setIsTimeFilterOpen] = useState(false);
    const [shareMenuOpen, setShareMenuOpen] = useState(false);
    const [shareBusy, setShareBusy] = useState<null | 'excel' | 'print'>(null);

    const [selectedClosing, setSelectedClosing] = useState<any>(null);

    const closingDetailTrackingLabel = useMemo(() => {
        if (!selectedClosing) return 'Detalle de cierre';
        return closingDetailUsageLabel(selectedClosing);
    }, [selectedClosing]);

    const openClosingDetail = (closing: { id: string; closed_at?: string; closing_date?: string }) => {
        setSelectedClosing(closing);
    };
    const [showCashDetails, setShowCashDetails] = useState(false);
    const [showClosingModal, setShowClosingModal] = useState(false);
    const [viewMode, setViewMode] = useState<'calendar' | 'table'>('calendar');

    useModalUsageTracking({
        open: selectedClosing !== null,
        usageId: 'history-closing-detail',
        usageLabel: closingDetailTrackingLabel,
    });
    useModalUsageTracking({
        open: showCalendar !== null,
        usageId: showCalendar === 'single' ? 'history-date-single' : 'history-date-range',
        usageLabel: showCalendar === 'single' ? 'Fecha única' : 'Rango de fechas',
    });
    useModalUsageTracking({
        open: showMonthPicker,
        usageId: 'history-month-picker',
        usageLabel: 'Selector de mes',
    });

    const calendarDays = useMemo(() => {
        const base = filterMode === 'range' && rangeStart ? parseLocalSafe(rangeStart) : parseLocalSafe(selectedDate);
        const startVisible = startOfWeek(startOfMonth(base), { weekStartsOn: 1 });
        const endVisible = endOfWeek(endOfMonth(base), { weekStartsOn: 1 });
        return eachDayOfInterval({ start: startVisible, end: endVisible });
    }, [filterMode, rangeStart, selectedDate]);

    const viewMonth = useMemo(() => {
        const base = filterMode === 'range' && rangeStart ? parseLocalSafe(rangeStart) : parseLocalSafe(selectedDate);
        return startOfMonth(base);
    }, [filterMode, rangeStart, selectedDate]);

    const calendarWeeks = useMemo(() => {
        const weeks: Date[][] = [];
        for (let i = 0; i < calendarDays.length; i += 7) {
            weeks.push(calendarDays.slice(i, i + 7));
        }
        return weeks;
    }, [calendarDays]);

    const monthNavLabel =
        filterMode === 'range' && rangeStart && rangeEnd && isSameMonth(parseLocalSafe(rangeStart), parseLocalSafe(rangeEnd))
            ? format(parseLocalSafe(rangeStart), 'MMMM yyyy', { locale: es })
            : filterMode === 'single'
              ? format(parseLocalSafe(selectedDate), 'MMMM yyyy', { locale: es })
              : 'Periodo personalizado';

    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState<any>(null);
    const [isManager, setIsManager] = useState(false);

    const searchParams = useSearchParams();
    const deepLinkClosingRef = useRef<string | null>(null);

    const [closings, setClosings] = useState<any[]>([]);
    const [hourlySales, setHourlySales] = useState<Record<string, number[]>>({});
    const [summary, setSummary] = useState({ totalNet: 0, totalGross: 0, avgTicket: 0, count: 0 });

    const closingsByDate = useMemo(() => {
        const map = new Map<string, (typeof closings)[number]>();
        closings.forEach((c) => {
            const key = format(new Date(c.closed_at), 'yyyy-MM-dd');
            map.set(key, c);
        });
        return map;
    }, [closings]);
    const [closingPhotoUrls, setClosingPhotoUrls] = useState<{ dataphoneUrl: string | null; bdpUrl: string | null }>({ dataphoneUrl: null, bdpUrl: null });
    const [closingPhotosLoading, setClosingPhotosLoading] = useState(false);
    const [closingPhotosError, setClosingPhotosError] = useState<string | null>(null);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [closingCalculatorOpen, setClosingCalculatorOpen] = useState(false);

    const closingPhotoSlides = useMemo((): ImageLightboxSlide[] => {
        const slides: ImageLightboxSlide[] = [];
        if (closingPhotoUrls.dataphoneUrl) {
            slides.push({ src: closingPhotoUrls.dataphoneUrl, alt: 'Totales datáfonos' });
        }
        if (closingPhotoUrls.bdpUrl) {
            slides.push({ src: closingPhotoUrls.bdpUrl, alt: 'Informe TPV' });
        }
        return slides;
    }, [closingPhotoUrls]);

    const openClosingPhotoLightbox = (alt: string) => {
        const idx = closingPhotoSlides.findIndex((s) => s.alt === alt);
        if (idx >= 0) setLightboxIndex(idx);
    };

    useEffect(() => {
        checkUserRole();
        fetchHistory();
    }, [rangeStart, rangeEnd, selectedDate, filterMode]);

    useEffect(() => {
        const closingId = searchParams.get('closingId')?.trim();
        if (!closingId || deepLinkClosingRef.current === closingId || loading) return;

        const found = closings.find((c) => c.id === closingId);
        if (found) {
            deepLinkClosingRef.current = closingId;
            openClosingDetail(found);
            return;
        }

        void (async () => {
            const { data, error } = await supabase
                .from('cash_closings')
                .select('*')
                .eq('id', closingId)
                .maybeSingle();

            if (error || !data) {
                toast.error('No se encontró el cierre de la notificación');
                return;
            }

            deepLinkClosingRef.current = closingId;
            openClosingDetail(data);
            const closedAt = new Date(data.closed_at);
            if (!Number.isNaN(closedAt.getTime())) {
                setSelectedDate(format(closedAt, 'yyyy-MM-dd'));
            }
        })();
    }, [searchParams, closings, loading]);

    useEffect(() => {
        if (!shareMenuOpen) return;
        const onPointerDown = (e: PointerEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            if (target.closest('[data-history-share-root="true"]')) return;
            setShareMenuOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setShareMenuOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [shareMenuOpen]);

    useEffect(() => {
        if (!selectedClosing) {
            setClosingPhotoUrls({ dataphoneUrl: null, bdpUrl: null });
            setClosingPhotosError(null);
            return;
        }

        const dataphonePath = selectedClosing.dataphone_totals_photo_path as string | null | undefined;
        const bdpPath = selectedClosing.bdp_closing_ticket_photo_path as string | null | undefined;

        if (!dataphonePath && !bdpPath) {
            setClosingPhotoUrls({ dataphoneUrl: null, bdpUrl: null });
            setClosingPhotosError(null);
            return;
        }

        let cancelled = false;
        setClosingPhotosLoading(true);
        setClosingPhotosError(null);

        getCashClosingPhotoUrlsAction({ dataphonePath, bdpPath })
            .then((result) => {
                if (cancelled) return;
                if (!result.success) {
                    setClosingPhotoUrls({ dataphoneUrl: null, bdpUrl: null });
                    setClosingPhotosError(result.error);
                    toast.error(result.error);
                    return;
                }
                setClosingPhotoUrls({ dataphoneUrl: result.dataphoneUrl, bdpUrl: result.bdpUrl });
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                const msg = err instanceof Error ? err.message : 'No se pudieron cargar las fotos del cierre';
                setClosingPhotosError(msg);
                toast.error(msg);
            })
            .finally(() => {
                if (!cancelled) setClosingPhotosLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [selectedClosing?.id, selectedClosing?.dataphone_totals_photo_path, selectedClosing?.bdp_closing_ticket_photo_path]);

    async function checkUserRole() {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        if (user) {
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
            setIsManager(profile?.role === 'manager');
        }
    }

    async function fetchHistory() {
        setLoading(true);
        try {
            let startISO: string;
            let endISO: string;

            if (filterMode === 'single') {
                startISO = selectedDate;
                endISO = selectedDate;
            } else {
                if (!rangeStart || !rangeEnd) {
                    setClosings([]);
                    setLoading(false);
                    return;
                }
                startISO = rangeStart;
                endISO = rangeEnd;
            }

            const closingsPromise = supabase
                .from('cash_closings')
                .select('*')
                .gte('closing_date', startISO)
                .lte('closing_date', endISO)
                .order('closing_date', { ascending: false });

            const summaryPromise = supabase.rpc('get_cash_closings_summary', {
                p_start_date: startISO,
                p_end_date: endISO
            });

            const [closingsRes, summaryRes] = await Promise.all([closingsPromise, summaryPromise]);

            if (closingsRes.error) throw closingsRes.error;
            setClosings(closingsRes.data || []);
            setSummary(summaryRes.data || { totalNet: 0, totalGross: 0, avgTicket: 0, count: 0 });

            try {
                const { data: hourlyData, error: hourlyError } = await supabase
                    .rpc('get_hourly_sales', {
                        p_start_date: startISO,
                        p_end_date: endISO
                    });

                if (!hourlyError && hourlyData) {
                    const hourlyMap: Record<string, number[]> = {};
                    hourlyData.forEach((row: any) => {
                        const date = row.fecha;
                        if (!hourlyMap[date]) {
                            hourlyMap[date] = new Array(24).fill(0);
                        }
                        if (row.hora >= 0 && row.hora < 24) {
                            hourlyMap[date][row.hora] = Number(row.total);
                        }
                    });
                    setHourlySales(hourlyMap);
                }
            } catch (rpcErr) {
                console.warn('Hourly sales RPC failed', rpcErr);
            }
        } catch (err) {
            console.error('Error fetching history:', err);
            toast.error("Error al cargar datos históricos");
        } finally {
            setLoading(false);
        }
    }

    const getActiveTableEl = (): HTMLTableElement | null => {
        const table = document.querySelector('.print-table-cierres table') as HTMLTableElement | null;
        return table;
    };

    const exportTableToExcel = () => {
        if (shareBusy) return;
        setShareBusy('excel');
        try {
            const table = getActiveTableEl();
            if (!table) {
                toast.error('No se ha encontrado la tabla para exportar.');
                return;
            }
            const ws = XLSX.utils.table_to_sheet(table);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Cierres');

            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
            XLSX.writeFile(wb, `cierres_${stamp}.xlsx`, { compression: true });
            toast.success('Excel descargado.');
        } catch (e) {
            console.error(e);
            toast.error('Error exportando a Excel.');
        } finally {
            setShareBusy(null);
            setShareMenuOpen(false);
        }
    };

    const printTable = () => {
        if (shareBusy) return;
        setShareBusy('print');
        try {
            const table = getActiveTableEl();
            if (!table) {
                toast.error('No se ha encontrado la tabla para imprimir.');
                return;
            }
            const html = table.outerHTML;

            const iframe = document.createElement('iframe');
            iframe.setAttribute('aria-hidden', 'true');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';
            document.body.appendChild(iframe);

            const doc = iframe.contentDocument;
            if (!doc) {
                iframe.remove();
                toast.error('No se pudo preparar la impresión.');
                return;
            }

            doc.open();
            doc.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Imprimir cierres</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 24px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color: #111827; }
      table { width: 100%; border-collapse: collapse; }
      thead th {
        background: #36606F; color: white;
        text-transform: uppercase; letter-spacing: 0.12em;
        font-weight: 800; font-size: 11px;
        padding: 10px 12px; text-align: right;
      }
      thead th:first-child { text-align: left; }
      tbody td {
        border-top: 1px solid #f4f4f5;
        padding: 10px 12px;
        font-size: 12px;
        vertical-align: top;
        text-align: right;
      }
      tbody td:first-child { text-align: left; }
      tbody tr:nth-child(even) td { background: #fafafa; }
      @media print {
        body { margin: 0; padding: 0; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    ${html}
  </body>
</html>`);
            doc.close();

            setTimeout(() => {
                try {
                    iframe.contentWindow?.focus();
                    iframe.contentWindow?.print();
                } finally {
                    setTimeout(() => iframe.remove(), 250);
                }
            }, 50);
        } catch (e) {
            console.error(e);
            toast.error('Error al imprimir.');
        } finally {
            setShareBusy(null);
            setShareMenuOpen(false);
        }
    };

    const generateCalendarDays = () => {
        const year = calendarBaseDate.getFullYear();
        const month = calendarBaseDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days: (number | null)[] = [];
        const startDay = (firstDay.getDay() + 6) % 7;
        for (let i = 0; i < startDay; i++) days.push(null);
        for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
        return days;
    };

    const handleDateSelect = (day: number) => {
        const dateStr = `${calendarBaseDate.getFullYear()}-${String(calendarBaseDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (showCalendar === 'single') {
            setSelectedDate(dateStr);
            setFilterMode('single');
            setShowCalendar(null);
            trackHistoryDateSingle(formatYmdShort(dateStr), { selectedDate: dateStr });
        } else if (showCalendar === 'range') {
            if (!rangeStart || (rangeStart && rangeEnd)) {
                setRangeStart(dateStr);
                setRangeEnd(null);
            } else {
                if (new Date(dateStr) < new Date(rangeStart)) {
                    setRangeStart(dateStr);
                } else {
                    setRangeEnd(dateStr);
                    setFilterMode('range');
                    setShowCalendar(null);
                    trackHistoryDateRange(periodRangeSummary(rangeStart, dateStr), {
                        rangeStart,
                        rangeEnd: dateStr,
                    });
                }
            }
        }
    };


    const formatValue = (val: number, type: MetricType) => {
        if (type === 'tickets_count') return val.toString();
        if (val === 0) return " ";
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: val < 100 ? 2 : 0 }).format(val);
    };

    // Solo actualizan estado local; la base de datos no se toca hasta que el usuario pulse "Guardar Cierre".
    const handleFieldUpdate = (field: string, value: number) => {
        if (!editData) return;
        const newData = { ...editData, [field]: value };
        if (field === 'tpv_sales') newData.net_sales = value / 1.10;
        const cashSalesToday = newData.tpv_sales - newData.sales_card - newData.sales_pending;
        const expectedCash = cashSalesToday + newData.debt_recovered;
        newData.cash_expected = expectedCash;
        const diff = newData.cash_counted - expectedCash;
        newData.difference = diff;
        setEditData(newData);
    };

    const parseDateTimeLocal = (value: string): Date => {
        // TIMEZONE IMMUNITY: no Date('YYYY-MM-DD...') parsing
        const [datePart, timePart] = value.split('T');
        const [yStr, mStr, dStr] = (datePart || '').split('-');
        const [hhStr, mmStr] = (timePart || '').split(':');
        const y = Number(yStr);
        const m = Number(mStr);
        const d = Number(dStr);
        const hh = Number(hhStr ?? 0);
        const mm = Number(mmStr ?? 0);
        if (!y || !m || !d) return new Date();
        return new Date(y, m - 1, d, Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0);
    };

    const formatDateTimeLocalInput = (d: Date): string => {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const formatClosingDate = (d: Date): string => {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };

    const handleBreakdownUpdate = (denomination: string, qty: number) => {
        if (!editData) return;
        const newBreakdown = { ...editData.breakdown, [denomination]: qty };
        const totalCounted = Object.entries(newBreakdown).reduce((sum, [den, q]) => sum + (parseFloat(den) * (q as number)), 0);
        const diff = totalCounted - editData.cash_expected;
        const withDrawn = totalCounted;
        const cLeft = 0;
        setEditData({ ...editData, breakdown: newBreakdown, cash_counted: totalCounted, difference: diff, cash_withdrawn: withDrawn, cash_left: cLeft });
    };

    const persistEditData = async (opts?: { exitEdit?: boolean }) => {
        if (!editData) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('cash_closings').update({
                closed_at: editData.closed_at,
                closing_date: editData.closing_date,
                tpv_sales: editData.tpv_sales,
                net_sales: editData.tpv_sales / 1.10,
                sales_card: editData.sales_card,
                sales_pending: editData.sales_pending,
                debt_recovered: editData.debt_recovered,
                cash_expected: editData.cash_expected,
                cash_counted: editData.cash_counted,
                difference: editData.difference,
                breakdown: editData.breakdown,
                cash_withdrawn: editData.cash_withdrawn,
                cash_left: editData.cash_left,
            }).eq('id', editData.id);
            if (error) throw error;
            toast.success("Cierre actualizado");
            setSelectedClosing(editData);
            setEditData({ ...editData });
            if (opts?.exitEdit !== false) setIsEditing(false);
            fetchHistory();
        } catch (err: any) {
            toast.error("Error al actualizar: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClosing = async () => {
        if (!selectedClosing) return;
        if (!confirm("¿Estás seguro de eliminar este cierre?")) return;
        setLoading(true);
        try {
            const paths = [
                selectedClosing.dataphone_totals_photo_path,
                selectedClosing.bdp_closing_ticket_photo_path,
            ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);

            if (paths.length > 0) {
                const photoDelete = await deleteCashClosingPhotosAction(paths);
                if (!photoDelete.success) {
                    toast.error(`No se pudieron borrar las fotos: ${photoDelete.error}`);
                }
            }

            const { error } = await supabase.from('cash_closings').delete().eq('id', selectedClosing.id);
            if (error) throw error;
            toast.success("Cierre eliminado");
            setSelectedClosing(null);
            setLightboxIndex(null);
            setClosingCalculatorOpen(false);
            fetchHistory();
        } catch (err: any) {
            toast.error("Error al eliminar: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleNavigateClosing = (direction: 'next' | 'prev') => {
        if (!selectedClosing) return;
        const currentIndex = closings.findIndex(c => c.id === selectedClosing.id);
        const nextIndex = direction === 'next' ? currentIndex - 1 : currentIndex + 1;
        if (nextIndex >= 0 && nextIndex < closings.length) {
            openClosingDetail(closings[nextIndex]);
            setIsEditing(false);
            setLightboxIndex(null);
        }
    };

    return (
        <div className="min-h-screen p-1 md:p-3 pb-20 text-zinc-900 print:bg-white print:p-0 print:pb-0">
            <div className="max-w-5xl mx-auto print:max-w-none">
                <div className="bg-white rounded-2xl shadow-2xl overflow-hidden print:rounded-none print:shadow-none">
                    <div className="bg-[#36606F] p-1.5 md:p-3 relative print:hidden">
                        <div className="relative flex items-center justify-between gap-1 min-w-0 min-h-[40px] md:min-h-[44px]">
                            <div className="flex items-center gap-1.5 md:gap-2 shrink-0 min-w-0 z-10">
                                <h1 className="text-xs md:text-sm font-black text-white uppercase tracking-tight italic text-nowrap shrink-0">Cierres</h1>
                            </div>

                            {viewMode === 'calendar' ? (
                                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center gap-0.5 sm:gap-1 max-w-[min(100%,14rem)] sm:max-w-none px-1">
                                    <button
                                        type="button"
                                        onClick={handlePrevMonth}
                                        className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center text-white"
                                        aria-label="Mes anterior"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsTimeFilterOpen(true)}
                                        className="text-[10px] sm:text-xs md:text-sm font-black text-white capitalize text-center px-1 truncate hover:text-white/80 transition-colors"
                                    >
                                        {monthNavLabel}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleNextMonth}
                                        className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center text-white"
                                        aria-label="Mes siguiente"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            ) : null}

                            <div className="flex items-center gap-1 shrink-0 text-white ml-auto z-10">
                                <TimeFilterButton
                                    onClick={() => setIsTimeFilterOpen(true)}
                                    showLabel={false}
                                    icon={Filter}
                                    buttonClassName={cn(
                                        "min-h-10 min-w-10 px-0 py-0",
                                        "rounded-xl border-0 bg-transparent hover:bg-white/10",
                                        "text-white/90 hover:text-white"
                                    )}
                                    hasActiveFilter={(() => {
                                        const now = new Date();
                                        const defS = format(startOfMonth(now), 'yyyy-MM-dd');
                                        const defE = format(endOfMonth(now), 'yyyy-MM-dd');
                                        const isDefault = filterMode === 'range' && rangeStart === defS && rangeEnd === defE;
                                        return !isDefault;
                                    })()}
                                    onClear={() => {
                                        const now = new Date();
                                        setFilterMode('range');
                                        setRangeStart(format(startOfMonth(now), 'yyyy-MM-dd'));
                                        setRangeEnd(format(endOfMonth(now), 'yyyy-MM-dd'));
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white">
                        <div className="pt-4 md:pt-5 pb-1 md:pb-1.5 px-4 grid grid-cols-3 border-b border-zinc-50 print:hidden">
                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-lg md:text-2xl font-black text-zinc-900 tabular-nums leading-none">{formatValue(summary.totalGross, 'tpv_sales')}</span>
                                <span className="text-[7px] md:text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-0.5 md:mt-1 font-bold">VENTAS</span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100">
                                <span className="text-lg md:text-2xl font-black text-emerald-600 tabular-nums leading-none">{formatValue(summary.totalNet, 'net_sales')}</span>
                                <span className="text-[7px] md:text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-0.5 md:mt-1 font-bold">VENTA NETA</span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100 italic">
                                <span className="text-lg md:text-2xl font-black text-[#36606F] tabular-nums leading-none">{summary.avgTicket.toFixed(1)}€</span>
                                <span className="text-[7px] md:text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-0.5 md:mt-1 font-bold">TICKET MEDIO</span>
                            </div>
                        </div>

                        <div className="flex shrink-0 border-b border-zinc-100 px-4 py-2 justify-center items-center relative print:hidden">
                            <div className="inline-flex rounded-lg overflow-hidden border border-[#36606F] shadow-sm">
                                <button
                                    onClick={() => setViewMode('table')}
                                    className={cn(
                                        "px-2.5 py-1 text-[8px] font-black uppercase tracking-wider transition-colors outline-none",
                                        viewMode === 'table' ? "bg-[#36606F] text-white" : "bg-white text-[#36606F] hover:bg-[#36606F]/5"
                                    )}
                                >
                                    Tabla
                                </button>
                                <button
                                    onClick={() => setViewMode('calendar')}
                                    className={cn(
                                        "px-2.5 py-1 text-[8px] font-black uppercase tracking-wider transition-colors outline-none",
                                        viewMode === 'calendar' ? "bg-[#36606F] text-white" : "bg-white text-[#36606F] hover:bg-[#36606F]/5"
                                    )}
                                >
                                    Calendario
                                </button>
                            </div>
                            {viewMode === 'table' && (
                                <div className="absolute right-4 top-1/2 -translate-y-1/2" data-history-share-root="true">
                                    <div className="relative" data-history-share-root="true">
                                        <button
                                            type="button"
                                            onClick={() => setShareMenuOpen(v => !v)}
                                            className={cn(
                                                "p-2 rounded-lg text-[#36606F] hover:bg-[#36606F]/5 transition-colors outline-none",
                                                "min-h-[48px] min-w-[48px] flex items-center justify-center",
                                                shareBusy ? "opacity-60 pointer-events-none" : ""
                                            )}
                                            title="Compartir"
                                            aria-label="Compartir"
                                        >
                                            <Share size={16} />
                                        </button>

                                        {shareMenuOpen && (
                                            <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white text-zinc-900 shadow-2xl border border-zinc-100 overflow-hidden">
                                                <button
                                                    type="button"
                                                    onClick={exportTableToExcel}
                                                    className="w-full min-h-12 px-4 py-3 flex items-center justify-between hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
                                                >
                                                    <span className="text-[11px] font-black uppercase tracking-widest">Exportar Excel</span>
                                                    <Download className="w-4 h-4 text-zinc-500" />
                                                </button>
                                                <div className="h-px bg-zinc-100" />
                                                <button
                                                    type="button"
                                                    onClick={printTable}
                                                    className="w-full min-h-12 px-4 py-3 flex items-center justify-between hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
                                                >
                                                    <span className="text-[11px] font-black uppercase tracking-widest">Imprimir</span>
                                                    <Printer className="w-4 h-4 text-zinc-500" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="px-1.5 md:px-3 pb-2 md:pb-4 pt-1 md:pt-1.5">
                            {viewMode === 'table' ? (
                                <div className="p-4 md:p-6 bg-zinc-50/50 overflow-x-auto overflow-y-visible custom-scrollbar print:overflow-visible print:bg-white print:p-4">
                                    <div className="hidden print:block text-lg font-black text-zinc-800 mb-2">Cierres — Historial</div>
                                    {loading ? (
                                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                                            <LoadingSpinner size="lg" className="text-[#36606F]" />
                                        </div>
                                    ) : closings.length === 0 ? (
                                        <div className="text-center py-20 opacity-30 flex flex-col items-center gap-3">
                                            <Calendar size={32} />
                                            <p className="text-[10px] font-black uppercase tracking-widest">Sin actividad</p>
                                        </div>
                                    ) : (
                                        <div className="w-full bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden print-table-cierres">
                                            <table className="w-full text-left border-collapse table-fixed md:table-auto">
                                                <thead className="bg-[#36606F] text-white text-[8px] md:text-[9.5px] font-black uppercase tracking-wider md:tracking-tight border-b border-[#36606F]">
                                                    <tr>
                                                        <th className="py-2.5 px-0.5 md:px-1 whitespace-nowrap">Fecha</th>
                                                        <th className="py-2.5 px-0.5 md:px-1 text-right whitespace-nowrap">Ventas €</th>
                                                        <th className="py-2.5 px-0.5 md:px-1 text-right whitespace-nowrap">Neta €</th>
                                                        <th className="py-2.5 px-0.5 md:px-1 text-right whitespace-nowrap">Ticks</th>
                                                        <th className="py-2.5 px-0.5 md:px-1 text-right whitespace-nowrap">TM €</th>
                                                        <th className="py-2.5 px-0.5 md:px-1 text-right whitespace-nowrap">Cash €</th>
                                                        <th className="py-2.5 px-0.5 md:px-1 text-right whitespace-nowrap">Card €</th>
                                                        <th className="py-2.5 px-0.5 md:px-1 text-right whitespace-nowrap">Pend. €</th>
                                                        <th className="py-2.5 px-0.5 md:px-1 text-right whitespace-nowrap">Recup. €</th>
                                                        <th className="py-2.5 px-0.5 md:px-1 text-right whitespace-nowrap">Dif. €</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="text-[9.5px] font-bold text-zinc-600 bg-white">
                                                    {[...closings]
                                                        .sort((a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime())
                                                        .map((c) => {
                                                            const d = new Date(c.closed_at);
                                                            const avgTicket = (c.tickets_count || 0) > 0 ? (c.tpv_sales || 0) / c.tickets_count : 0;
                                                            const diff = c.difference ?? 0;
                                                            const formatCompact = (val: number) => Math.round(val || 0);

                                                            return (
                                                                <tr
                                                                    key={c.id}
                                                                    onClick={() => openClosingDetail(c)}
                                                                    className="group hover:bg-zinc-50/80 transition-colors cursor-pointer active:bg-zinc-100 border-b border-zinc-50/40 last:border-0"
                                                                >
                                                                    <td className="py-2 px-0.5 md:px-1 whitespace-nowrap text-zinc-500 font-mono text-[8px] md:text-[9.5px]">
                                                                        {format(d, 'd/M/yy', { locale: es })}
                                                                    </td>
                                                                    <td className="py-2 px-0.5 md:px-1 text-right font-black tabular-nums whitespace-nowrap text-[9px] md:text-[10px]">
                                                                        {formatCompact(c.tpv_sales)}
                                                                    </td>
                                                                    <td className="py-2 px-0.5 md:px-1 text-right font-black tabular-nums whitespace-nowrap text-[9px] md:text-[10px] text-emerald-600">
                                                                        {formatCompact(c.net_sales)}
                                                                    </td>
                                                                    <td className="py-2 px-0.5 md:px-1 text-right font-black tabular-nums whitespace-nowrap text-[9px] md:text-[10px]">
                                                                        {c.tickets_count || 0}
                                                                    </td>
                                                                    <td className="py-2 px-0.5 md:px-1 text-right font-black tabular-nums whitespace-nowrap text-[9px] md:text-[10px] text-[#36606F]/80">
                                                                        {avgTicket === 0 ? ' ' : Math.round(avgTicket)}
                                                                    </td>
                                                                    <td className="py-2 px-0.5 md:px-1 text-right font-black tabular-nums whitespace-nowrap text-[9px] md:text-[10px]">
                                                                        {formatCompact(c.cash_counted)}
                                                                    </td>
                                                                    <td className="py-2 px-0.5 md:px-1 text-right font-black tabular-nums whitespace-nowrap text-[9px] md:text-[10px]">
                                                                        {formatCompact(c.sales_card)}
                                                                    </td>
                                                                    <td className="py-2 px-0.5 md:px-1 text-right font-black tabular-nums whitespace-nowrap text-[9px] md:text-[10px] text-orange-600/70">
                                                                        {formatCompact(c.sales_pending)}
                                                                    </td>
                                                                    <td className="py-2 px-0.5 md:px-1 text-right font-black tabular-nums whitespace-nowrap text-[9px] md:text-[10px] text-blue-600/70">
                                                                        {formatCompact(c.debt_recovered)}
                                                                    </td>
                                                                    <td className={cn(
                                                                        "py-2 px-1 md:px-2 text-right font-black tabular-nums whitespace-nowrap text-[9px] md:text-[10px]",
                                                                        diff > 0 ? "text-emerald-600" : diff < 0 ? "text-rose-600" : "text-zinc-400"
                                                                    )}>
                                                                        {diff === 0 ? ' ' : Math.round(diff)}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="min-w-0">
                                    {loading ? (
                                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                                            <LoadingSpinner size="lg" className="text-[#36606F]" />
                                        </div>
                                    ) : (
                                        <>
                                            <div className="py-2 bg-zinc-50/50">
                                                <div className="mx-auto w-[97%] min-w-0 rounded-xl border border-zinc-200 shadow-[0_2px_10px_rgba(0,0,0,0.08)] overflow-hidden bg-white">
                                                <div className="grid grid-cols-7 border-b border-gray-100">
                                                    {CALENDAR_WEEKDAYS.map((d, index) => (
                                                        <div
                                                            key={d}
                                                            className="h-5 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center shadow-sm border-r border-white/30 last:border-r-0"
                                                        >
                                                            <span className="text-[9px] font-bold text-white uppercase tracking-wider truncate px-0.5 drop-shadow-sm leading-none">
                                                                <span className="hidden md:inline">{d}</span>
                                                                <span className="md:hidden">{['L', 'M', 'X', 'J', 'V', 'S', 'D'][index]}</span>
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>

                                                {calendarWeeks.map((week) => (
                                                    <div key={format(week[0], 'yyyy-MM-dd')} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
                                                        {week.map((day) => {
                                                            const key = format(day, 'yyyy-MM-dd');
                                                            const closing = closingsByDate.get(key);
                                                            const isViewMonthDay = isSameMonth(day, viewMonth);
                                                            const today = isToday(day);
                                                            const isPastDay = isViewMonthDay && isBefore(day, startOfDay(new Date()));
                                                            const pastDayBg = isPastDay ? 'bg-zinc-50/90' : 'bg-white';

                                                            if (!closing) {
                                                                return (
                                                                    <div
                                                                        key={key}
                                                                        className={cn(
                                                                            'relative flex flex-col min-h-[96px] sm:min-h-[112px] md:min-h-[128px] lg:min-h-[144px] p-1 sm:p-1.5',
                                                                            'border-r border-gray-100 last:border-r-0',
                                                                            pastDayBg,
                                                                            !isViewMonthDay && 'opacity-25',
                                                                            today && isViewMonthDay && !isPastDay && 'bg-blue-50/10'
                                                                        )}
                                                                    >
                                                                        <span
                                                                            className={cn(
                                                                                'absolute top-1 right-1 text-[9px] font-bold',
                                                                                today && isViewMonthDay ? 'text-blue-600' : 'text-gray-400',
                                                                                !isViewMonthDay && 'opacity-50'
                                                                            )}
                                                                        >
                                                                            {format(day, 'd')}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            }

                                                            return (
                                                                <button
                                                                    key={closing.id}
                                                                    type="button"
                                                                    onClick={() => openClosingDetail(closing)}
                                                                    className={cn(
                                                                        'group relative flex flex-col text-left min-h-[96px] sm:min-h-[112px] md:min-h-[128px] lg:min-h-[144px] transition-colors p-1 sm:p-1.5',
                                                                        'border-r border-gray-100 last:border-r-0 hover:bg-blue-50/50 active:bg-blue-50/70 cursor-pointer',
                                                                        pastDayBg,
                                                                        !isViewMonthDay && 'opacity-25',
                                                                        today && isViewMonthDay && !isPastDay && 'bg-blue-50/10'
                                                                    )}
                                                                >
                                                                    <span
                                                                        className={cn(
                                                                            'absolute top-1 right-1 text-[9px] font-bold',
                                                                            today && isViewMonthDay ? 'text-blue-600' : 'text-gray-400',
                                                                            !isViewMonthDay && 'opacity-50'
                                                                        )}
                                                                    >
                                                                        {format(day, 'd')}
                                                                    </span>
                                                                    <div className="flex flex-1 flex-col justify-between w-full h-full mt-5 pb-1 px-0.5 gap-1 sm:gap-1.5 md:gap-2 min-h-0 overflow-hidden">
                                                                        {CLOSING_CELL_ROWS.map((row) => (
                                                                            <ClosingCalendarMetricRow
                                                                                key={row.field}
                                                                                dotClass={row.dotClass}
                                                                                value={formatClosingCellValue(closing[row.field])}
                                                                            />
                                                                        ))}
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                            <ClosingCalendarLegend />
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {selectedClosing && (
                <>
                    <QuickCalculatorModal
                        isOpen={closingCalculatorOpen}
                        onClose={() => setClosingCalculatorOpen(false)}
                        overlayClassName="z-[320]"
                    />
                    <FloatingCalculatorFab
                        isOpen={closingCalculatorOpen}
                        onToggle={() => setClosingCalculatorOpen(true)}
                        className="z-[310]"
                    />
                </>
            )}

            {selectedClosing && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => {
                    if (!isEditing) {
                        setSelectedClosing(null);
                        setLightboxIndex(null);
                        setClosingCalculatorOpen(false);
                    }
                }}>
                    <div className="absolute inset-0 bg-[#36606F]/60 backdrop-blur-md" />
                    <div className="relative bg-white rounded-[3rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#36606F] p-4 md:p-5 text-white relative shrink-0 text-center">
                            <div className="relative flex items-center justify-between mb-2 z-10 w-full">
                                <div className="flex-1 flex items-center justify-start min-w-[32px]">
                                    {isEditing && isManager && (
                                        <button
                                            onClick={handleDeleteClosing}
                                            className="p-1 text-rose-300 hover:text-rose-200 hover:bg-rose-500/20 rounded-xl transition-all active:scale-95 min-h-[40px] min-w-[40px] flex items-center justify-center"
                                            title="Eliminar cierre"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center justify-center gap-4">
                                    <div className="flex items-center gap-1.5 opacity-90">
                                        <CloudSun size={14} className="text-amber-400" />
                                        <span className="text-[10px] font-black uppercase text-white">{selectedClosing.weather || 'Clima N/A'}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 opacity-90">
                                        <Receipt size={14} className="text-blue-400" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-white">{selectedClosing.tickets_count || 0} Tickets</span>
                                    </div>
                                </div>

                                <div className="flex-1 flex items-center justify-end gap-1 min-w-[32px]">
                                    <button
                                        onClick={() => {
                                            setIsEditing(false);
                                            setSelectedClosing(null);
                                            setLightboxIndex(null);
                                            setClosingCalculatorOpen(false);
                                        }}
                                        className="p-1 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all shadow-sm active:scale-95 min-h-[40px] min-w-[40px] flex items-center justify-center"
                                    >
                                        <X size={20} strokeWidth={2.5} />
                                    </button>
                                    {!isEditing && isManager && (
                                        <button
                                            onClick={() => { setEditData({ ...selectedClosing }); setIsEditing(true); }}
                                            className="p-1 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all active:scale-95 min-h-[40px] min-w-[40px] flex items-center justify-center"
                                            title="Editar cierre"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="mt-1">
                                <div className="flex items-center justify-center w-full">
                                    <div className="inline-flex items-center justify-center gap-1 md:gap-2 max-w-full">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleNavigateClosing('prev'); }}
                                            className="p-1 transition-all disabled:opacity-30 active:scale-90 text-white/60 hover:text-white shrink-0 min-h-[48px] min-w-[48px] flex items-center justify-center group"
                                            disabled={closings.findIndex(c => c.id === selectedClosing.id) === closings.length - 1}
                                            title="Día Anterior"
                                        >
                                            <ChevronLeft size={24} className="group-hover:-translate-x-0.5 transition-transform" />
                                        </button>
                                        <div className="flex-shrink-0 min-w-0 px-1 lg:px-2">
                                            {isEditing ? (
                                                <div className="flex flex-col items-center">
                                                    <input
                                                        type="datetime-local"
                                                        value={(() => {
                                                            const raw = editData?.closed_at ?? selectedClosing.closed_at;
                                                            const d = new Date(raw);
                                                            return isNaN(d.getTime()) ? '' : formatDateTimeLocalInput(d);
                                                        })()}
                                                        onChange={(e) => {
                                                            if (!editData) return;
                                                            const d = parseDateTimeLocal(e.target.value);
                                                            setEditData({
                                                                ...editData,
                                                                closed_at: d.toISOString(),
                                                                closing_date: formatClosingDate(d),
                                                            });
                                                        }}
                                                        className="bg-transparent border-none text-white font-black text-[10px] sm:text-[11px] uppercase tracking-widest text-center outline-none focus:ring-0 w-auto cursor-pointer"
                                                    />
                                                </div>
                                            ) : (
                                                <h2 className="text-sm sm:text-base md:text-lg font-black uppercase tracking-tighter break-words min-w-0">
                                                    {(() => {
                                                        const d = new Date(selectedClosing.closed_at);
                                                        return isNaN(d.getTime()) ? "Fecha Inválida" : format(d, 'eeee d MMMM', { locale: es });
                                                    })()}
                                                </h2>
                                            )}
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleNavigateClosing('next'); }}
                                            className="p-1 transition-all disabled:opacity-30 active:scale-90 text-white/60 hover:text-white shrink-0 min-h-[48px] min-w-[48px] flex items-center justify-center group"
                                            disabled={closings.findIndex(c => c.id === selectedClosing.id) === 0}
                                            title="Día Siguiente"
                                        >
                                            <ChevronRight size={24} className="group-hover:translate-x-0.5 transition-transform" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 space-y-8 overflow-y-auto flex-1 custom-scrollbar">
                            {(() => {
                                const current = isEditing ? editData : selectedClosing;
                                const formatMoneyModal = (val: number) => val === 0 ? " " : `${val.toFixed(2)}€`;
                                const getValue = (key: keyof typeof current) => Number(current?.[key] ?? 0);
                                const collectionsValue = Number((current as any)?.collections ?? (current as any)?.debt_recovered ?? 0);

                                const MetricItem = ({
                                    label,
                                    value,
                                    fieldKey,
                                    editable = false,
                                }: {
                                    label: string;
                                    value: number;
                                    fieldKey?: string;
                                    editable?: boolean;
                                }) => (
                                    <div className="flex flex-col items-center justify-center text-center min-w-[70px]">
                                        {isEditing && editable && fieldKey ? (
                                            <input
                                                type="number"
                                                className="bg-transparent text-sm md:text-base font-black text-gray-900 text-center outline-none border-none"
                                                value={value || ''}
                                                onChange={e => handleFieldUpdate(fieldKey, parseFloat(e.target.value) || 0)}
                                            />
                                        ) : (
                                            <span className="text-sm md:text-base font-black text-gray-900 leading-none">
                                                {formatMoneyModal(value)}
                                            </span>
                                        )}
                                        <span className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 leading-tight text-center">
                                            {label === 'Pendiente Pago' || label === 'Cobros Pendientes'
                                                ? (
                                                    <>
                                                        {label.split(' ')[0]}
                                                        <br />
                                                        {label.split(' ').slice(1).join(' ')}
                                                    </>
                                                )
                                                : label}
                                        </span>
                                    </div>
                                );

                                return (
                                    <div className="space-y-8">
                                        {/* Fila 1: solo Ventas */}
                                        <div className="grid grid-cols-1 place-items-center">
                                            <MetricItem
                                                label="Ventas"
                                                value={getValue('tpv_sales')}
                                                fieldKey="tpv_sales"
                                                editable={true}
                                            />
                                        </div>

                                        {/* Fila 2: Venta neta, Tarjeta, Efectivo */}
                                        <div className="grid grid-cols-3 gap-4 md:gap-6 place-items-center">
                                            <MetricItem
                                                label="Venta Neta"
                                                value={getValue('net_sales')}
                                            />
                                            <MetricItem
                                                label="Tarjeta"
                                                value={getValue('sales_card')}
                                                fieldKey="sales_card"
                                                editable={true}
                                            />
                                            <div
                                                className="flex flex-col items-center justify-center text-center min-w-[70px] cursor-pointer"
                                                onClick={() => setShowCashDetails(true)}
                                            >
                                                <span className="text-sm md:text-base font-black text-gray-900 leading-none">
                                                    {formatMoneyModal(getValue('cash_counted'))}
                                                </span>
                                                <span className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 leading-tight text-center">
                                                    Efectivo
                                                </span>
                                            </div>
                                        </div>

                                        {/* Fila 3: Pendiente pago, Cobros pendientes, Diferencia */}
                                        <div className="grid grid-cols-3 gap-4 md:gap-6 place-items-center">
                                            <MetricItem
                                                label="Pendiente Pago"
                                                value={getValue('sales_pending')}
                                                fieldKey="sales_pending"
                                                editable={true}
                                            />
                                            <MetricItem
                                                label="Cobros Pendientes"
                                                value={collectionsValue}
                                                fieldKey="debt_recovered"
                                                editable={true}
                                            />
                                            <div className="flex flex-col items-center justify-center text-center min-w-[70px]">
                                                <span className={cn(
                                                    "text-sm md:text-base font-black leading-none",
                                                    getValue('difference') > 0
                                                        ? "text-emerald-600"
                                                        : getValue('difference') < 0
                                                            ? "text-rose-600"
                                                            : "text-gray-400"
                                                )}>
                                                    {formatMoneyModal(getValue('difference'))}
                                                </span>
                                                <span className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 leading-tight text-center">
                                                    Diferencia
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {closingPhotosLoading ? (
                                <div className="flex justify-center py-6">
                                    <LoadingSpinner size="sm" className="text-[#36606F]" />
                                </div>
                            ) : null}
                            {!closingPhotosLoading && (closingPhotoUrls.dataphoneUrl || closingPhotoUrls.bdpUrl) ? (
                                <div className="grid grid-cols-2 gap-4">
                                    {closingPhotoUrls.dataphoneUrl ? (
                                        <button
                                            type="button"
                                            onClick={() => openClosingPhotoLightbox('Totales datáfonos')}
                                            className="flex min-h-[48px] flex-col items-center gap-1.5 transition-opacity active:opacity-80"
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={closingPhotoUrls.dataphoneUrl}
                                                alt="Totales datáfonos"
                                                className="h-28 w-auto max-w-full rounded-xl object-contain"
                                            />
                                            <span className="max-w-full text-center text-[9px] font-black uppercase leading-tight tracking-widest text-gray-400">
                                                Totales datáfonos
                                            </span>
                                        </button>
                                    ) : null}
                                    {closingPhotoUrls.bdpUrl ? (
                                        <button
                                            type="button"
                                            onClick={() => openClosingPhotoLightbox('Informe TPV')}
                                            className="flex min-h-[48px] flex-col items-center gap-1.5 transition-opacity active:opacity-80"
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={closingPhotoUrls.bdpUrl}
                                                alt="Informe TPV"
                                                className="h-28 w-auto max-w-full rounded-xl object-contain"
                                            />
                                            <span className="max-w-full text-center text-[9px] font-black uppercase leading-tight tracking-widest text-gray-400">
                                                Informe TPV
                                            </span>
                                        </button>
                                    ) : null}
                                </div>
                            ) : null}
                            {!closingPhotosLoading && closingPhotosError && (selectedClosing.dataphone_totals_photo_path || selectedClosing.bdp_closing_ticket_photo_path) ? (
                                <p className="text-sm text-rose-600 text-center py-2">{closingPhotosError}</p>
                            ) : null}

                            {isEditing && (
                                <button onClick={() => persistEditData({ exitEdit: true })} disabled={loading} className="w-full h-16 bg-[#36606F] text-white rounded-[2rem] shadow-xl font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                                    {loading ? <LoadingSpinner size="sm" /> : <><Save size={20} /> Guardar Cierre</>}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {selectedClosing && (
                <CashBreakdownModal
                    isOpen={showCashDetails}
                    onClose={() => setShowCashDetails(false)}
                    breakdown={isEditing ? editData.breakdown : selectedClosing.breakdown}
                    date={selectedClosing.closed_at}
                    total={isEditing ? editData.cash_counted : selectedClosing.cash_counted}
                    isEditing={isEditing}
                    onUpdate={handleBreakdownUpdate}
                    saving={loading}
                    onSave={async () => {
                        // En edición: persistir YA el desglose para que el trigger actualice treasury_log (CLOSE_ENTRY).
                        if (!isEditing) {
                            setShowCashDetails(false);
                            return;
                        }
                        await persistEditData({ exitEdit: false });
                        setShowCashDetails(false);
                    }}
                />
            )}

            <CashClosingModal
                isOpen={showClosingModal}
                onClose={() => setShowClosingModal(false)}
                onSuccess={() => {
                    fetchHistory();
                    setShowClosingModal(false);
                }}
            />

            {showCalendar && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm" onClick={() => setShowCalendar(null)}>
                    <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-zinc-50 flex items-center justify-between">
                            <h3 className="font-black text-zinc-900 uppercase text-[10px] tracking-widest">{showCalendar === 'single' ? 'Fecha Única' : 'Rango de Fechas'}</h3>
                            <button onClick={() => setShowCalendar(null)} className="p-3 hover:bg-zinc-100 rounded-2xl transition-colors"><X size={18} className="text-zinc-400" /></button>
                        </div>

                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6 px-2">
                                <button onClick={() => setCalendarBaseDate(subMonths(calendarBaseDate, 1))} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors"><ChevronLeft size={20} className="text-zinc-400" /></button>
                                <span className="font-black text-zinc-900 text-xs uppercase tracking-tight">{format(calendarBaseDate, 'MMMM yyyy', { locale: es })}</span>
                                <button onClick={() => setCalendarBaseDate(addDays(endOfMonth(calendarBaseDate), 1))} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors"><ChevronRight size={20} className="text-zinc-400" /></button>
                            </div>

                            <div className="grid grid-cols-7 gap-1">
                                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                                    <div key={d} className="text-center text-[9px] font-black text-zinc-300 py-2">{d}</div>
                                ))}
                                {generateCalendarDays().map((day, i) => {
                                    if (!day) return <div key={i} />;
                                    const dStr = `${calendarBaseDate.getFullYear()}-${String(calendarBaseDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    const isSelected = showCalendar === 'single' ? selectedDate === dStr : (rangeStart === dStr || rangeEnd === dStr);
                                    const isInRange = showCalendar === 'range' && rangeStart && rangeEnd && new Date(dStr) > new Date(rangeStart) && new Date(dStr) < new Date(rangeEnd);

                                    return (
                                        <button
                                            key={i}
                                            onClick={() => handleDateSelect(day)}
                                            className={cn(
                                                "aspect-square flex items-center justify-center rounded-2xl text-[11px] font-black transition-all",
                                                isSelected ? "bg-zinc-900 text-white shadow-xl scale-110" : isInRange ? "bg-blue-50 text-[#5B8FB9]" : "hover:bg-zinc-50 text-zinc-600"
                                            )}
                                        >
                                            {day}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showMonthPicker && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm" onClick={() => setShowMonthPicker(false)}>
                    <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-zinc-50 flex items-center justify-between">
                            <h3 className="font-black text-zinc-900 uppercase text-[10px] tracking-widest">Seleccionar Mes</h3>
                            <button onClick={() => setShowMonthPicker(false)} className="p-3 hover:bg-zinc-100 rounded-2xl transition-colors"><X size={18} className="text-zinc-400" /></button>
                        </div>

                        <div className="p-6">
                            <div className="flex items-center justify-between mb-8 px-2">
                                <button onClick={() => setPickerYear(pickerYear - 1)} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors">
                                    <ChevronLeft size={20} className="text-zinc-400" />
                                </button>
                                <span className="font-black text-xl text-zinc-900 tracking-tighter">{pickerYear}</span>
                                <button onClick={() => setPickerYear(pickerYear + 1)} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors">
                                    <ChevronRight size={20} className="text-zinc-400" />
                                </button>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                {Array.from({ length: 12 }).map((_, i) => {
                                    const date = new Date(pickerYear, i, 1);
                                    const isSelected = filterMode === 'range' && rangeStart === format(startOfMonth(date), 'yyyy-MM-dd') && rangeEnd === format(endOfMonth(date), 'yyyy-MM-dd');

                                    return (
                                        <button
                                            key={i}
                                            onClick={() => {
                                                const s = startOfMonth(date);
                                                const e = endOfMonth(date);
                                                setRangeStart(format(s, 'yyyy-MM-dd'));
                                                setRangeEnd(format(e, 'yyyy-MM-dd'));
                                                setFilterMode('range');
                                                setShowMonthPicker(false);
                                                trackHistoryMonthPicker(formatMonthYear(pickerYear, i));
                                            }}
                                            className={cn(
                                                "py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2",
                                                isSelected
                                                    ? "bg-zinc-900 border-zinc-900 text-white shadow-lg scale-105"
                                                    : "bg-zinc-50 border-transparent text-zinc-400 hover:border-zinc-200 hover:text-zinc-900"
                                            )}
                                        >
                                            {format(date, 'MMM', { locale: es })}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ImageLightbox
                open={lightboxIndex !== null && closingPhotoSlides.length > 0}
                slides={closingPhotoSlides}
                activeIndex={lightboxIndex ?? 0}
                onActiveIndexChange={setLightboxIndex}
                onClose={() => setLightboxIndex(null)}
            />

            <TimeFilterModal
                isOpen={isTimeFilterOpen}
                onClose={() => setIsTimeFilterOpen(false)}
                allowedKinds={["date", "range", "week", "month", "year"]}
                initialValue={
                    filterMode === "single"
                        ? ({ kind: "date", date: selectedDate } satisfies TimeFilterValue)
                        : rangeStart && rangeEnd
                            ? ({ kind: "range", startDate: rangeStart, endDate: rangeEnd } satisfies TimeFilterValue)
                            : ({ kind: "date", date: selectedDate } satisfies TimeFilterValue)
                }
                onApply={(v) => {
                    if (v.kind === "date") {
                        setSelectedDate(v.date);
                        setFilterMode("single");
                        return;
                    }
                    if (v.kind === "range" || v.kind === "week") {
                        setRangeStart(v.startDate);
                        setRangeEnd(v.endDate);
                        setFilterMode("range");
                        return;
                    }
                    if (v.kind === "month") {
                        const s = new Date(v.year, v.month - 1, 1);
                        const e = new Date(v.year, v.month, 0);
                        setRangeStart(format(s, "yyyy-MM-dd"));
                        setRangeEnd(format(e, "yyyy-MM-dd"));
                        setFilterMode("range");
                        return;
                    }
                    if (v.kind === "year") {
                        const s = new Date(v.year, 0, 1);
                        const e = new Date(v.year, 11, 31);
                        setRangeStart(format(s, "yyyy-MM-dd"));
                        setRangeEnd(format(e, "yyyy-MM-dd"));
                        setFilterMode("range");
                    }
                }}
            />
        </div>
    );
}