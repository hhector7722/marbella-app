'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import {
    ArrowDownLeft,
    ArrowUpRight,
    Plus,
    Minus,
    Search,
    Filter,
    X,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Check,
    TrendingUp,
    Wallet,
    TrendingDown,
    PiggyBank,
    ArrowRightLeft,
    ArrowUp,
    ArrowDown,
    Download,
    RefreshCw,
    AlertTriangle,
    Share,
    Printer
} from 'lucide-react';

import { toast } from 'sonner';
import { format, addDays, startOfMonth, endOfMonth, isSameMonth, subMonths, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { CashDenominationForm } from '@/components/CashDenominationForm';
import { BoxInventoryView } from '@/components/BoxInventoryView';
import { MovementDetailModal } from '@/components/MovementDetailModal';
import CashClosingModal from '@/components/CashClosingModal';
import { TimeFilterButton } from '@/components/time/TimeFilterButton';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import type { TimeFilterValue } from '@/components/time/time-filter-types';
import * as XLSX from 'xlsx';

interface Movement {
    id: string;
    created_at: string;
    amount: number;
    type: 'income' | 'expense' | 'adjustment';
    notes: string;
    running_balance: number;
    breakdown?: any;
    original_type?: string;
}

export default function MovementsPage() {
    const supabase = createClient();
    const router = useRouter();
    const tableRef = useRef<HTMLTableElement | null>(null);

    // NUMERIC Postgres (normalmente string) -> céntimos enteros.
    // Redondea al céntimo (para corregir imprecisión binaria tipo 392.7599999).
    const parseNumericToCents = (value: any): number => {
        if (value === null || value === undefined) return 0;
        const s = String(value).trim();
        if (!s) return 0;

        const neg = s.startsWith('-');
        const clean = neg || s.startsWith('+') ? s.slice(1) : s;
        const [intPartRaw, fracPartRaw = ''] = clean.split('.');
        const intPart = parseInt(intPartRaw || '0', 10);
        const frac3 = (fracPartRaw || '').padEnd(3, '0').slice(0, 3);
        const frac2 = frac3.slice(0, 2);
        const thirdDigit = frac3[2] ?? '0';

        const third = parseInt(thirdDigit, 10) || 0;
        let roundedFrac = parseInt(frac2 || '0', 10) || 0;
        let roundedInt = intPart;

        if (third >= 5) {
            roundedFrac += 1;
            if (roundedFrac >= 100) {
                roundedFrac = 0;
                roundedInt += 1;
            }
        }

        const cents = roundedInt * 100 + roundedFrac;
        return neg ? -cents : cents;
    };

    const formatCentsToEur = (cents: number, opts?: { showPlus?: boolean }) => {
        const showPlus = opts?.showPlus ?? false;
        const neg = cents < 0;
        const abs = Math.abs(cents);
        const euros = Math.trunc(abs / 100);
        const c = abs % 100;
        const prefix = neg ? '-' : (showPlus && cents > 0 ? '+' : '');
        return `${prefix}${euros}.${String(c).padStart(2, '0')}€`;
    };

    // 1. Estados de Filtro y UI
    const [filterMode, setFilterMode] = useState<'single' | 'range'>('range');
    const [selectedDate, setSelectedDate] = useState<string>(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [rangeStart, setRangeStart] = useState<string | null>(() => {
        const d = startOfMonth(new Date());
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [rangeEnd, setRangeEnd] = useState<string | null>(() => {
        const d = endOfMonth(new Date());
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
    const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
    const [dateSortDir, setDateSortDir] = useState<'asc' | 'desc'>('desc');

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

    // Estados de UI
    const [showCalendar, setShowCalendar] = useState<'single' | 'range' | null>(null);
    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [calendarBaseDate, setCalendarBaseDate] = useState(new Date());
    const [loading, setLoading] = useState(true);
    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
    const [isTimeFilterOpen, setIsTimeFilterOpen] = useState(false);
    const [shareMenuOpen, setShareMenuOpen] = useState(false);
    const [shareBusy, setShareBusy] = useState<null | 'excel' | 'print'>(null);

    // Datos
    const [movements, setMovements] = useState<Movement[]>([]);
    const [boxData, setBoxData] = useState<any>(null);
    const [cashModalMode, setCashModalMode] = useState<'none' | 'in' | 'out' | 'audit' | 'inventory'>('none');
    const [boxInventoryMap, setBoxInventoryMap] = useState<Record<number, number>>({});
    const [boxInventory, setBoxInventory] = useState<any[]>([]);
    const [periodSummary, setPeriodSummary] = useState({
        income: 0,
        expense: 0,
    });

    // ESTADO ATEMPORAL (No afectado por filtros)
    const [currentBoxStatus, setCurrentBoxStatus] = useState<{
        theoreticalBalance: number;
        physicalBalance: number;
        difference: number;
        loading: boolean;
    }>({
        theoreticalBalance: 0,
        physicalBalance: 0,
        difference: 0,
        loading: true
    });
    const [selectedMovement, setSelectedMovement] = useState<Movement | null>(null);

    // DIFERENCIA (UI) = SALDO ACTUAL (físico) - SALDO (running_balance más reciente del libro)
    // Nota: “saldo” aquí ignora ADJUSTMENT/SWAP (como hace la lista).
    const [physicalBalanceCents, setPhysicalBalanceCents] = useState<number>(0);
    const [latestLedgerSaldoCents, setLatestLedgerSaldoCents] = useState<number>(0);
    const [latestLedgerLoading, setLatestLedgerLoading] = useState<boolean>(true);
    const diffFromSaldoCents = physicalBalanceCents - latestLedgerSaldoCents;
    const isDiffZero = !latestLedgerLoading && diffFromSaldoCents === 0;

    // ARCHITECT_ULTRAFLUIDITY: True Network Pagination
    const PAGE_SIZE = 40;
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // 1. CARGA ATEMPORAL (Global)
    useEffect(() => {
        fetchCurrentBoxStatus();
        fetchLatestLedgerSaldo();
    }, []);

    async function fetchCurrentBoxStatus() {
        try {
            // Todo calculado en DB (RPC): saldo teórico, físico, diferencia — sin cálculo en frontend
            const { data: statusRows, error } = await supabase.rpc('get_operational_box_status');

            if (error) throw error;

            const status = Array.isArray(statusRows) ? statusRows[0] : statusRows;
            if (status?.box_id != null) {
                const physicalCents = parseNumericToCents(status.physical_balance ?? 0);
                const physical = physicalCents / 100;
                setBoxData({ id: status.box_id, current_balance: physical, name: status.box_name ?? '' });
                setPhysicalBalanceCents(physicalCents);

                setCurrentBoxStatus({
                    theoreticalBalance: Number(status.theoretical_balance ?? 0),
                    physicalBalance: physical,
                    difference: Number(status.difference ?? 0),
                    loading: false
                });
            } else {
                toast.error("BLOQUEO: No se ha detectado ninguna 'Caja Operativa' en la base de datos.");
                setCurrentBoxStatus(prev => ({ ...prev, loading: false }));
            }
        } catch (error) {
            console.error("Error crítico leyendo caja:", error);
            toast.error("Error de base de datos. Revisa la consola.");
            setCurrentBoxStatus(prev => ({ ...prev, loading: false }));
        }
    }

    async function fetchLatestLedgerSaldo() {
        setLatestLedgerLoading(true);
        try {
            const { data: ledgerRows, error: ledgerError } = await supabase
                .from('v_treasury_movements_balance')
                .select('running_balance')
                .neq('type', 'ADJUSTMENT')
                .neq('type', 'SWAP')
                .order('created_at', { ascending: false })
                .order('id', { ascending: false })
                .limit(1);

            if (ledgerError) throw ledgerError;
            const raw = ledgerRows?.[0]?.running_balance ?? 0;
            setLatestLedgerSaldoCents(parseNumericToCents(raw));
        } catch (e) {
            console.error('Error calculando latestLedgerSaldo en movements:', e);
            toast.error('Error de base de datos al calcular el saldo del libro.');
            setLatestLedgerSaldoCents(0);
        } finally {
            setLatestLedgerLoading(false);
        }
    }

    // 2. CARGA TEMPORAL (Filtrada)
    useEffect(() => {
        if (!currentBoxStatus.loading) {
            fetchFilteredMovements();
        }
    }, [selectedDate, rangeStart, rangeEnd, filterMode, typeFilter, dateSortDir, currentBoxStatus.loading]);

    async function fetchFilteredMovements() {
        setLoading(true);
        setPage(0);
        setMovements([]);
        setHasMore(true);
        try {
            let startISO: string;
            let endISO: string;

            if (filterMode === 'single') {
                const d = parseLocalSafe(selectedDate);
                d.setHours(0, 0, 0, 0);
                startISO = d.toISOString();
                d.setHours(23, 59, 59, 999);
                endISO = d.toISOString();
            } else {
                if (!rangeStart || !rangeEnd) {
                    setMovements([]);
                    setPeriodSummary({ income: 0, expense: 0 });
                    setLoading(false);
                    return;
                }
                const s = parseLocalSafe(rangeStart);
                s.setHours(0, 0, 0, 0);
                const e = parseLocalSafe(rangeEnd);
                e.setHours(23, 59, 59, 999);
                startISO = s.toISOString();
                endISO = e.toISOString();
            }

            // Estadísticas para el resumen del periodo (p_box_id null = todas las cajas)
            const { data: summaryData, error: summaryError } = await supabase.rpc('get_treasury_period_summary', {
                p_box_id: boxData?.id ?? null,
                p_start_date: startISO,
                p_end_date: endISO
            });

            if (summaryError) {
                console.error("Error en el RPC de resumen:", summaryError);
            }

            // RPC devuelve TABLE → array de filas; tomar primera fila
            const row = Array.isArray(summaryData) ? summaryData[0] : summaryData;
            setPeriodSummary({
                income: Number(row?.income ?? 0),
                expense: Number(row?.expense ?? 0),
            });

            // Obtener la primera página
            await fetchPage(0, startISO, endISO, true);

        } catch (error) { console.error(error); } finally { setLoading(false); }
    }

    const refreshMovementsAfterMutation = async () => {
        // Recalcular y refrescar: saldo actual + resumen del periodo + listado (con mismos filtros)
        await fetchCurrentBoxStatus();
        await fetchLatestLedgerSaldo();
        await fetchFilteredMovements();
    };

    async function fetchPage(pageIndex: number, startISO: string, endISO: string, isInitial: boolean = false) {
        if (!isInitial) setIsLoadingMore(true);
        try {
            const from = pageIndex * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            // [FIX] Sin filtro box_id: mostrar TODOS los movimientos (operacional, cambio, históricos sin caja)
            const q = supabase
                .from('v_treasury_movements_balance')
                .select('*')
                .gte('created_at', startISO)
                .lte('created_at', endISO)
                .neq('type', 'ADJUSTMENT')
                .neq('type', 'SWAP')
                .order('created_at', { ascending: dateSortDir === 'asc' })
                .range(from, to);

            const { data: pageMoves, error: fetchError } = await q;

            if (fetchError) {
                console.error("Error crítico cargando movimientos:", fetchError);
                toast.error("Error de base de datos. Revisa la consola.");
            }

            if (pageMoves) {
                const formatted: Movement[] = pageMoves.map((m: any) => ({
                    ...m,
                    type: (m.type === 'IN' || m.type === 'CLOSE_ENTRY') ? 'income' :
                        (m.type === 'OUT' ? 'expense' : 'adjustment'),
                    original_type: m.type,
                    running_balance: parseNumericToCents(m.running_balance || 0) / 100
                }));

                if (isInitial) {
                    setMovements(formatted);
                } else {
                    setMovements(prev => [...prev, ...formatted]);
                }

                setHasMore(pageMoves.length === PAGE_SIZE);
            } else {
                setHasMore(false);
            }
        } catch (error) {
            console.error(error);
        } finally {
            if (!isInitial) setIsLoadingMore(false);
        }
    }

    const loadMore = () => {
        setPage(prevPage => {
            const nextPage = prevPage + 1;

            let startISO: string;
            let endISO: string;

            if (filterMode === 'single') {
                const d = parseLocalSafe(selectedDate);
                d.setHours(0, 0, 0, 0);
                startISO = d.toISOString();
                d.setHours(23, 59, 59, 999);
                endISO = d.toISOString();
            } else {
                if (!rangeStart || !rangeEnd) return prevPage;
                const s = parseLocalSafe(rangeStart);
                s.setHours(0, 0, 0, 0);
                const e = parseLocalSafe(rangeEnd);
                e.setHours(23, 59, 59, 999);
                startISO = s.toISOString();
                endISO = e.toISOString();
            }

            fetchPage(nextPage, startISO, endISO);
            return nextPage;
        });
    };

    const handleCashTransaction = async (total: number, breakdown: any, notes: string, customDate?: string) => {
        try {
            if (!boxData) {
                toast.error("Error: Datos de caja no cargados");
                return;
            }

            const payload: any = {
                box_id: boxData.id,
                type: cashModalMode === 'audit' ? 'ADJUSTMENT' : (cashModalMode === 'in' ? 'IN' : 'OUT'),
                amount: total,
                breakdown: breakdown,
                notes: cashModalMode === 'audit' ? 'Arqueo de caja' : notes
            };

            if (customDate) {
                payload.created_at = customDate;
            } else if (selectedDate) {
                payload.created_at = selectedDate;
            }

            const { error } = await supabase.from('treasury_log').insert(payload);

            if (error) throw error;

            setCashModalMode('none');
            await fetchCurrentBoxStatus();
            await fetchLatestLedgerSaldo();
            await fetchFilteredMovements();
            toast.success('Operación realizada correctamente');
        } catch (error) {
            console.error(error);
            toast.error("Error al registrar operación");
        }
    };

    const openAudit = async () => {
        if (!boxData) { toast.error("Error: Caja no inicializada"); return; }
        const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', boxData.id).gt('quantity', 0);
        const initial: Record<number, number> = {};
        data?.forEach((d: any) => initial[Number(d.denomination)] = d.quantity);
        setBoxInventoryMap(initial);
        setBoxInventory(data || []);
        setCashModalMode('audit');
    };

    const openOut = async () => {
        if (!boxData) { toast.error("Error: Caja no inicializada"); return; }
        const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', boxData.id).gt('quantity', 0);
        const initial: Record<number, number> = {};
        data?.forEach((d: any) => initial[Number(d.denomination)] = d.quantity);
        setBoxInventoryMap(initial);
        setCashModalMode('out');
    };

    const monthsList = Array.from({ length: 6 }).map((_, i) => {
        const d = subMonths(new Date(), i);
        return {
            label: format(d, 'MMMM', { locale: es }),
            start: startOfMonth(d),
            end: endOfMonth(d),
            isCurrent: i === 0
        };
    });

    const handleMonthSelect = (m: { start: Date, end: Date }) => {
        setRangeStart(format(m.start, 'yyyy-MM-dd'));
        setRangeEnd(format(m.end, 'yyyy-MM-dd'));
        setFilterMode('range');
    };

    useEffect(() => {
        if (!shareMenuOpen) return;
        const onPointerDown = (e: PointerEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            if (target.closest('[data-movements-share-root="true"]')) return;
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

    const getCurrentFilterISO = () => {
        let startISO: string;
        let endISO: string;

        if (filterMode === 'single') {
            const d = parseLocalSafe(selectedDate);
            d.setHours(0, 0, 0, 0);
            startISO = d.toISOString();
            d.setHours(23, 59, 59, 999);
            endISO = d.toISOString();
            return { startISO, endISO };
        }

        if (!rangeStart || !rangeEnd) {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            startISO = d.toISOString();
            d.setHours(23, 59, 59, 999);
            endISO = d.toISOString();
            return { startISO, endISO };
        }

        const s = parseLocalSafe(rangeStart);
        s.setHours(0, 0, 0, 0);
        const e = parseLocalSafe(rangeEnd);
        e.setHours(23, 59, 59, 999);
        startISO = s.toISOString();
        endISO = e.toISOString();
        return { startISO, endISO };
    };

    const fetchAllFilteredMovementsForExport = async (): Promise<Movement[]> => {
        const { startISO, endISO } = getCurrentFilterISO();
        const out: Movement[] = [];
        const pageSize = 1000;
        for (let offset = 0; offset < 100_000; offset += pageSize) {
            const from = offset;
            const to = offset + pageSize - 1;
            const { data, error } = await supabase
                .from('v_treasury_movements_balance')
                .select('*')
                .gte('created_at', startISO)
                .lte('created_at', endISO)
                .neq('type', 'ADJUSTMENT')
                .neq('type', 'SWAP')
                .order('created_at', { ascending: dateSortDir === 'asc' })
                .range(from, to);

            if (error) throw error;
            const rows = data ?? [];
            const formatted: Movement[] = rows.map((m: any) => ({
                ...m,
                type: (m.type === 'IN' || m.type === 'CLOSE_ENTRY') ? 'income' :
                    (m.type === 'OUT' ? 'expense' : 'adjustment'),
                original_type: m.type,
                running_balance: parseNumericToCents(m.running_balance || 0) / 100
            }));
            out.push(...formatted);
            if (rows.length < pageSize) break;
        }
        return out;
    };

    const exportFilteredTableToExcel = async () => {
        if (shareBusy) return;
        setShareBusy('excel');
        try {
            const all = await fetchAllFilteredMovementsForExport();
            if (all.length === 0) {
                toast.error('No hay movimientos para exportar con el filtro actual.');
                return;
            }

            const rows = all.map((mov) => {
                const d = new Date(mov.created_at);
                const concept = mov.notes || (mov.type === 'income' ? 'Entrada manual' : mov.type === 'expense' ? 'Salida manual' : 'Arqueo de caja');
                const signedAmount = mov.type === 'income' ? mov.amount : mov.type === 'expense' ? -mov.amount : mov.amount;
                return {
                    Fecha: isNaN(d.getTime()) ? '' : format(d, 'dd/MM/yyyy', { locale: es }),
                    Hora: isNaN(d.getTime()) ? '' : format(d, 'HH:mm'),
                    Concepto: concept,
                    Importe: Number(signedAmount.toFixed(2)),
                    Saldo: Number((mov.running_balance ?? 0).toFixed(2)),
                };
            });

            const ws = XLSX.utils.json_to_sheet(rows, { header: ['Fecha', 'Hora', 'Concepto', 'Importe', 'Saldo'] });
            ws['!cols'] = [{ wch: 12 }, { wch: 6 }, { wch: 40 }, { wch: 10 }, { wch: 10 }];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');

            const now = new Date();
            const fileName = `movimientos_${format(now, 'yyyy-MM-dd_HHmm')}.xlsx`;
            XLSX.writeFile(wb, fileName, { compression: true });
            toast.success('Excel descargado.');
        } catch (e) {
            console.error(e);
            toast.error('Error exportando a Excel.');
        } finally {
            setShareBusy(null);
            setShareMenuOpen(false);
        }
    };

    const printFilteredTable = async () => {
        if (shareBusy) return;
        setShareBusy('print');
        try {
            const all = await fetchAllFilteredMovementsForExport();
            if (all.length === 0) {
                toast.error('No hay movimientos para imprimir con el filtro actual.');
                return;
            }

            const rowsHtml = all.map((mov) => {
                const d = new Date(mov.created_at);
                const dateStr = isNaN(d.getTime()) ? '' : format(d, 'dd/MM/yyyy', { locale: es });

                const concept = mov.notes || (mov.type === 'income' ? 'Entrada manual' : mov.type === 'expense' ? 'Salida manual' : 'Arqueo de caja');

                const signedAmount =
                    mov.type === 'income'
                        ? `+${mov.amount.toFixed(2)}€`
                        : mov.type === 'expense'
                            ? `-${mov.amount.toFixed(2)}€`
                            : `${mov.amount >= 0 ? '+' : ''}${mov.amount.toFixed(2)}€`;

                const saldo = `${(mov.running_balance ?? 0).toFixed(2)}€`;

                return `<tr>
  <td>${dateStr}</td>
  <td>${concept}</td>
  <td>${signedAmount}</td>
  <td>${saldo}</td>
</tr>`;
            }).join('\n');

            const html = `<table>
  <thead>
    <tr>
      <th>FECHA</th>
      <th>CONCEPTO</th>
      <th>IMPORTE</th>
      <th>SALDO</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml}
  </tbody>
</table>`;

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
    <title>Imprimir movimientos</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 24px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color: #111827; }
      table { width: 100%; border-collapse: collapse; }
      thead th {
        background: #36606F; color: white;
        text-transform: uppercase; letter-spacing: 0.12em;
        font-weight: 800; font-size: 11px;
        padding: 10px 12px; text-align: center;
      }
      tbody td {
        border-top: 1px solid #f4f4f5;
        padding: 10px 12px;
        font-size: 12px;
        vertical-align: top;
        text-align: center;
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
    ${html}
  </body>
</html>`);
            doc.close();

            // Dar un tick para que el iframe termine de maquetar antes del print (iOS/Safari es sensible).
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

    return (
        <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-8 pb-24 text-zinc-900">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* TARJETA GLOBAL INTEGRADA (TODO EN UN BLOQUE) */}
                <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden">

                    {/* CABECERA OSCURA INTEGRADA (TÍTULO + ACCIONES + FILTROS) */}
                    <div className="bg-[#36606F] p-4 md:p-6 space-y-6">
                        <div className="flex items-center justify-between gap-2 md:gap-4">
                            <div className="flex items-center gap-3 md:gap-4 flex-1">
                                <h1 className="text-lg md:text-4xl font-black text-white uppercase tracking-tight italic truncate">Caja Inicial</h1>
                            </div>

                            <div className="flex items-center justify-end gap-1 md:gap-4 shrink-0">
                                <button
                                    onClick={() => setCashModalMode('in')}
                                    className="bg-transparent hover:bg-white/10 px-1.5 md:px-3 py-1.5 rounded-xl flex flex-col items-center gap-1 transition-all active:scale-95 group"
                                >
                                    <div className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center bg-emerald-500 rounded-full shadow-md group-hover:scale-110 transition-transform">
                                        <Plus className="w-[14px] h-[14px] md:w-4 md:h-4 text-white" strokeWidth={3} />
                                    </div>
                                    <span className="text-[7px] md:text-[9px] font-black uppercase tracking-widest text-white/90">ENTRADA</span>
                                </button>
                                <button
                                    onClick={openOut}
                                    className="bg-transparent hover:bg-white/10 px-1.5 md:px-3 py-1.5 rounded-xl flex flex-col items-center gap-1 transition-all active:scale-95 group"
                                >
                                    <div className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center bg-rose-500 rounded-full shadow-md group-hover:scale-110 transition-transform">
                                        <Minus className="w-[14px] h-[14px] md:w-4 md:h-4 text-white" strokeWidth={3} />
                                    </div>
                                    <span className="text-[7px] md:text-[9px] font-black uppercase tracking-widest text-white/90">SALIDA</span>
                                </button>
                                <button
                                    onClick={openAudit}
                                    className="bg-transparent hover:bg-white/10 px-1.5 md:px-3 py-1.5 rounded-xl flex flex-col items-center gap-1 transition-all active:scale-95 group"
                                >
                                    <div className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center bg-orange-500 rounded-full shadow-md group-hover:scale-110 transition-transform">
                                        <RefreshCw className="w-3 h-3 md:w-4 md:h-4 text-white" strokeWidth={4} />
                                    </div>
                                    <span className="text-[7px] md:text-[9px] font-black uppercase tracking-widest text-white/90">ARQUEO</span>
                                </button>
                            </div>
                        </div>

                        {/* FILTROS INTEGRADOS EN CABECERA */}
                        {/* FILTROS INTEGRADOS EN CABECERA */}
                        <div className="relative flex items-center justify-center gap-2 pb-2">
                            {/* NAVEGADOR MENSUAL PRINCIPAL */}
                            <div className="flex items-center gap-0.5 md:gap-1">
                                <button onClick={handlePrevMonth} className="p-1 md:p-1.5 hover:bg-white/10 rounded-lg text-white transition-all outline-none">
                                    <ChevronLeft size={18} />
                                </button>
                                <button onClick={() => setIsTimeFilterOpen(true)} className="py-1 px-1 md:px-2 text-[11px] md:text-[13px] font-black text-white uppercase tracking-widest text-center transition-all outline-none whitespace-nowrap">
                                    {filterMode === 'range' && rangeStart && rangeEnd && isSameMonth(new Date(rangeStart), new Date(rangeEnd))
                                        ? format(new Date(rangeStart), 'MMMM yyyy', { locale: es })
                                        : 'SELECCIONAR MES'}
                                </button>
                                <button onClick={handleNextMonth} className="p-1 md:p-1.5 hover:bg-white/10 rounded-lg text-white transition-all outline-none">
                                    <ChevronRight size={18} />
                                </button>
                            </div>

                            {/* FILTRO UNIFICADO */}
                            <div className="absolute right-0 flex items-center gap-1.5 shrink-0 text-white" data-movements-share-root="true">
                                <TimeFilterButton
                                    onClick={() => setIsTimeFilterOpen(true)}
                                    buttonClassName={cn(
                                        "min-h-12 min-w-12 px-0 py-0",
                                        "rounded-xl border-0 bg-transparent hover:bg-transparent",
                                        "text-white/90 hover:text-white"
                                    )}
                                    hasActiveFilter={(() => {
                                        const d = new Date();
                                        const defS = format(startOfMonth(d), 'yyyy-MM-dd');
                                        const defE = format(endOfMonth(d), 'yyyy-MM-dd');
                                        const isDefault = filterMode === 'range' && rangeStart === defS && rangeEnd === defE;
                                        return !isDefault;
                                    })()}
                                    onClear={() => {
                                        const d = new Date();
                                        const s = startOfMonth(d);
                                        const e = endOfMonth(d);
                                        setFilterMode('range');
                                        setRangeStart(format(s, 'yyyy-MM-dd'));
                                        setRangeEnd(format(e, 'yyyy-MM-dd'));
                                    }}
                                />

                                <div className="relative shrink-0" data-movements-share-root="true">
                                    <button
                                        type="button"
                                        onClick={() => setShareMenuOpen(v => !v)}
                                        aria-label="Compartir"
                                        className={cn(
                                            "min-h-12 min-w-12",
                                            "rounded-xl border-0 bg-transparent hover:bg-transparent",
                                            "text-white/90 hover:text-white",
                                            "inline-flex items-center justify-center transition-all active:scale-95",
                                            shareBusy ? "opacity-60 pointer-events-none" : ""
                                        )}
                                    >
                                        <Share className="w-[18px] h-[18px] md:w-[18px] md:h-[18px]" strokeWidth={2.5} />
                                    </button>

                                    {shareMenuOpen && (
                                        <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white text-zinc-900 shadow-2xl border border-zinc-100 overflow-hidden">
                                            <button
                                                type="button"
                                                onClick={exportFilteredTableToExcel}
                                                className="w-full min-h-12 px-4 py-3 flex items-center justify-between hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
                                            >
                                                <span className="text-[11px] font-black uppercase tracking-widest">Exportar Excel</span>
                                                <Download className="w-4 h-4 text-zinc-500" />
                                            </button>
                                            <div className="h-px bg-zinc-100" />
                                            <button
                                                type="button"
                                                onClick={printFilteredTable}
                                                className="w-full min-h-12 px-4 py-3 flex items-center justify-between hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
                                            >
                                                <span className="text-[11px] font-black uppercase tracking-widest">Imprimir</span>
                                                <Printer className="w-4 h-4 text-zinc-500" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CUERPO BLANCO (RESUMEN + TABLA) */}
                    <div className="bg-white">
                        {/* RESUMEN: Grid 4x1 en móvil y escritorio */}
                        <div className="py-4 px-2 grid grid-cols-4 border-b border-zinc-50">
                            <div className="flex flex-col items-center justify-center text-center px-1">
                                <span className="text-[13px] md:text-2xl font-black text-emerald-500 line-clamp-1">{periodSummary.income > 0.005 ? `+${periodSummary.income.toFixed(2)}€` : " "}</span>
                                <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">INGRESOS</span>
                            </div>

                            <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100 px-1">
                                <span className="text-[13px] md:text-2xl font-black text-rose-500 line-clamp-1">{periodSummary.expense > 0.005 ? `-${periodSummary.expense.toFixed(2)}€` : " "}</span>
                                <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">GASTOS</span>
                            </div>

                            <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100 px-1">
                                <span className="text-[13px] md:text-2xl font-black text-[#36606F] line-clamp-1 tabular-nums">
                                    {physicalBalanceCents !== 0 ? formatCentsToEur(physicalBalanceCents) : " "}
                                </span>
                                <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">SALDO ACTUAL</span>
                            </div>

                            <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100 px-1">
                                <span className={cn(
                                    "text-[13px] md:text-2xl font-black line-clamp-1 flex items-center justify-center h-full",
                                    diffFromSaldoCents > 0 ? "text-blue-500" : diffFromSaldoCents < 0 ? "text-orange-500" : "text-emerald-500"
                                )}>
                                    {latestLedgerLoading ? (
                                        " "
                                    ) : isDiffZero ? (
                                        <Check className="w-4 h-4 md:w-6 md:h-6" strokeWidth={4} />
                                    ) : (
                                        formatCentsToEur(diffFromSaldoCents, { showPlus: true })
                                    )}
                                </span>
                                <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">DIFER. ACTUAL</span>
                            </div>
                        </div>

                        {/* LISTADO DE MOVIMIENTOS INTEGRADO */}
                        <div className="p-3 bg-white">
                            <div className="rounded-[1.5rem] overflow-hidden border border-zinc-100 shadow-xl">
                                <div className="w-full">
                                    <table ref={tableRef} className="w-full text-left font-sans">
                                        <thead className="bg-[#36606F] text-white">
                                            <tr className="text-[8px] md:text-[9px] font-black uppercase tracking-wider md:tracking-[0.15em] leading-none">
                                                <th className="px-1 md:px-6 py-1 md:py-2 w-[22%] md:w-[22%] text-center">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setDateSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                                                        }}
                                                        className={cn(
                                                            "w-full",
                                                            "inline-flex items-center justify-center gap-1.5",
                                                            "rounded-md hover:bg-white/10 active:bg-white/20 transition-colors",
                                                            "outline-none"
                                                        )}
                                                        aria-label="Ordenar por fecha"
                                                        title={dateSortDir === 'asc' ? 'Orden ascendente' : 'Orden descendente'}
                                                    >
                                                        <span>FECHA</span>
                                                        {dateSortDir === 'asc' ? (
                                                            <ArrowUp className="w-3.5 h-3.5 opacity-90" strokeWidth={3} />
                                                        ) : (
                                                            <ArrowDown className="w-3.5 h-3.5 opacity-90" strokeWidth={3} />
                                                        )}
                                                    </button>
                                                </th>
                                                <th className="px-1 md:px-6 py-1 md:py-2 w-[38%] md:w-[38%] text-center">CONCEPTO</th>
                                                <th className="px-0.5 md:px-6 py-1 md:py-2 text-center w-[20%] md:w-[20%]">IMPORTE</th>
                                                <th className="px-1 md:px-8 py-1 md:py-2 text-center w-[20%] md:w-[20%]">SALDO</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-50/50">
                                            {loading ? (
                                                <tr>
                                                    <td colSpan={4} className="py-20">
                                                        <div className="flex items-center justify-center">
                                                            <LoadingSpinner size="lg" />
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : movements.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="py-20 text-center">
                                                        <div className="flex flex-col items-center justify-center gap-2 opacity-20">
                                                            <PiggyBank size={32} />
                                                            <span className="text-[10px] font-black uppercase tracking-widest">Sin movimientos</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : (
                                                movements.map((mov) => {
                                                    const date = new Date(mov.created_at);
                                                    return (
                                                        <tr
                                                            key={mov.id}
                                                            className="group hover:bg-zinc-50/80 transition-colors cursor-pointer active:bg-zinc-100"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setSelectedMovement(mov);
                                                            }}
                                                        >
                                                            <td className="px-1 md:px-6 py-2 md:py-3">
                                                                <div className="flex flex-col">
                                                                    <span className="text-[10px] md:text-[13px] font-black text-zinc-900 italic">
                                                                        {isNaN(date.getTime()) ? (
                                                                            <span className="text-rose-500 text-[10px]">Fecha Inválida</span>
                                                                        ) : (
                                                                            <>
                                                                                <span className="md:inline hidden">{format(date, 'eeee d MMM', { locale: es })}</span>
                                                                                <span className="md:hidden inline">{format(date, 'd MMM', { locale: es })}</span>
                                                                            </>
                                                                        )}
                                                                    </span>
                                                                    <span className="text-[8px] md:text-[10px] font-bold text-zinc-400 font-mono">
                                                                        {isNaN(date.getTime()) ? '--:--' : format(date, 'HH:mm')}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-1 md:px-6 py-2 md:py-3">
                                                                <div className="flex items-center gap-1 md:gap-3">
                                                                    <div className={cn(
                                                                        "w-4 h-4 md:w-8 md:h-8 rounded-md md:rounded-lg flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-110",
                                                                        mov.type === 'income' ? "bg-emerald-50 text-emerald-500" :
                                                                            mov.type === 'expense' ? "bg-rose-50 text-rose-500" :
                                                                                "bg-orange-50 text-orange-500"
                                                                    )}>
                                                                        {mov.type === 'income' ? <Plus size={8} className="md:size-[16px]" strokeWidth={3} /> :
                                                                            mov.type === 'expense' ? <ArrowUp size={8} className="md:size-[16px]" strokeWidth={3} /> :
                                                                                <RefreshCw size={8} className="md:size-[14px]" strokeWidth={3} />}
                                                                    </div>
                                                                    <span className="text-[9px] md:text-[12px] font-bold text-zinc-500 uppercase tracking-tight truncate max-w-[140px] md:max-w-[200px]">
                                                                        {mov.notes || (mov.type === 'income' ? 'Entrada manual' : mov.type === 'expense' ? 'Salida manual' : 'Arqueo de caja')}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-0.5 md:px-6 py-2 md:py-3 text-center">
                                                                <span className={cn(
                                                                    "text-[10px] md:text-[15px] font-black tabular-nums",
                                                                    mov.type === 'income' ? "text-emerald-500" :
                                                                        mov.type === 'expense' ? "text-rose-500" :
                                                                            mov.amount > 0 ? "text-blue-500" : "text-orange-500"
                                                                )}>
                                                                    {mov.type === 'income' ? '+' : mov.type === 'expense' ? '-' : (mov.amount > 0 ? '+' : '')}{mov.amount.toFixed(2)}€
                                                                </span>
                                                            </td>
                                                            <td className="px-1 md:px-8 py-2 md:py-3 text-right">
                                                                <span className="text-[10px] md:text-[15px] font-black text-zinc-900 tabular-nums">
                                                                    {mov.running_balance.toFixed(2)}€
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>

                                    {/* SCROLL SENSOR */}
                                    {hasMore && movements.length > 0 && (
                                        <div
                                            className="py-6 flex justify-center"
                                            ref={(el) => {
                                                if (!el) return;
                                                const observer = new IntersectionObserver((entries) => {
                                                    if (entries[0].isIntersecting && !isLoadingMore && !loading) {
                                                        loadMore();
                                                        observer.disconnect();
                                                    }
                                                });
                                                observer.observe(el);
                                            }}
                                        >
                                            <LoadingSpinner size="sm" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* MODALES EXTERNOS */}
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
                                <button onClick={() => setPickerYear(pickerYear - 1)} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors"><ChevronLeft size={20} className="text-zinc-400" /></button>
                                <span className="font-black text-xl text-zinc-900 tracking-tighter">{pickerYear}</span>
                                <button onClick={() => setPickerYear(pickerYear + 1)} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors"><ChevronRight size={20} className="text-zinc-400" /></button>
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
                                                isSelected ? "bg-zinc-900 border-zinc-900 text-white shadow-lg scale-105" : "bg-zinc-50 border-transparent text-zinc-400 hover:border-zinc-200 hover:text-zinc-900"
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

            {cashModalMode !== 'none' && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[120] p-4 animate-in fade-in duration-300" onClick={() => setCashModalMode('none')}>
                    <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
                        {cashModalMode === 'inventory' ? (
                            <BoxInventoryView boxName={boxData?.name || 'Caja'} inventory={boxInventory} onBack={() => setCashModalMode('none')} />
                        ) : (
                            <CashDenominationForm
                                key={cashModalMode + (boxData?.id || '')}
                                type={cashModalMode === 'audit' ? 'audit' : (cashModalMode === 'in' ? 'in' : 'out')}
                                boxName={boxData?.name || 'Caja'}
                                onSubmit={handleCashTransaction}
                                onCancel={() => setCashModalMode('none')}
                                initialCounts={cashModalMode === 'audit' ? boxInventoryMap : {}}
                                availableStock={boxInventoryMap}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Portal a document.body: evita stacking context / overflow del layout; z-index en el propio modal (> AIGlobalWrapper) */}
            {selectedMovement &&
                typeof document !== 'undefined' &&
                createPortal(
                    <MovementDetailModal
                        movement={selectedMovement}
                        onClose={() => setSelectedMovement(null)}
                        onAfterMutation={refreshMovementsAfterMutation}
                    />,
                    document.body
                )}

            {isClosingModalOpen && (
                <CashClosingModal
                    isOpen={isClosingModalOpen}
                    onClose={() => setIsClosingModalOpen(false)}
                    onSuccess={async () => {
                        setIsClosingModalOpen(false);
                        await fetchCurrentBoxStatus();
                        await fetchLatestLedgerSaldo();
                        await fetchFilteredMovements();
                        toast.success("Cierre realizado correctamente");
                    }}
                />
            )}
        </div>
    );
}