'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from "@/utils/supabase/client";
import { X, Calendar, Minus, Plus } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { sendClosingNotification } from '@/app/actions/notifications';
import { uploadCashClosingPhotoAction } from '@/app/actions/cash-closing-photos';
import {
    weatherLabelFromId,
    weatherIdFromLabel,
    type ClosingWeatherId,
} from '@/lib/cash-closing-weather';
import {
    ClosingStepRow,
    ClosingSummaryRow,
    ClosingReadonlyValue,
    ClosingPetrolInput,
    ClosingPetrolInputWithAdjust,
    ClosingWeatherPicker,
    ClosingPhotoField,
} from '@/components/cash-closing/ClosingStep1Parts';

// export const FIXED_CASH_FUND = 100; // ELIMINADO: Se simplifica la lógica sin fondo fijo
export const BILLS = [100, 50, 20, 10, 5];
export const COINS = [2, 1, 0.50, 0.20, 0.10, 0.05, 0.02, 0.01];

function parseDateTimeLocal(value: string): Date {
    // TIMEZONE IMMUNITY: no Date('YYYY-MM-DD...') parsing.
    // datetime-local comes as "YYYY-MM-DDTHH:mm"
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
}

function formatDateTimeLocalInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const CURRENCY_IMAGES: Record<number, string> = {
    100: '/currency/100e-Photoroom.png',
    50: '/currency/50e-Photoroom.png',
    20: '/currency/20-Photoroom.png',
    10: '/currency/10e-Photoroom.png',
    5: '/currency/5eur-Photoroom.png',
    2: '/currency/2eur-Photoroom.png',
    1: '/currency/1eur-Photoroom.png',
    0.50: '/currency/50ct-Photoroom.png',
    0.20: '/currency/20ct-Photoroom.png',
    0.10: '/currency/10ct-Photoroom.png',
    0.05: '/currency/5ct-Photoroom.png',
    0.02: '/currency/2ct-Photoroom.png',
    0.01: '/currency/1ct-Photoroom.png',
};

type ClosingStep = 'tpv_data' | 'count' | 'summary';

interface CashClosingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    initialTotalSales?: number;
    initialTicketsCount?: number;
}

