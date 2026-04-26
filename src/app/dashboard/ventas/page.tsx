'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from "@/utils/supabase/client";
import { X, ChevronLeft, ChevronRight, Landmark } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, startOfMonth, endOfMonth, isSameDay, addDays, subDays, subMonths, isSameMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, getBusinessHourFromTicket } from '@/lib/utils';
import { toast } from 'sonner';
import { BUSINESS_HOURS } from '@/lib/constants';
import { TimeFilterButton } from '@/components/time/TimeFilterButton';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import type { TimeFilterValue } from '@/components/time/time-filter-types';
import { SubNavVentas } from '@/components/dashboards/SubNavVentas';
import type { VentasTab } from '@/components/dashboards/SubNavVentas';
import * as XLSX from 'xlsx';

interface TicketSummary {
    numero_documento: string;
    fecha: string;
    hora_cierre: string;
    origen: string;
    total_documento: number;
    mesa?: number | null;
}

interface ProductRanking {
    rank?: number;
    nombre_articulo: string;
    cantidad_total: number;
    precio_medio: number;
    total_ingresos: number;
}

/** Tramo horario para la pestaña Horas (tickets con h<7 excluidos). */
function hourToSlotLabel(h: number): string | null {
    if (h >= 7 && h <= 22) {
        const start = `${String(h).padStart(2, '0')}:00`;
        const end = `${String(h + 1).padStart(2, '0')}:00`;
        return `${start} - ${end}`;
    }
    if (h === 23) return '23:00 - 24:00';
    return null;
}

interface HourSlotRow {
    label: string;
    cant: number;
    media: number;
    total: number;
}

