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
    ClosingPetrolInput,
    ClosingPetrolInputWithAdjust,
    ClosingWeatherPicker,
    ClosingPhotoAttach,
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

    const revokePreviewUrl = (url: string | null) => {
        if (url) URL.revokeObjectURL(url);
    };

    const setDataphonePhoto = (file: File | null) => {
        setDataphonePreviewUrl((prev) => {
            revokePreviewUrl(prev);
            return file ? URL.createObjectURL(file) : null;
        });
        setDataphonePhotoFile(file);
    };

    const setBdpTicketPhoto = (file: File | null) => {
        setBdpTicketPreviewUrl((prev) => {
            revokePreviewUrl(prev);
            return file ? URL.createObjectURL(file) : null;
        });
        setBdpTicketPhotoFile(file);
    };

    const resetClosingPhotos = () => {
        setDataphonePhoto(null);
        setBdpTicketPhoto(null);
    };

    const photosReady = Boolean(dataphonePhotoFile && bdpTicketPhotoFile);

    useEffect(() => {
        return () => {
            revokePreviewUrl(dataphonePreviewUrl);
            revokePreviewUrl(bdpTicketPreviewUrl);
        };
    }, [dataphonePreviewUrl, bdpTicketPreviewUrl]);

    useEffect(() => {
        if (!isOpen) {
            resetClosingPhotos();
            setWeatherId(null);
        }
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

                // Priority: Try to load draft from localStorage
                try {
                    const draft = localStorage.getItem(`cash_closing_draft_${userId}`);
                    if (draft) {
                        const parsed = JSON.parse(draft);
                        if (parsed.tpvData) {
                            const { weather: legacyWeather, ...rest } = parsed.tpvData as {
                                weather?: string;
                                totalSales?: number;
                                cardSales?: number;
                                pendingSales?: number;
                                debtRecovered?: number;
                                ticketsCount?: number;
                            };
                            setTpvData({
                                totalSales: rest.totalSales ?? 0,
                                cardSales: rest.cardSales ?? 0,
                                pendingSales: rest.pendingSales ?? 0,
                                debtRecovered: rest.debtRecovered ?? 0,
                                ticketsCount: rest.ticketsCount ?? 0,
                            });
                            if (parsed.weatherId) {
                                setWeatherId(parsed.weatherId as ClosingWeatherId);
                            } else if (legacyWeather) {
                                setWeatherId(weatherIdFromLabel(legacyWeather));
                            }
                        }
                        if (parsed.counts) setCounts(parsed.counts);
                        return; // Successfully loaded draft
                    }
                } catch (e) {
                    console.error("Error reading draft from localStorage", e);
                }

                // If no draft, decide between props or fetch
                const now = new Date();
                const todayStr = format(now, 'yyyy-MM-dd');
                if (dateStr === todayStr && (initialTotalSales > 0 || initialTicketsCount > 0)) {
                    setTpvData(prev => ({
                        ...prev,
                        totalSales: initialTotalSales,
                        ticketsCount: initialTicketsCount
                    }));
                } else {
                    fetchTodayVentas();
                }
            } else if (dateStr !== lastDate.current) {
                // 2. DATE CHANGED MANUALLY (Subsequent triggers)
                lastDate.current = dateStr;
                fetchTodayVentas();
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

    // Consolidado en el efecto de inicialización


    async function fetchTodayVentas() {
        setLoading(true);
        try {
            const dateObj = parseDateTimeLocal(selectedDateTime);
            const dateStr = format(dateObj, 'yyyy-MM-dd');

            // Robust fetch: Aggregated sum directly from the table to avoid RPC dependency issues
            const { data: tickets, error: salesError } = await supabase
                .from('tickets_marbella')
                .select('total_documento')
                .eq('fecha', dateStr);

            if (salesError) throw salesError;

            let total = 0;
            let count = 0;
            tickets?.forEach(t => {
                const val = Number(t.total_documento) || 0;
                if (val !== 0) {
                    total += val;
                    count += (val > 0 ? 1 : -1);
                }
            });

            setTpvData(prev => ({
                ...prev,
                totalSales: Math.max(0, Math.round(total * 100) / 100),
                ticketsCount: Math.max(0, count)
            }));
        } catch (error) {
            console.error("Error fetching sales data:", error);
            toast.error("Error al sincronizar datos de ventas");
        } finally {
            setLoading(false);
        }
    }

    // --- CALCULATIONS ---
    const totalSalesGross = tpvData.totalSales;
    const cashSalesToday = totalSalesGross - tpvData.cardSales - tpvData.pendingSales;
    const expectedCash = cashSalesToday + tpvData.debtRecovered;
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
            toast.error('Adjunta el informe TPV en la fila Ventas');
            return false;
        }
        if (!dataphonePhotoFile) {
            toast.error('Adjunta los totales del datáfono en la fila Tarjeta');
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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className={cn(
                    "bg-white w-full max-w-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 rounded-2xl",
                    "max-h-[calc(100dvh-2rem)]",
                    "shadow-2xl shadow-black/20 border border-white/10"
                )}
                onClick={e => e.stopPropagation()}
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
                            <ClosingStepRow title="Clima" fullWidthField>
                                <ClosingWeatherPicker
                                    selectedId={weatherId}
                                    onSelect={setWeatherId}
                                />
                            </ClosingStepRow>

                            <ClosingStepRow
                                title="Ventas"
                                trailing={
                                    <ClosingPhotoAttach
                                        inputId="closing-photo-bdp-ticket"
                                        previewUrl={bdpTicketPreviewUrl}
                                        ariaLabel="Informe TPV"
                                        onSelect={setBdpTicketPhoto}
                                        onClear={() => setBdpTicketPhoto(null)}
                                    />
                                }
                            >
                                <ClosingPetrolInput
                                    value={tpvData.totalSales}
                                    onChange={(next) => setTpvData({ ...tpvData, totalSales: next })}
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

                            <ClosingStepRow
                                title="Tarjeta"
                                trailing={
                                    <ClosingPhotoAttach
                                        inputId="closing-photo-dataphone"
                                        previewUrl={dataphonePreviewUrl}
                                        ariaLabel="Totales datáfono"
                                        onSelect={setDataphonePhoto}
                                        onClear={() => setDataphonePhoto(null)}
                                    />
                                }
                            >
                                <ClosingPetrolInput
                                    value={tpvData.cardSales}
                                    onChange={(next) => setTpvData({ ...tpvData, cardSales: next })}
                                />
                            </ClosingStepRow>

                            <ClosingStepRow title="Cobros">
                                <ClosingPetrolInput
                                    value={tpvData.debtRecovered}
                                    onChange={(next) => setTpvData({ ...tpvData, debtRecovered: next })}
                                />
                            </ClosingStepRow>

                            <ClosingStepRow title="Pendiente">
                                <ClosingPetrolInput
                                    value={tpvData.pendingSales}
                                    onChange={(next) => setTpvData({ ...tpvData, pendingSales: next })}
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
                            <div className="p-3 sm:p-4 flex flex-col gap-4">
                                <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-y-5 sm:gap-y-6 gap-x-3 sm:gap-x-4">
                                    {BILLS.map(bill => (
                                        <div key={bill} className="flex flex-col items-center gap-1.5 group transition-all">
                                            <div className="h-11 sm:h-14 w-full flex items-center justify-center transition-transform group-hover:scale-110">
                                                <Image
                                                    src={CURRENCY_IMAGES[bill]}
                                                    alt={bill + "€"}
                                                    width={140}
                                                    height={140}
                                                    className="h-full w-auto object-contain drop-shadow-lg"
                                                />
                                            </div>
                                            <div className="text-center w-full">
                                                <span className="font-black text-gray-500 text-[9px] uppercase tracking-widest block mb-0.5">{bill}€</span>
                                                <div className="flex items-center justify-between w-full h-10 bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm transition-all focus-within:ring-2 focus-within:ring-offset-1 focus-within:border-[#5B8FB9]/40 focus-within:ring-[#5B8FB9]/20">
                                                    <button onClick={() => handleAdjustCount(bill, -1)} className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100 transition-colors shrink-0"><Minus size={14} strokeWidth={3} /></button>
                                                    <input type="number" placeholder=""
                                                        className="flex-1 w-0 h-full bg-transparent text-center font-black text-zinc-700 outline-none p-0 text-[10px] tracking-tighter tabular-nums focus:bg-blue-50/20 transition-colors"
                                                        value={counts[bill] || ''} onChange={(e) => updateCount(bill, e.target.value)} />
                                                    <button onClick={() => handleAdjustCount(bill, 1)} className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100 transition-colors shrink-0"><Plus size={14} strokeWidth={3} /></button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {COINS.map(coin => (
                                        <div key={coin} className="flex flex-col items-center gap-1.5 group transition-all">
                                            <div className="h-11 sm:h-14 w-full flex items-center justify-center transition-transform group-hover:scale-110">
                                                <Image
                                                    src={CURRENCY_IMAGES[coin]}
                                                    alt={coin + "€"}
                                                    width={140}
                                                    height={140}
                                                    className="h-full w-auto object-contain drop-shadow-md"
                                                />
                                            </div>
                                            <div className="text-center w-full">
                                                <span className="font-black text-gray-500 text-[9px] uppercase tracking-widest block mb-0.5">{coin < 1 ? (coin * 100).toFixed(0) + "c" : coin + "€"}</span>
                                                <div className="flex items-center justify-between w-full h-10 bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm transition-all focus-within:ring-2 focus-within:ring-offset-1 focus-within:border-[#5B8FB9]/40 focus-within:ring-[#5B8FB9]/20">
                                                    <button onClick={() => handleAdjustCount(coin, -1)} className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100 transition-colors shrink-0"><Minus size={14} strokeWidth={3} /></button>
                                                    <input type="number" placeholder=""
                                                        className="flex-1 w-0 h-full bg-transparent text-center font-black text-zinc-700 outline-none p-0 text-[10px] tracking-tighter tabular-nums focus:bg-blue-50/20 transition-colors"
                                                        value={counts[coin] || ''} onChange={(e) => updateCount(coin, e.target.value)} />
                                                    <button onClick={() => handleAdjustCount(coin, 1)} className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100 transition-colors shrink-0"><Plus size={14} strokeWidth={3} /></button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: SUMMARY */}
                    {step === 'summary' && (
                        <div className="p-4 sm:p-6 space-y-6 sm:space-y-8 animate-in slide-in-from-bottom-4 duration-300">
                            <div className="text-center">
                                <h3 className="text-2xl font-black text-gray-800 uppercase tracking-tight">Cierre de Caja</h3>
                            </div>

                            <div className="grid grid-cols-2 gap-6 sm:gap-8 py-6 sm:py-8 border-y border-gray-50">
                                <div className="flex flex-col items-center justify-center text-center col-span-2">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Efectivo Contado (Total Retirado)</span>
                                    <span className="text-3xl font-black text-[#5B8FB9]">{totalCounted > 0.005 ? `${totalCounted.toFixed(2)}€` : " "}</span>
                                </div>
                            </div>

                            <div className="flex flex-col items-center justify-center pt-4 border-t border-gray-50/50">
                                <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-1">Descuadre</span>
                                <span className={cn(
                                    "text-xl font-black",
                                    difference === 0 ? "text-emerald-500" : "text-rose-500"
                                )}>
                                    {Math.abs(difference) < 0.005 ? " " : `${difference > 0 ? '+' : ''}${difference.toFixed(2)}€`}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                {dataphonePreviewUrl ? (
                                    <div className="rounded-xl border border-zinc-100 overflow-hidden">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-2 py-1 bg-zinc-50">Datáfonos</p>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={dataphonePreviewUrl} alt="Totales datáfonos" className="w-full h-24 object-cover rounded-xl" />
                                    </div>
                                ) : null}
                                {bdpTicketPreviewUrl ? (
                                    <div className="rounded-xl border border-zinc-100 overflow-hidden">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-2 py-1 bg-zinc-50">Software ventas</p>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={bdpTicketPreviewUrl} alt="Totales software de ventas" className="w-full h-24 object-cover rounded-xl" />
                                    </div>
                                ) : null}
                            </div>

                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="p-3 sm:p-4 bg-gray-50 border-t flex gap-3 sm:gap-4 shrink-0">
                    {step !== 'tpv_data' && (
                        <button
                            onClick={() => setStep(step === 'summary' ? 'count' : 'tpv_data')}
                            className="px-4 sm:px-6 min-h-[48px] font-black text-gray-400 uppercase tracking-widest text-xs hover:text-gray-600 transition-colors rounded-xl hover:bg-white/60 active:bg-white/80"
                        >
                            Atrás
                        </button>
                    )}
                    <button
                        onClick={handleAdvanceStep}
                        disabled={loading || (step === 'summary' && !photosReady)}
                        className={cn(
                            "flex-1 min-h-[48px] h-14 rounded-2xl shadow-xl flex items-center justify-center gap-3 text-white font-black uppercase tracking-widest transition-all active:scale-[0.98]",
                            step === 'summary' || step === 'tpv_data' || step === 'count'
                                ? 'bg-emerald-500 shadow-emerald-200'
                                : 'bg-[#5B8FB9] shadow-blue-900/20'
                        )}
                    >
                        {loading ? <LoadingSpinner size="sm" className="text-white" /> : (
                            <>
                                {step === 'summary' ? '' : ''}
                                {step === 'summary' ? 'Confirmar Cierre' : (step === 'count' ? 'Ver Resumen' : 'Siguiente')}
                            </>
                        )}
                    </button>
                </div>
            </div>

        </div >
    );
}