export default function CashClosingModal({ isOpen, onClose, onSuccess, initialTotalSales = 0, initialTicketsCount = 0 }: CashClosingModalProps) {
    const supabase = createClient();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<ClosingStep>('tpv_data');
    const [calculatorOpen, setCalculatorOpen] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);

    // Fetch user on mount
    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            setUserId(user?.id || null);
        });
    }, []);

    // 1. STATE: TPVs
    const [tpvData, setTpvData] = useState({
        totalSales: initialTotalSales || 0,
        cardSales: 0,
        pendingSales: 0,
        debtRecovered: 0,
        ticketsCount: initialTicketsCount || 0,
    });

    const [weatherId, setWeatherId] = useState<ClosingWeatherId | null>(null);

    // 2. STATE: COUNT
    const [counts, setCounts] = useState<Record<string, number>>({});

    // 3. STATE: OPENING CASH
    const [openingCash, setOpeningCash] = useState(0);

    // 4. STATE: DATE/TIME (HIDDEN EDIT)
    const [selectedDateTime, setSelectedDateTime] = useState(() => formatDateTimeLocalInput(new Date()));
    const datePickerRef = useRef<HTMLInputElement>(null);
    const isInitialized = useRef(false);
    const lastDate = useRef<string | null>(null);

    // 5. STATE: CLOSING PHOTOS (no se persisten en localStorage draft)
    const [dataphonePhotoFile, setDataphonePhotoFile] = useState<File | null>(null);
    const [bdpTicketPhotoFile, setBdpTicketPhotoFile] = useState<File | null>(null);
    const [dataphonePreviewUrl, setDataphonePreviewUrl] = useState<string | null>(null);
    const [bdpTicketPreviewUrl, setBdpTicketPreviewUrl] = useState<string | null>(null);

    const setDataphonePhoto = (file: File | null) => {
        setDataphonePhotoFile(file);
    };

    const setBdpTicketPhoto = (file: File | null) => {
        setBdpTicketPhotoFile(file);
    };

    const resetClosingPhotos = () => {
        setDataphonePhotoFile(null);
        setBdpTicketPhotoFile(null);
    };

    const photosReady = Boolean(dataphonePhotoFile && bdpTicketPhotoFile);

    // Una URL blob por archivo; al revocar solo la que creó este efecto (evita romper la otra miniatura)
    useEffect(() => {
        if (!dataphonePhotoFile) {
            setDataphonePreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(dataphonePhotoFile);
        setDataphonePreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [dataphonePhotoFile]);

    useEffect(() => {
        if (!bdpTicketPhotoFile) {
            setBdpTicketPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(bdpTicketPhotoFile);
        setBdpTicketPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [bdpTicketPhotoFile]);

    useEffect(() => {
        if (!isOpen) {
            // No borramos fotos al salir: deben persistir si reabres el proceso.
            return;
        }
        // Clima: siempre sin selección por defecto al abrir
        setWeatherId(null);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            isInitialized.current = false;
            lastDate.current = null;
            return;
        }

        if (userId) {
            const dateObj = parseDateTimeLocal(selectedDateTime);
            const dateStr = format(dateObj, 'yyyy-MM-dd');

            if (!isInitialized.current) {
                // 1. INITIAL LOAD (Only once per open)
                isInitialized.current = true;
                lastDate.current = dateStr;

                // Borrador: restaura campos manuales; ventas y tickets se sincronizan siempre después
                try {
                    const draft = localStorage.getItem(`cash_closing_draft_${userId}`);
                    if (draft) {
                        const parsed = JSON.parse(draft);
                        if (parsed.tpvData) {
                            const { weather: _legacyWeather, ...rest } = parsed.tpvData as {
                                weather?: string;
                                cardSales?: number;
                                pendingSales?: number;
                                debtRecovered?: number;
                            };
                            setTpvData((prev) => ({
                                ...prev,
                                cardSales: rest.cardSales ?? 0,
                                pendingSales: rest.pendingSales ?? 0,
                                debtRecovered: rest.debtRecovered ?? 0,
                            }));
                            // Clima: siempre sin selección por defecto (no restaurar desde draft)
                        }
                        if (parsed.counts) setCounts(parsed.counts);
                    }
                } catch (e) {
                    console.error("Error reading draft from localStorage", e);
                }

                void applyVentasAndTicketsAutoFill();
            } else if (dateStr !== lastDate.current) {
                // 2. DATE CHANGED MANUALLY (Subsequent triggers)
                lastDate.current = dateStr;
                void applyVentasAndTicketsAutoFill();
            }
        }
    }, [isOpen, userId, selectedDateTime]);

    // AUTO-SAVE DRAFT
    useEffect(() => {
        if (isInitialized.current && userId && (Object.keys(counts).length > 0 || tpvData.cardSales > 0 || tpvData.pendingSales > 0 || tpvData.debtRecovered > 0)) {
            const draftKey = `cash_closing_draft_${userId}`;
            localStorage.setItem(draftKey, JSON.stringify({ tpvData, counts, weatherId }));
        }
    }, [tpvData, counts, weatherId, userId]);

    function roundMoney(n: number): number {
        return Math.round(n * 100) / 100;
    }

    /** Autorellena desde RPC get_closing_sales_breakdown (tickets + cobros deuda 107). */
    async function applyVentasAndTicketsAutoFill() {
        const dateObj = parseDateTimeLocal(selectedDateTime);
        const dateStr = format(dateObj, 'yyyy-MM-dd');

        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('get_closing_sales_breakdown', {
                p_date: dateStr,
            });

            if (error) throw error;

            const row = (data ?? {}) as {
                total_bruto?: number
                total_efectivo?: number
                total_tarjeta?: number
                total_pendiente?: number
                total_cobros_deuda?: number
                recuento_tickets?: number
            };

            const totalBruto = Math.max(0, roundMoney(Number(row.total_bruto) || 0));
            const totalEfectivo = Math.max(0, roundMoney(Number(row.total_efectivo) || 0));
            const totalTarjeta = Math.max(0, roundMoney(Number(row.total_tarjeta) || 0));
            const totalPendiente = Math.max(0, roundMoney(Number(row.total_pendiente) || 0));
            const totalCobrosDeuda = Math.max(0, roundMoney(Number(row.total_cobros_deuda) || 0));
            const recuento = Math.max(0, Number(row.recuento_tickets) || 0);

            setTpvData((prev) => ({
                ...prev,
                totalSales: totalBruto,
                ticketsCount: recuento,
                cardSales: totalTarjeta,
                pendingSales: totalPendiente,
                debtRecovered: totalCobrosDeuda,
            }));

            if (totalBruto === 0 && totalEfectivo === 0 && totalTarjeta === 0 && recuento === 0) {
                toast.message('Sin tickets BDP para esta fecha en Supabase');
            }
        } catch (error) {
            console.error('Error fetching closing breakdown:', error);
            toast.error('Error al sincronizar datos de cierre desde BDP');
        } finally {
            setLoading(false);
        }
    }

    // --- CALCULATIONS ---
    const totalSalesGross = tpvData.totalSales;
    const cashSalesToday = Math.max(0, roundMoney(tpvData.totalSales - tpvData.cardSales - tpvData.pendingSales));
    const expectedCash = roundMoney(cashSalesToday + tpvData.debtRecovered);
    const totalCounted = Object.entries(counts).reduce((sum, [val, qty]) => sum + (parseFloat(val) * qty), 0);
    const difference = totalCounted - expectedCash;
    const cashToWithdraw = totalCounted; // Se retira TODO el efectivo contado
    const cashLeft = 0; // No queda nada en caja por defecto

    // --- HANDLERS ---
    const updateCount = (value: number, qty: string) => {
        const quantity = parseInt(qty) || 0;
        setCounts(prev => ({ ...prev, [value]: quantity }));
    };

    const handleAdjustTpv = (field: keyof typeof tpvData, delta: number) => {
        setTpvData(prev => {
            const val = typeof prev[field] === 'number' ? prev[field] as number : 0;
            return { ...prev, [field]: Math.max(0, val + delta) };
        });
    };

    const handleAdjustCount = (value: number, delta: number) => {
        setCounts(prev => ({
            ...prev,
            [value]: (prev[value] || 0) + delta
        }));
    };

    const ensureWeatherSelected = () => {
        if (!weatherId) {
            toast.error('Selecciona el clima');
            return false;
        }
        return true;
    };

    const ensurePhotosAttached = () => {
        if (!bdpTicketPhotoFile) {
            toast.error('Adjunta el informe TPV en la fila Informe TPV');
            return false;
        }
        if (!dataphonePhotoFile) {
            toast.error('Adjunta los totales del datáfono en la fila Totales datáfono');
            return false;
        }
        return true;
    };

    const handleAdvanceStep = () => {
        if (step === 'tpv_data') {
            if (!ensureWeatherSelected()) return;
            if (!ensurePhotosAttached()) return;
            setStep('count');
            return;
        }
        if (step === 'count') {
            setStep('summary');
            return;
        }
        void handleFinalizeClose();
    };

    const handleFinalizeClose = async () => {
        if (!ensurePhotosAttached()) return;
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const chosenDate = parseDateTimeLocal(selectedDateTime);
            const closingDateStr = format(chosenDate, "yyyy-MM-dd");
            const closingBatchId = crypto.randomUUID();

            const uploadOne = async (file: File, kind: 'dataphone' | 'bdp-ticket') => {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('closing_date', closingDateStr);
                formData.append('closing_id', closingBatchId);
                formData.append('kind', kind);
                const result = await uploadCashClosingPhotoAction(formData);
                if (!result.success) throw new Error(result.error);
                return result.path;
            };

            const [dataphonePath, bdpTicketPath] = await Promise.all([
                uploadOne(dataphonePhotoFile!, 'dataphone'),
                uploadOne(bdpTicketPhotoFile!, 'bdp-ticket'),
            ]);

            // Format movement name for treasury: "Cierre Sab 14 Feb"
            const movementName = `Cierre ${format(chosenDate, "EEE d MMM", { locale: es })}`;

            // Calculate Net Sales (Excluding 10% IVA as expected by Dashboard)
            const netSalesCalculated = totalSalesGross / 1.10;

            // Prepare breakdown for the new unified treasury logic
            const breakdownJson: Record<string, number> = {};
            Object.entries(counts).forEach(([denomination, count]) => {
                if (count > 0) {
                    breakdownJson[denomination] = count;
                }
            });

            const { data: closing, error } = await supabase
                .from('cash_closings')
                .insert({
                    closed_at: chosenDate.toISOString(),
                    closed_by: user?.id,
                    closing_date: format(chosenDate, "yyyy-MM-dd"),
                    tpv_sales: totalSalesGross,
                    net_sales: netSalesCalculated,
                    sales_card: tpvData.cardSales,
                    sales_pending: tpvData.pendingSales,
                    debt_recovered: tpvData.debtRecovered,
                    card_payments: tpvData.cardSales,
                    pending_payments: tpvData.pendingSales,
                    collections: tpvData.debtRecovered,
                    cash_expected: expectedCash,
                    cash_counted: totalCounted,
                    difference: difference,
                    cash_withdrawn: cashToWithdraw,
                    cash_left: cashLeft,
                    weather: weatherId ? weatherLabelFromId(weatherId) : null,
                    tickets_count: tpvData.ticketsCount,
                    notes: movementName, // This will be the name in treasury log
                    status: 'closed',
                    breakdown: breakdownJson,
                    dataphone_totals_photo_path: dataphonePath,
                    bdp_closing_ticket_photo_path: bdpTicketPath,
                })
                .select()
                .single();

            if (error) {
                console.error("Error inserting closing:", error);
                throw new Error(`Error al guardar el cierre: ${error.message}`);
            }

            toast.success("Cierre completado con éxito");

            // Enviar notificación a los managers
            const avgTicket = tpvData.ticketsCount > 0 ? (totalSalesGross / tpvData.ticketsCount) : 0;
            const closingNotifyDateStr = format(chosenDate, "EEEE dd/MM", { locale: es });
            sendClosingNotification({
                dateStr: closingNotifyDateStr,
                totalSales: totalSalesGross,
                netSales: netSalesCalculated,
                avgTicket: avgTicket
            }).catch(err => console.error("Error sending closing notify:", err));

            if (onSuccess) await onSuccess();
            
            // Clear draft and reset local state only on success
            if (userId) {
                localStorage.removeItem(`cash_closing_draft_${userId}`);
            }
            setTpvData({
                totalSales: 0, cardSales: 0, pendingSales: 0,
                debtRecovered: 0, ticketsCount: 0,
            });
            setWeatherId(null);
            setCounts({});
            resetClosingPhotos();
            setStep('tpv_data');

            onClose();
        } catch (error: any) {
            console.error("FinalizeClose error:", error);
            toast.error(error.message || "Error desconocido al cerrar caja");
        } finally {
            setLoading(false);
        }
    };

    const renderDenominationItem = (value: number) => (
        <div key={value} className="flex flex-col items-center gap-1.5 group transition-all">
            <div className="h-11 sm:h-14 w-full flex items-center justify-center transition-transform group-hover:scale-110">
                <Image
                    src={CURRENCY_IMAGES[value]}
                    alt={value + "€"}
                    width={140}
                    height={140}
                    className={cn(
                        "h-full w-auto object-contain",
                        value >= 1 ? "drop-shadow-lg" : "drop-shadow-md",
                    )}
                />
            </div>
            <div className="text-center w-full">
                <span className="font-black text-gray-500 text-[9px] uppercase tracking-widest block mb-0.5">
                    {value < 1 ? (value * 100).toFixed(0) + "c" : value + "€"}
                </span>
                <div className="flex items-center justify-between w-full h-10 bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm transition-all focus-within:ring-2 focus-within:ring-offset-1 focus-within:border-[#5B8FB9]/40 focus-within:ring-[#5B8FB9]/20">
                    <button type="button" onClick={() => handleAdjustCount(value, -1)} className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100 transition-colors shrink-0"><Minus size={14} strokeWidth={3} /></button>
                    <input type="number" placeholder=""
                        className="flex-1 w-0 h-full bg-transparent text-center font-black text-zinc-700 outline-none p-0 text-[10px] tracking-tighter tabular-nums focus:bg-blue-50/20 transition-colors"
                        value={counts[value] || ''} onChange={(e) => updateCount(value, e.target.value)} />
                    <button type="button" onClick={() => handleAdjustCount(value, 1)} className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100 transition-colors shrink-0"><Plus size={14} strokeWidth={3} /></button>
                </div>
            </div>
        </div>
    );

    const lastCoin = COINS[COINS.length - 1];

    if (!isOpen) return null;

    const blockDashboardSwipe = (e: React.TouchEvent) => {
        e.stopPropagation();
    };

    return (
        <div
            className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onTouchStart={blockDashboardSwipe}
            onTouchMove={blockDashboardSwipe}
            onTouchEnd={blockDashboardSwipe}
        >
            <div
                className={cn(
                    "bg-white w-full max-w-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 rounded-2xl",
                    "max-h-[calc(100dvh-2rem)]",
                    "shadow-2xl shadow-black/20 border border-white/10"
                )}
                onClick={e => e.stopPropagation()}
                onTouchStart={blockDashboardSwipe}
                onTouchMove={blockDashboardSwipe}
                onTouchEnd={blockDashboardSwipe}
            >

                {/* Header: fecha sin tarjeta/marco, flota sobre cabecera */}
                <div className="bg-[#36606F] px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between text-white relative shrink-0">
                    <div className="flex flex-col">
                        <button
                            type="button"
                            className="relative flex items-center gap-2 cursor-pointer text-left outline-none border-0 bg-transparent p-0 hover:opacity-90 transition-opacity min-h-[48px] min-w-[48px]"
                            onClick={() => {
                                const el = datePickerRef.current;
                                if (!el) return;
                                // Try native picker (Chrome), fallback to focus/click for others.
                                const picker = el as HTMLInputElement & { showPicker?: () => void };
                                if (typeof picker.showPicker === 'function') picker.showPicker();
                                else { el.focus(); el.click(); }
                            }}
                        >
                            <Calendar size={16} className="text-white/80" aria-hidden />
                            <span className="text-[12px] sm:text-sm font-black uppercase tracking-wide text-white">
                                {format(parseDateTimeLocal(selectedDateTime), "eeee d 'de' MMMM, HH:mm", { locale: es })}
                            </span>
                            <input
                                ref={datePickerRef}
                                type="datetime-local"
                                value={selectedDateTime}
                                onChange={(e) => setSelectedDateTime(e.target.value)}
                                className={cn(
                                    // Overlay invisible but clickable/editable to ensure consistent behavior across browsers.
                                    "absolute inset-0 opacity-0 cursor-pointer",
                                    "min-h-[48px] min-w-[48px]"
                                )}
                            />
                        </button>
                        <div className="flex items-center gap-3 mt-1">
                            <div className={cn("text-[10px] font-black uppercase tracking-widest transition-colors", step === 'tpv_data' ? 'text-white' : 'text-white/40')}>1. Datos</div>
                            <div className={cn("text-[10px] font-black uppercase tracking-widest transition-colors", step === 'count' ? 'text-white' : 'text-white/40')}>2. Arqueo</div>
                            <div className={cn("text-[10px] font-black uppercase tracking-widest transition-colors", step === 'summary' ? 'text-white' : 'text-white/40')}>3. Resumen</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {(step === 'tpv_data' || step === 'count') && (
                            <span className="w-10 h-10 min-h-[48px] min-w-[48px]" aria-hidden />
                        )}
                        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-rose-500 rounded-xl hover:bg-rose-600 transition-all text-white active:scale-90 shadow-md shadow-rose-900/20 min-h-[48px] min-w-[48px]">
                            <X size={20} strokeWidth={3} />
                        </button>
                    </div>
                </div>
                <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
                {(step === 'tpv_data' || step === 'count') && (
                    <FloatingCalculatorFab isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />
                )}

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* STEP 1: SALES DATA */}
                    {step === 'tpv_data' && (
                        <div className="space-y-5 p-4 sm:p-6">
                            <ClosingWeatherPicker
                                selectedId={weatherId}
                                onSelect={setWeatherId}
                            />

                            <ClosingStepRow title="Ventas">
                                <ClosingPetrolInput
                                    value={tpvData.totalSales}
                                    onChange={(next) => setTpvData({ ...tpvData, totalSales: next })}
                                    showEuro
                                    inputClassName="text-base"
                                />
                            </ClosingStepRow>

                            <ClosingStepRow title="Nº tickets">
                                <ClosingPetrolInputWithAdjust
                                    value={tpvData.ticketsCount}
                                    onChange={(next) => setTpvData({ ...tpvData, ticketsCount: next })}
                                    onAdjust={(delta) => handleAdjustTpv('ticketsCount', delta)}
                                    parseValue={(raw) => parseInt(raw, 10) || 0}
                                />
                            </ClosingStepRow>

                            <ClosingStepRow title="Informe tpv">
                                <ClosingPhotoField
                                    inputId="closing-photo-bdp-ticket"
                                    previewUrl={bdpTicketPreviewUrl}
                                    ariaLabel="Informe TPV"
                                    onSelect={setBdpTicketPhoto}
                                    onClear={() => setBdpTicketPhoto(null)}
                                />
                            </ClosingStepRow>

                            <ClosingStepRow title="Tarjeta">
                                <ClosingPetrolInput
                                    value={tpvData.cardSales}
                                    onChange={(next) => setTpvData({ ...tpvData, cardSales: next })}
                                    showEuro
                                />
                            </ClosingStepRow>

                            <ClosingStepRow title="Totales datáfono">
                                <ClosingPhotoField
                                    inputId="closing-photo-dataphone"
                                    previewUrl={dataphonePreviewUrl}
                                    ariaLabel="Totales datáfono"
                                    onSelect={setDataphonePhoto}
                                    onClear={() => setDataphonePhoto(null)}
                                />
                            </ClosingStepRow>
                        </div>
                    )}

                    {/* STEP 2: COUNT */}
                    {step === 'count' && (
                        <div className="flex flex-col h-full overflow-hidden">
                            <div className="p-4 sm:p-6 bg-gray-50 border-b flex justify-between items-center shrink-0">
                                <div>
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Arqueo en Caja</h3>
                                    <span className="text-3xl font-black text-[#5B8FB9]">{totalCounted.toFixed(2)}€</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] font-black text-gray-400 uppercase">Esperado</span>
                                    <div className="text-lg font-bold text-gray-500">{expectedCash > 0.005 ? `${expectedCash.toFixed(2)}€` : " "}</div>
                                </div>
                            </div>
                            <div className="p-3 sm:p-4 flex flex-col gap-4 pb-4">
                                <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-y-5 sm:gap-y-6 gap-x-3 sm:gap-x-4">
                                    {BILLS.map((bill) => renderDenominationItem(bill))}
                                    {COINS.slice(0, -1).map((coin) => renderDenominationItem(coin))}
                                    {renderDenominationItem(lastCoin)}
                                    <div className="col-span-3 sm:col-span-5 lg:col-span-7 flex items-end gap-2 self-end pb-0.5">
                                        <button
                                            type="button"
                                            onClick={() => setStep('tpv_data')}
                                            className="h-10 shrink-0 rounded-xl px-3 font-black text-[9px] uppercase tracking-widest text-gray-400 transition-colors hover:bg-white hover:text-gray-600 active:bg-white/80 sm:px-4 sm:text-[10px]"
                                        >
                                            Atrás
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleAdvanceStep}
                                            disabled={loading}
                                            className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl bg-emerald-500 px-2 text-[9px] font-black uppercase tracking-widest text-white transition-all active:scale-[0.98] sm:text-[10px]"
                                        >
                                            {loading ? <LoadingSpinner size="sm" className="text-white" /> : 'Ver Resumen'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: SUMMARY */}
                    {step === 'summary' && (
                        <div className="space-y-5 p-4 sm:p-6 animate-in slide-in-from-bottom-4 duration-300">
                            <ClosingSummaryRow title="Ventas">
                                <ClosingReadonlyValue value={tpvData.totalSales} showEuro />
                            </ClosingSummaryRow>

                            <ClosingSummaryRow title="Tarjeta">
                                <ClosingReadonlyValue value={tpvData.cardSales} showEuro />
                            </ClosingSummaryRow>

                            <ClosingSummaryRow title="Efectivo">
                                <ClosingReadonlyValue value={totalCounted} showEuro />
                            </ClosingSummaryRow>

                            <ClosingSummaryRow title="Pendiente">
                                <ClosingReadonlyValue value={tpvData.pendingSales} showEuro />
                            </ClosingSummaryRow>

                            <ClosingSummaryRow title="Cobros">
                                <ClosingReadonlyValue value={tpvData.debtRecovered} showEuro />
                            </ClosingSummaryRow>

                            <ClosingSummaryRow title="Descuadre">
                                <ClosingReadonlyValue value={difference} variant="difference" />
                            </ClosingSummaryRow>
                        </div>
                    )}
                </div>

                {/* Footer: paso 2 integra botones en la fila del 1c */}
                {step !== 'count' && (
                    <div className="p-3 sm:p-4 bg-gray-50 border-t flex gap-3 sm:gap-4 shrink-0">
                        {step === 'summary' && (
                            <button
                                type="button"
                                onClick={() => setStep('count')}
                                className="px-4 sm:px-6 min-h-[48px] font-black text-gray-400 uppercase tracking-widest text-xs hover:text-gray-600 transition-colors rounded-xl hover:bg-white/60 active:bg-white/80"
                            >
                                Atrás
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleAdvanceStep}
                            disabled={loading || (step === 'summary' && !photosReady)}
                            className={cn(
                                "flex-1 min-h-[48px] h-14 rounded-2xl flex items-center justify-center gap-3 text-white font-black uppercase tracking-widest transition-all active:scale-[0.98]",
                                step === 'summary' || step === 'tpv_data'
                                    ? 'bg-emerald-500'
                                    : 'bg-[#5B8FB9]'
                            )}
                        >
                            {loading ? <LoadingSpinner size="sm" className="text-white" /> : (
                                step === 'summary' ? 'Confirmar Cierre' : 'Siguiente'
                            )}
                        </button>
                    </div>
                )}
            </div>

        </div >
    );
}