export default function VentasPage() {
    const supabase = createClient();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [activeTab, setActiveTab] = useState<VentasTab>('VENTAS');
    const [isHector, setIsHector] = useState(false);

    // Leer el parámetro ?tab=X al montar (viene desde /dashboard/sala via SubNavVentas)
    useEffect(() => {
        const tab = searchParams.get('tab') as VentasTab | null;
        const valid: VentasTab[] = ['VENTAS', 'PRODUCTOS', 'HORAS'];
        if (tab && valid.includes(tab)) {
            setActiveTab(tab);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const { data } = await supabase.auth.getUser();
            const email = data?.user?.email ?? '';
            if (!cancelled) setIsHector(String(email).toLowerCase() === 'hhector7722@gmail.com');
        })();
        return () => {
            cancelled = true;
        };
    }, [supabase]);

    // Filtros de fecha (Arquitectura calcada de HistoryPage)
    const [filterMode, setFilterMode] = useState<'single' | 'range'>('single');
    const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [rangeStart, setRangeStart] = useState<string | null>(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [rangeEnd, setRangeEnd] = useState<string | null>(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));

    const [showCalendar, setShowCalendar] = useState<'single' | 'range' | null>(null);
    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [calendarBaseDate, setCalendarBaseDate] = useState(new Date());
    const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
    const [isTimeFilterOpen, setIsTimeFilterOpen] = useState(false);
    const [hourFilter, setHourFilter] = useState<{ startTime: string; endTime: string } | null>(null);

    const calendarDays = useMemo(() => {
        const base = filterMode === 'range' && rangeStart ? new Date(rangeStart) : new Date(selectedDate);
        const startVisible = startOfWeek(startOfMonth(base), { weekStartsOn: 1 });
        const endVisible = endOfWeek(endOfMonth(base), { weekStartsOn: 1 });
        return eachDayOfInterval({ start: startVisible, end: endVisible });
    }, [filterMode, rangeStart, selectedDate]);

    // Estados de Datos
    const [loading, setLoading] = useState(true);
    const [tickets, setTickets] = useState<TicketSummary[]>([]);
    const [products, setProducts] = useState<ProductRanking[]>([]);
    const [summary, setSummary] = useState({ totalSales: 0, count: 0, avgTicket: 0 });

    // Estados para Drill-down (Lazy Loading)
    const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
    const [ticketLines, setTicketLines] = useState<any[]>([]);
    const [loadingLines, setLoadingLines] = useState(false);

    // Gráfica ventas por hora (contenedor tipo dashboard)
    const [salesChartData, setSalesChartData] = useState<{ hora: number; total: number }[]>(() => Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 })));
    const [selectedChartHour, setSelectedChartHour] = useState<number | null>(null);
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    // Fecha usada para la gráfica: día único o primer día del rango
    const chartDate = filterMode === 'single' ? selectedDate : (rangeStart ?? selectedDate);

    useEffect(() => {
        fetchVentas();
    }, [rangeStart, rangeEnd, selectedDate, filterMode, hourFilter]);

    useEffect(() => {
        let cancelled = false;
        async function fetchHourly() {
            try {
                const { data, error } = await supabase.rpc('get_hourly_sales', {
                    p_start_date: chartDate,
                    p_end_date: chartDate
                });
                if (cancelled) return;
                if (!error && data && data.length > 0) {
                    const hourly = Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 }));
                    data.forEach((r: { hora: number; total: number }) => {
                        const h = Number(r.hora);
                        if (h >= 0 && h < 24) hourly[h] = { hora: h, total: Number(r.total) || 0 };
                    });
                    setSalesChartData(hourly);
                    return;
                }
                const { data: ticketsData } = await supabase
                    .from('tickets_marbella')
                    .select('hora_cierre, total_documento, fecha')
                    .eq('fecha', chartDate);
                const hourly = Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 }));
                (ticketsData || []).forEach((t: { hora_cierre?: string; total_documento?: number; fecha?: string }) => {
                    const hour = getBusinessHourFromTicket(t);
                    hourly[hour].total += Number(t.total_documento) || 0;
                });
                setSalesChartData(hourly);
            } catch {
                if (!cancelled) setSalesChartData(Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 })));
            }
        }
        fetchHourly();
        return () => { cancelled = true; };
    }, [chartDate]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            if (selectedChartHour === null) return;
            const target = e.target as Node;
            const chartEl = chartContainerRef.current;
            const tooltipEl = tooltipRef.current;
            if (chartEl?.contains(target) || tooltipEl?.contains(target)) return;
            setSelectedChartHour(null);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside, { passive: true });
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [selectedChartHour]);

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

    async function fetchVentas() {
        setLoading(true);
        try {
            let productStartYmd: string;
            let productEndYmd: string;

            let ticketsQuery = supabase
                .from('tickets_marbella')
                .select('numero_documento, fecha, hora_cierre, total_documento, mesa')
                .order('fecha', { ascending: false })
                .order('hora_cierre', { ascending: false });

            if (filterMode === 'single') {
                productStartYmd = selectedDate;
                productEndYmd = selectedDate;
                ticketsQuery = ticketsQuery.eq('fecha', selectedDate);
            } else {
                if (!rangeStart || !rangeEnd) {
                    setTickets([]);
                    setProducts([]);
                    setSummary({ totalSales: 0, count: 0, avgTicket: 0 });
                    setLoading(false);
                    return;
                }
                productStartYmd = rangeStart;
                productEndYmd = rangeEnd;
                ticketsQuery = ticketsQuery.gte('fecha', rangeStart).lte('fecha', rangeEnd);
            }

            const ticketsPromise = ticketsQuery;

            const productsPromise = supabase.rpc('get_product_sales_ranking', {
                p_start_date: productStartYmd,
                p_end_date: productEndYmd
            });

            const [ticketsRes, productsRes] = await Promise.all([ticketsPromise, productsPromise]);

            if (ticketsRes.error) {
                if (ticketsRes.error.code === '42P01') {
                    console.warn("Tabla tickets_marbella no detectada o permisos erróneos. Mocking data...");
                } else {
                    console.error("Error tickets:", ticketsRes.error);
                    throw ticketsRes.error;
                }
            }
            if (productsRes.error) {
                console.warn("Error en RPC get_product_sales_ranking o no existe.", productsRes.error);
            }

            const activeData = ticketsRes.data || [];
            const activeProducts = productsRes.data || [];

            const filteredTickets = (() => {
                if (!hourFilter) return activeData;
                const [sH, sM] = hourFilter.startTime.split(':').map(Number);
                const [eH, eM] = hourFilter.endTime.split(':').map(Number);
                const startTotal = (Number.isFinite(sH) ? sH : 0) * 60 + (Number.isFinite(sM) ? sM : 0);
                const endTotal = (Number.isFinite(eH) ? eH : 0) * 60 + (Number.isFinite(eM) ? eM : 0);
                return activeData.filter((t: any) => {
                    const hour = getBusinessHourFromTicket(t);
                    const minutes = hour * 60; // aproximación por hora
                    return minutes >= startTotal && minutes <= endTotal;
                });
            })();

            const total = filteredTickets.reduce((acc, t) => acc + (Number((t as any).total_documento) || 0), 0);
            const count = filteredTickets.length;

            setTickets(filteredTickets as any);
            setProducts(activeProducts.map((p: any, i: number) => ({ ...p, rank: i + 1 })) as ProductRanking[]);
            setSummary({
                totalSales: total,
                count: count,
                avgTicket: count > 0 ? total / count : 0
            });

        } catch (err: any) {
            console.error('Error fetching ventas:', err);
            toast.error("Error al cargar ventas");
        } finally {
            setLoading(false);
        }
    }

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
                }
            }
        }
    };

    const toggleTicket = async (numero_documento: string) => {
        if (expandedTicket === numero_documento) {
            setExpandedTicket(null);
            return;
        }

        setExpandedTicket(numero_documento);
        setLoadingLines(true);
        setTicketLines([]);

        try {
            const { data, error } = await supabase.rpc('get_ticket_lines', {
                p_numero_documento: numero_documento
            });

            if (error) throw error;

            // Agrupación y compresión de líneas del ticket a prueba de fallos
            const groupedLines = (data || []).reduce((acc: any, line: any) => {
                const key = `${line.articulo_nombre}-${line.precio_unidad}`;
                // El RPC devuelve 'cantidad', pero el JSX espera 'unidades'. Lo mapeamos.
                const qty = Number(line.cantidad ?? line.unidades ?? 0);
                const total = Number(line.importe_total ?? 0);

                if (!acc[key]) {
                    acc[key] = { ...line, unidades: qty, importe_total: total };
                } else {
                    acc[key].unidades += qty;
                    acc[key].importe_total += total;
                }
                return acc;
            }, {});

            setTicketLines(Object.values(groupedLines));
        } catch (err) {
            console.error('Error fetching ticket lines:', err);
            toast.error("Error al cargar detalles del ticket");
        } finally {
            setLoadingLines(false);
        }
    };

    const handleRowClick = (ticketId: string) => {
        toggleTicket(ticketId);
    };

    const hourSlotsRows = useMemo((): HourSlotRow[] => {
        const map = new Map<string, { count: number; sum: number }>();
        for (const t of tickets) {
            const h = getBusinessHourFromTicket(t);
            const label = hourToSlotLabel(h);
            if (!label) continue;
            const amt = Number(t.total_documento) || 0;
            const prev = map.get(label) ?? { count: 0, sum: 0 };
            prev.count += 1;
            prev.sum += amt;
            map.set(label, prev);
        }
        const rows: HourSlotRow[] = [];
        for (const [label, { count, sum }] of map) {
            if (count === 0) continue;
            rows.push({
                label,
                cant: count,
                media: sum / count,
                total: sum
            });
        }
        rows.sort((a, b) => b.total - a.total);
        return rows;
    }, [tickets]);

    const getActiveTableEl = (): HTMLTableElement | null => {
        const table = document.querySelector('.print-table-ventas table') as HTMLTableElement | null;
        return table;
    };

    const getCleanPrintableTableHTML = (): string | null => {
        const table = getActiveTableEl();
        if (!table) return null;
        const clone = table.cloneNode(true) as HTMLTableElement;
        // El drill-down de tickets se renderiza en un <tr className="... print:hidden">.
        // Para exportar/imprimir “la tabla activa” sin detalles colapsados, eliminamos esas filas.
        clone.querySelectorAll('tr.print\\:hidden').forEach((tr) => tr.remove());
        return clone.outerHTML;
    };

    const exportActiveTableToExcel = () => {
        try {
            const table = getActiveTableEl();
            if (!table) {
                toast.error('No se ha encontrado la tabla activa para exportar.');
                return;
            }
            const cleanHTML = getCleanPrintableTableHTML();
            if (!cleanHTML) {
                toast.error('No se pudo preparar la tabla para exportar.');
                return;
            }
            const tmp = document.createElement('div');
            tmp.innerHTML = cleanHTML;
            const cleanTable = tmp.querySelector('table') as HTMLTableElement | null;
            if (!cleanTable) {
                toast.error('No se pudo preparar la tabla para exportar.');
                return;
            }

            const ws = XLSX.utils.table_to_sheet(cleanTable);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Tabla');

            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
            const fileName = `ventas_${activeTab.toLowerCase()}_${stamp}.xlsx`;
            XLSX.writeFile(wb, fileName, { compression: true });
            toast.success('Excel descargado.');
        } catch (e) {
            console.error(e);
            toast.error('Error exportando a Excel.');
        }
    };

    const printActiveTable = () => {
        try {
            const cleanHTML = getCleanPrintableTableHTML();
            if (!cleanHTML) {
                toast.error('No se ha encontrado la tabla activa para imprimir.');
                return;
            }

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
    <title>Imprimir ventas</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 24px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color: #111827; }
      table { width: 100%; border-collapse: collapse; }
      thead th {
        background: #36606F; color: white;
        text-transform: uppercase; letter-spacing: 0.12em;
        font-weight: 800; font-size: 11px;
        padding: 10px 12px; text-align: left;
      }
      tbody td {
        border-top: 1px solid #f4f4f5;
        padding: 10px 12px;
        font-size: 12px;
        vertical-align: top;
      }
      tbody tr:nth-child(even) td { background: #fafafa; }
      @media print {
        body { margin: 0; padding: 0; }
        table { page-break-inside: auto; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        thead { display: table-header-group; }
      }
    </style>
  </head>
  <body>
    ${cleanHTML}
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
        }
    };

    return (
        <div className="min-h-screen bg-[#3E6A8A] p-1 md:p-3 pb-20 text-zinc-900 print:bg-white print:p-0 print:pb-0">
            <div className="max-w-5xl mx-auto print:max-w-none">
                <div className="bg-white rounded-2xl shadow-2xl overflow-hidden print:rounded-none print:shadow-none">

                    {/* CABECERA Y FILTROS (formato alineado con /dashboard/history) */}
                    <div className="bg-[#36606F] p-1.5 md:p-3 relative print:hidden">
                        <div className="relative flex items-center justify-between gap-1 min-w-0">
                            <div className="flex items-center gap-1.5 md:gap-2 shrink-0 min-w-0">
                                <h1 className="text-xs md:text-sm font-black text-white uppercase tracking-tight italic text-nowrap shrink-0">Ventas</h1>
                            </div>

                            <div className="flex items-center gap-0.5 md:gap-1 shrink-0 min-w-0 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (filterMode === 'single') {
                                            const prev = subDays(parseLocalSafe(selectedDate), 1);
                                            setSelectedDate(format(prev, 'yyyy-MM-dd'));
                                        } else {
                                            handlePrevMonth();
                                        }
                                    }}
                                    className="p-1 hover:bg-white/10 rounded-lg text-white transition-all outline-none shrink-0"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsTimeFilterOpen(true)}
                                    className="py-0.5 px-1 text-[9px] sm:text-[10px] md:text-[11px] font-black text-white uppercase tracking-widest text-center outline-none max-w-[min(calc(100vw-5.5rem),24rem)] leading-tight"
                                >
                                    {filterMode === 'single'
                                        ? format(parseLocalSafe(selectedDate), "EEEE d 'de' MMMM", { locale: es })
                                        : (rangeStart && rangeEnd && isSameMonth(parseLocalSafe(rangeStart), parseLocalSafe(rangeEnd))
                                            ? format(parseLocalSafe(rangeStart), "MMMM 'de' yyyy", { locale: es })
                                            : 'Periodo')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (filterMode === 'single') {
                                            const next = addDays(parseLocalSafe(selectedDate), 1);
                                            setSelectedDate(format(next, 'yyyy-MM-dd'));
                                        } else {
                                            handleNextMonth();
                                        }
                                    }}
                                    className="p-1 hover:bg-white/10 rounded-lg text-white transition-all outline-none shrink-0"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 text-white">
                                <TimeFilterButton
                                    onClick={() => setIsTimeFilterOpen(true)}
                                    buttonClassName={cn(
                                        "min-h-12 min-w-12 px-0 py-0",
                                        "rounded-xl border-0 bg-transparent hover:bg-transparent",
                                        "text-white/90 hover:text-white"
                                    )}
                                    hasActiveFilter={(() => {
                                        const today = new Date().toISOString().split('T')[0];
                                        const isDefault = filterMode === 'single' && selectedDate === today && !hourFilter;
                                        return !isDefault;
                                    })()}
                                    onClear={() => {
                                        const today = new Date().toISOString().split('T')[0];
                                        setHourFilter(null);
                                        setFilterMode('single');
                                        setSelectedDate(today);
                                    }}
                                    className="text-white"
                                />

                                {isHector ? (
                                    <button
                                        type="button"
                                        onClick={() => router.push('/dashboard/finanzas')}
                                        aria-label="Abrir finanzas"
                                        title="Finanzas"
                                        className={cn(
                                            'min-h-12 min-w-12 shrink-0',
                                            'bg-transparent border-0 outline-none',
                                            'text-white/90 hover:text-white',
                                            'inline-flex items-center justify-center',
                                            'active:scale-95 transition-transform',
                                        )}
                                    >
                                        <Landmark className="w-[18px] h-[18px]" strokeWidth={2.75} />
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    {/* SECCIÓN DE KPIs */}
                    <div className="pt-4 md:pt-5 pb-1 md:pb-1.5 px-4 grid grid-cols-3 border-b border-zinc-50 print:hidden">
                        <div className="flex flex-col items-center justify-center text-center">
                            <span className="text-lg md:text-2xl font-black tabular-nums leading-none text-emerald-500">
                                {summary.totalSales > 0 ? `${summary.totalSales.toFixed(2)}€` : " "}
                            </span>
                            <span className="text-[7px] md:text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-0.5 md:mt-1 font-bold">Ventas Totales</span>
                        </div>

                        <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100">
                            <span className="text-lg md:text-2xl font-black tabular-nums leading-none text-zinc-900">
                                {summary.count > 0 ? summary.count : " "}
                            </span>
                            <span className="text-[7px] md:text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-0.5 md:mt-1 font-bold">Nº Tickets</span>
                        </div>

                        <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100 italic">
                            <span className="text-lg md:text-2xl font-black tabular-nums leading-none text-[#36606F]">
                                {summary.avgTicket > 0 ? `${summary.avgTicket.toFixed(2)}€` : " "}
                            </span>
                            <span className="text-[7px] md:text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-0.5 md:mt-1 font-bold">Ticket Medio</span>
                        </div>
                    </div>

                    {/* Gráfica ventas por hora (7–23h), igual que contenedor Ventas del dashboard */}
                    {(() => {
                        const chartData = salesChartData;
                        const rangeData = chartData.slice(BUSINESS_HOURS.start, BUSINESS_HOURS.end + 1);
                        const maxMain = Math.max(...rangeData.map(d => d.total), 0);
                        const scaleMax = Math.max(maxMain, 1);
                        const hasData = maxMain > 0;
                        if (!hasData) return null;
                        const numPoints = rangeData.length;
                        const isChartDateToday = chartDate === format(new Date(), 'yyyy-MM-dd');
                        const maxSelectableHour = isChartDateToday ? new Date().getHours() : BUSINESS_HOURS.end;
                        const toPath = (data: { hora: number; total: number }[]) => {
                            const pts = data.map((d, i) => {
                                const x = (i / (numPoints - 1 || 1)) * 120;
                                const y = 22 - (d.total / scaleMax) * 18;
                                return `${x},${y}`;
                            });
                            return pts.length > 0 ? `M ${pts.join(' L ')}` : '';
                        };
                        const getHourFromClientX = (clientX: number): number => {
                            const el = chartContainerRef.current;
                            if (!el) return BUSINESS_HOURS.start;
                            const rect = el.getBoundingClientRect();
                            const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                            const rawHour = BUSINESS_HOURS.start + Math.round(ratio * (numPoints - 1));
                            return Math.min(maxSelectableHour, Math.max(BUSINESS_HOURS.start, rawHour));
                        };
                        const handleChartTap = (clientX: number) => {
                            const hour = getHourFromClientX(clientX);
                            if (hour <= maxSelectableHour) setSelectedChartHour(hour);
                        };
                        const totalHastaHora = selectedChartHour === null ? 0 : Array.from(
                            { length: selectedChartHour - BUSINESS_HOURS.start + 1 },
                            (_, i) => chartData[BUSINESS_HOURS.start + i]?.total ?? 0
                        ).reduce((a, b) => a + Number(b), 0);
                        return (
                            <div className="w-full pb-1 pt-2 px-4 border-b border-zinc-50 shrink-0 print:hidden">
                                <div
                                    ref={chartContainerRef}
                                    className="w-full relative"
                                    onClick={(e) => handleChartTap(e.clientX)}
                                    onTouchEnd={(e) => {
                                        if (e.changedTouches.length) {
                                            e.preventDefault();
                                            handleChartTap(e.changedTouches[0].clientX);
                                        }
                                    }}
                                >
                                    <svg viewBox="0 0 120 24" className="w-full h-8 md:h-10 block select-none" preserveAspectRatio="none">
                                        <path
                                            d={toPath(rangeData)}
                                            fill="none"
                                            stroke="#36606F"
                                            strokeWidth="2"
                                            strokeLinecap="butt"
                                            strokeLinejoin="miter"
                                            vectorEffect="non-scaling-stroke"
                                        />
                                    </svg>
                                </div>
                                <div className="flex justify-between px-0 text-[9px] font-mono text-[#36606F] leading-none select-none pointer-events-none mt-0.5">
                                    <span>7h</span>
                                    <span>23h</span>
                                </div>
                                {selectedChartHour !== null && typeof document !== 'undefined' && (() => {
                                    const idx = selectedChartHour - BUSINESS_HOURS.start;
                                    const xPct = (idx / (numPoints - 1 || 1)) * 100;
                                    const yView = 22 - ((chartData[selectedChartHour]?.total ?? 0) / scaleMax) * 18;
                                    const yPct = (yView / 24) * 100;
                                    const rect = chartContainerRef.current?.getBoundingClientRect();
                                    const pointLeft = rect ? rect.left + (xPct / 100) * rect.width : 0;
                                    const pointTop = rect ? rect.top + (yPct / 100) * rect.height : 0;
                                    const tooltipEl = (
                                        <div className="fixed z-[100] pointer-events-none" style={{ left: pointLeft, top: pointTop, transform: 'translate(-50%, -100%)', marginTop: '-4px' }}>
                                            <div ref={tooltipRef} className="rounded-lg bg-white border border-zinc-200 shadow-lg px-2.5 py-1.5 text-center min-w-[4rem]">
                                                <div className="text-[10px] md:text-xs font-mono font-bold text-zinc-800 leading-tight">{String(selectedChartHour).padStart(2, '0')}:00</div>
                                                <div className="text-[10px] md:text-xs font-black tabular-nums text-emerald-600 leading-tight">{totalHastaHora.toFixed(2)}€</div>
                                            </div>
                                            <div className="absolute left-1/2 top-full w-3 h-3 rounded-full bg-[#36606F] border-2 border-white shadow-sm -translate-x-1/2 -translate-y-1/2" />
                                        </div>
                                    );
                                    return createPortal(tooltipEl, document.body);
                                })()}
                            </div>
                        );
                    })()}

                    {/* SUB-NAV: TICKETS | LIVE | PRODUCTOS | HORAS */}
                    <SubNavVentas
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                        showPrint
                        onExportExcel={exportActiveTableToExcel}
                        onPrint={printActiveTable}
                    />

                    {/* TABLAS */}
                    <div className="p-4 md:p-6 bg-zinc-50/50 print:bg-white print:p-4">
                        <div className="hidden print:block text-lg font-black text-zinc-800 mb-2">
                            Ventas — {activeTab === 'VENTAS' ? 'Ventas' : activeTab === 'PRODUCTOS' ? 'Productos' : 'Horas'}
                        </div>
                        <div className="bg-transparent w-full">
                            {loading ? (
                                <div className="flex justify-center items-center py-20">
                                    <LoadingSpinner size="lg" className="text-[#36606F]" />
                                </div>
                            ) : activeTab === 'VENTAS' ? (
                                tickets.length === 0 ? (
                                    <div className="text-center py-20 opacity-30 flex flex-col items-center gap-3">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Sin ventas en este periodo</span>
                                    </div>
                                ) : (
                                    <div className="w-full bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden print-table-ventas">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-[#36606F] text-white text-[9px] md:text-[10px] font-black uppercase tracking-wider md:tracking-[0.15em] border-b border-[#36606F]">
                                                <tr>
                                                    <th className="py-4 px-3 md:px-6 whitespace-nowrap">Hora</th>
                                                    <th className="py-4 px-3 md:px-6 whitespace-nowrap">Documento</th>
                                                    <th className="py-4 px-3 md:px-6 whitespace-nowrap">Mesa</th>
                                                    <th className="py-4 px-3 md:px-6 text-right whitespace-nowrap">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-xs font-bold text-zinc-600 bg-white">
                                                {tickets.map((ticket, idx) => {
                                                    // Limpiamos los "0" al principio de "2TB0000X"
                                                    const cleanDocNumber = ticket.numero_documento
                                                        ? ticket.numero_documento.replace(/0+/, '')
                                                        : '';

                                                    return (
                                                        <React.Fragment key={ticket.numero_documento || idx}>
                                                            <tr
                                                                onClick={() => handleRowClick(ticket.numero_documento)}
                                                                className={cn(
                                                                    "group hover:bg-zinc-50/80 transition-colors cursor-pointer active:bg-zinc-100",
                                                                    expandedTicket === ticket.numero_documento && "bg-zinc-50 border-transparent"
                                                                )}
                                                            >
                                                                <td className="py-3 px-2 md:px-4 whitespace-nowrap text-zinc-500 font-mono text-[10px] md:text-xs">
                                                                    {(() => {
                                                                        try {
                                                                            let rawTime = ticket.hora_cierre;
                                                                            if (rawTime && typeof rawTime === 'string') {
                                                                                if (rawTime.includes('T')) rawTime = rawTime.split('T')[1];
                                                                                if (rawTime !== '00:00:00' && rawTime.length >= 5) return rawTime.substring(0, 5);
                                                                            }
                                                                            if (ticket.fecha && ticket.fecha.includes('T')) {
                                                                                const fTime = ticket.fecha.split('T')[1];
                                                                                if (fTime !== '00:00:00') return fTime.substring(0, 5);
                                                                            }
                                                                            return '---';
                                                                        } catch (e) { return '---'; }
                                                                    })()}
                                                                </td>
                                                                <td className="py-3 px-2 md:px-4 font-mono text-[10px] md:text-xs text-zinc-700">
                                                                    {cleanDocNumber}
                                                                </td>
                                                                <td className="py-3 px-2 md:px-4 font-mono text-[10px] md:text-xs text-zinc-500">
                                                                    {(!ticket.mesa || ticket.mesa === 0) ? 'Barra' : ticket.mesa}
                                                                </td>
                                                                <td className={cn(
                                                                    "py-3 px-2 md:px-4 text-right font-black tabular-nums whitespace-nowrap text-[11px] md:text-sm",
                                                                    (ticket.total_documento || 0) > 0 ? "text-emerald-500" : "text-zinc-600"
                                                                )}>
                                                                    {(ticket.total_documento || 0) !== 0 ? `${Number(ticket.total_documento).toFixed(2)}€` : ' '}
                                                                </td>
                                                            </tr>
                                                            {expandedTicket === ticket.numero_documento && (
                                                                <tr className="bg-zinc-50/30 print:hidden">
                                                                    <td colSpan={4} className="px-1 py-2 md:p-4">
                                                                        <div className="bg-[#fcfcfc] rounded-2xl p-2 md:p-4 animate-in slide-in-from-top-2 duration-200">
                                                                            {loadingLines ? (
                                                                                <div className="flex justify-center py-6">
                                                                                    <LoadingSpinner size="sm" className="text-[#36606F]/50" />
                                                                                </div>
                                                                            ) : ticketLines.length === 0 ? (
                                                                                <div className="text-center py-4 text-[10px] font-black uppercase tracking-widest text-zinc-300">
                                                                                    No hay detalles para este ticket
                                                                                </div>
                                                                            ) : (
                                                                                <table className="w-full text-left border-collapse table-fixed">
                                                                                    <thead>
                                                                                        <tr className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-zinc-400 border-b border-zinc-200">
                                                                                            <th className="py-2 px-1 text-center w-8 md:w-12">Cant</th>
                                                                                            <th className="py-2 px-1 md:px-2 w-[45%]">Producto</th>
                                                                                            <th className="py-2 px-1 md:px-2 text-right">Precio</th>
                                                                                            <th className="py-2 px-1 text-right">Total</th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody className="text-[10px] md:text-[11px] font-bold text-zinc-500">
                                                                                        {ticketLines.map((line, lIdx) => (
                                                                                            <tr key={lIdx} className="border-b border-zinc-100/50 last:border-0">
                                                                                                <td className="py-2 px-1 text-center tabular-nums text-zinc-400">
                                                                                                    {line.unidades !== 0 ? line.unidades : ' '}
                                                                                                </td>
                                                                                                <td className="py-2 px-1 md:px-2 text-zinc-700 min-w-0 truncate">
                                                                                                    {line.articulo_nombre}
                                                                                                </td>
                                                                                                <td className="py-2 px-1 md:px-2 text-right tabular-nums">
                                                                                                    {line.precio_unidad !== 0 ? line.precio_unidad.toFixed(2) : ' '}
                                                                                                </td>
                                                                                                <td className="py-2 px-1 text-right font-black tabular-nums text-emerald-600/70">
                                                                                                    {line.importe_total !== 0 ? line.importe_total.toFixed(2) : ' '}
                                                                                                </td>
                                                                                            </tr>
                                                                                        ))}
                                                                                    </tbody>
                                                                                </table>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )
                            ) : activeTab === 'PRODUCTOS' ? (
                                products.length === 0 ? (
                                    <div className="text-center py-20 opacity-30 flex flex-col items-center gap-3">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Sin productos en este periodo</span>
                                    </div>
                                ) : (
                                    <div className="w-full bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden print-table-ventas">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-[#36606F] text-white text-[9px] md:text-[10px] font-black uppercase tracking-wider md:tracking-[0.15em] border-b border-[#36606F]">
                                                <tr>
                                                    <th className="py-4 px-3 md:px-6 whitespace-nowrap">Producto</th>
                                                    <th className="py-4 px-2 md:px-4 text-center whitespace-nowrap">Cant</th>
                                                    <th className="py-4 px-2 md:px-4 text-center whitespace-nowrap">Media</th>
                                                    <th className="py-4 px-3 md:px-6 text-right whitespace-nowrap">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-xs font-bold text-zinc-600 bg-white">
                                                {products.map((prod, idx) => (
                                                    <tr
                                                        key={idx}
                                                        className="group hover:bg-zinc-50/80 transition-colors"
                                                    >
                                                        <td className="py-3 px-2 md:px-4 whitespace-nowrap flex items-center gap-1.5 md:gap-3">
                                                            <span className="text-[9px] md:text-[10px] font-black text-zinc-300 tabular-nums w-3 md:w-4 text-right">
                                                                {prod.rank}
                                                            </span>
                                                            <span className="text-zinc-900 font-bold max-w-[100px] sm:max-w-[200px] truncate text-[10px] md:text-xs">
                                                                {prod.nombre_articulo}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-1 md:px-4 text-center text-[10px] md:text-xs text-zinc-500">
                                                            {Number(prod.cantidad_total).toFixed(0)}
                                                        </td>
                                                        <td className="py-3 px-1 md:px-4 text-center text-[10px] md:text-xs text-zinc-400">
                                                            {Number(prod.precio_medio).toFixed(2)}€
                                                        </td>
                                                        <td className="py-3 px-2 md:px-4 text-right font-black tabular-nums whitespace-nowrap text-emerald-500 text-[11px] md:text-sm">
                                                            {Number(prod.total_ingresos).toFixed(2)}€
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )
                            ) : hourSlotsRows.length === 0 ? (
                                <div className="text-center py-20 opacity-30 flex flex-col items-center gap-3">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Sin datos por hora en este periodo</span>
                                </div>
                            ) : (
                                <div className="w-full bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden print-table-ventas">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-[#36606F] text-white text-[9px] md:text-[10px] font-black uppercase tracking-wider md:tracking-[0.15em] border-b border-[#36606F]">
                                            <tr>
                                                <th className="py-4 px-3 md:px-6 whitespace-nowrap">Horas</th>
                                                <th className="py-4 px-2 md:px-4 text-center whitespace-nowrap">Cant</th>
                                                <th className="py-4 px-2 md:px-4 text-center whitespace-nowrap">Media</th>
                                                <th className="py-4 px-3 md:px-6 text-right whitespace-nowrap">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-xs font-bold text-zinc-600 bg-white">
                                            {hourSlotsRows.map((row) => (
                                                <tr
                                                    key={row.label}
                                                    className="group hover:bg-zinc-50/80 transition-colors"
                                                >
                                                    <td className="py-3 px-2 md:px-4 whitespace-nowrap font-mono text-[10px] md:text-xs font-bold text-zinc-900 tabular-nums">
                                                        {row.label}
                                                    </td>
                                                    <td className="py-3 px-1 md:px-4 text-center text-[10px] md:text-xs text-zinc-500 tabular-nums">
                                                        {row.cant !== 0 ? row.cant : ' '}
                                                    </td>
                                                    <td className="py-3 px-1 md:px-4 text-center text-[10px] md:text-xs text-zinc-400 tabular-nums">
                                                        {row.media !== 0 ? `${row.media.toFixed(2)}€` : ' '}
                                                    </td>
                                                    <td className="py-3 px-2 md:px-4 text-right font-black tabular-nums whitespace-nowrap text-emerald-500 text-[11px] md:text-sm">
                                                        {row.total !== 0 ? `${row.total.toFixed(2)}€` : ' '}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>

            {/* MODALES REUTILIZADOS DE HISTORY PAGE */}
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

            <TimeFilterModal
                isOpen={isTimeFilterOpen}
                onClose={() => setIsTimeFilterOpen(false)}
                allowedKinds={["hours", "date", "range", "week", "month", "year"]}
                initialValue={
                    hourFilter
                        ? ({ kind: "hours", startTime: hourFilter.startTime, endTime: hourFilter.endTime } satisfies TimeFilterValue)
                        : filterMode === "single"
                            ? ({ kind: "date", date: selectedDate } satisfies TimeFilterValue)
                            : rangeStart && rangeEnd
                                ? ({ kind: "range", startDate: rangeStart, endDate: rangeEnd } satisfies TimeFilterValue)
                                : ({ kind: "date", date: selectedDate } satisfies TimeFilterValue)
                }
                onApply={(v) => {
                    if (v.kind === "hours") {
                        setHourFilter({ startTime: v.startTime, endTime: v.endTime });
                        return;
                    }
                    setHourFilter(null);
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
