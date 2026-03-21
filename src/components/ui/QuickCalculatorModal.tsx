'use client';

import { useMemo, useRef, useState, useCallback } from 'react';
import { X, Copy, Calculator, Delete, Minus, Plus, Banknote, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DENOMINATIONS, CURRENCY_IMAGES } from '@/lib/constants';
import { DenominationZoomModal } from '@/components/ui/DenominationZoomModal';

type ModalTab = 'calculator' | 'breakdown';

/** Evalúa una expresión numérica segura (solo dígitos, ., +, -, *, /). */
function safeEval(expr: string): number | null {
    const trimmed = expr.replace(/\s/g, '');
    if (!trimmed) return null;
    if (!/^[\d.+*\-/]+$/.test(trimmed)) return null;
    try {
        const result = Function('"use strict"; return (' + trimmed + ')')();
        return typeof result === 'number' && Number.isFinite(result) ? result : null;
    } catch {
        return null;
    }
}

interface QuickCalculatorModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const BTN_VALUES: (string | 'back')[][] = [
    ['C', 'back', '±', '%', '/'],
    ['7', '8', '9', '*'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['.', '0', '=', ''],
];

export function QuickCalculatorModal({ isOpen, onClose }: QuickCalculatorModalProps) {
    const [tab, setTab] = useState<ModalTab>('calculator');
    const [display, setDisplay] = useState('');
    const [result, setResult] = useState<number | null>(null);
    const [breakdownCounts, setBreakdownCounts] = useState<Record<number, number>>({});
    const [zoomDenom, setZoomDenom] = useState<number | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [showConfirmEnviar, setShowConfirmEnviar] = useState(false);
    const [lastCaptureBlob, setLastCaptureBlob] = useState<Blob | null>(null);
    const [lastCaptureCopied, setLastCaptureCopied] = useState(false);
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const modalRef = useRef<HTMLDivElement | null>(null);
    const breakdownCaptureRef = useRef<HTMLDivElement | null>(null);

    const handlePress = useCallback((key: string) => {
        if (key === 'C') {
            setDisplay('');
            setResult(null);
            return;
        }
        if (key === 'back') {
            setResult(null);
            setDisplay((prev) => prev.slice(0, -1));
            return;
        }
        if (key === '=') {
            const val = safeEval(display);
            setResult(val);
            if (val !== null) setDisplay(String(val));
            return;
        }
        if (key === '±') {
            const val = safeEval(display);
            if (val !== null) setDisplay(String(-val));
            return;
        }
        if (key === '%') {
            const val = safeEval(display);
            if (val !== null) setDisplay(String(val / 100));
            return;
        }
        if (key === '' || key === 'back') return;
        setResult(null);
        setDisplay((prev) => prev + key);
    }, [display]);

    const handleCopy = useCallback(() => {
        const toCopy = result !== null ? String(result) : (display || '0');
        navigator.clipboard.writeText(toCopy).then(() => {
            toast.success('Resultado copiado al portapapeles');
        }).catch(() => {
            toast.error('No se pudo copiar');
        });
    }, [result, display]);

    const breakdownTotal = DENOMINATIONS.reduce((sum, d) => sum + d * (breakdownCounts[d] || 0), 0);
    const handleBreakdownAdjust = useCallback((denom: number, delta: number) => {
        setBreakdownCounts((prev) => ({
            ...prev,
            [denom]: Math.max(0, (prev[denom] || 0) + delta),
        }));
    }, []);
    const handleBreakdownCountChange = useCallback((denom: number, value: string) => {
        const num = value === '' ? 0 : Math.max(0, parseInt(value, 10) || 0);
        setBreakdownCounts((prev) => ({ ...prev, [denom]: num }));
    }, []);
    const whatsappMensaje = 'Aquí tienes el desglose.';

    const BreakdownCaptureCard = useCallback(
        ({
            className,
            showHeaderHint = false,
        }: {
            className?: string;
            showHeaderHint?: boolean;
        }) => (
            <div className={cn('bg-white text-zinc-900 overflow-hidden', className)}>
                <div className="bg-[#36606F] px-10 sm:px-12 py-8 sm:py-10">
                    <div className="flex items-end justify-between gap-6">
                        <div className="min-w-0">
                            <div className="text-white text-3xl sm:text-4xl font-black uppercase tracking-[0.18em] leading-none">
                                DESGLOSE
                            </div>
                            <div className="text-white/80 text-sm sm:text-base font-black uppercase tracking-[0.22em] mt-3">
                                Bar La Marbella
                            </div>
                            {showHeaderHint && (
                                <div className="text-white/70 text-[10px] sm:text-xs font-black uppercase tracking-[0.22em] mt-2">
                                    Haz captura y pégala en la conversación
                                </div>
                            )}
                        </div>
                        <div className="text-right shrink-0">
                            <div className="text-white/70 text-[10px] sm:text-xs font-black uppercase tracking-[0.22em]">
                                Total
                            </div>
                            <div className="text-white text-3xl sm:text-5xl font-black tabular-nums leading-none mt-1">
                                {breakdownTotal > 0.005 ? `${breakdownTotal.toFixed(2)}€` : ' '}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-8 sm:p-10">
                    <div className="grid grid-cols-5 gap-x-6 sm:gap-x-8 gap-y-6 sm:gap-y-8">
                        {DENOMINATIONS.map((denom) => {
                            const qty = breakdownCounts[denom] || 0;
                            const label = denom >= 1 ? `${denom}€` : `${(denom * 100).toFixed(0)}c`;
                            const subtotal = denom * qty;
                            return (
                                <div
                                    key={denom}
                                    className="bg-white rounded-2xl sm:rounded-3xl border border-zinc-100 shadow-sm p-3 sm:p-4"
                                >
                                    <div className="flex items-center justify-center h-16 sm:h-24">
                                        <img
                                            src={CURRENCY_IMAGES[denom]}
                                            alt={label}
                                            width={260}
                                            height={260}
                                            className="h-full w-auto object-contain drop-shadow-lg"
                                            draggable={false}
                                        />
                                    </div>
                                    <div className="mt-2 sm:mt-3 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="text-[9px] sm:text-xs font-black text-zinc-500 uppercase tracking-widest">
                                                {label}
                                            </div>
                                            <div className="text-lg sm:text-2xl font-black tabular-nums text-purple-600 leading-none">
                                                {qty > 0 ? qty : ' '}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="text-[9px] sm:text-xs font-black text-zinc-400 uppercase tracking-widest">
                                                Sub
                                            </div>
                                            <div className="text-[11px] sm:text-base font-black tabular-nums text-emerald-600">
                                                {subtotal > 0.005 ? `${subtotal.toFixed(2)}€` : ' '}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        ),
        [breakdownCounts, breakdownTotal]
    );

    /** Paso 2: tras confirmar, usar compartir nativo por defecto. */
    const handleConfirmEnviar = useCallback(async () => {
        if (lastCaptureBlob) {
            try {
                const file = new File([lastCaptureBlob], 'desglose.png', { type: 'image/png' });
                if (navigator.canShare?.({ files: [file] }) && navigator.share) {
                    await navigator.share({
                        files: [file],
                        title: 'Desglose',
                        text: whatsappMensaje,
                    });
                    setShowConfirmEnviar(false);
                    return;
                }
            } catch {
                // Si share nativo falla, seguimos con apertura WhatsApp web.
            }
        }

        const waUrl = `https://wa.me/?text=${encodeURIComponent(whatsappMensaje)}`;
        const opened = window.open(waUrl, '_blank', 'noopener,noreferrer');
        if (!opened) {
            toast.info('WhatsApp bloqueado por el navegador. Ábrelo manualmente y pega la imagen.');
        }
        setShowConfirmEnviar(false);
    }, [lastCaptureBlob, whatsappMensaje]);

    /** Paso 1: generar PNG, copiar al portapapeles (si se puede) o descargar; luego abrir confirmación. */
    const handleBreakdownSend = useCallback(async () => {
        if (tab !== 'breakdown') {
            toast.error('Abre primero la pestaña Desglose');
            return;
        }

        // Captura del overlay completo para incluir el fondo difuminado detrás del modal.
        const el = overlayRef.current || modalRef.current;
        if (!el) {
            toast.error('No se pudo capturar el modal');
            return;
        }

        setIsSending(true);
        const toastId = toast.loading('Generando captura…');
        try {
    const { toPng } = await import('html-to-image');

            // Esperar a que carguen imágenes (Next/Image) para mejorar la fiabilidad del screenshot.
            const imgs = Array.from(el.querySelectorAll('img'));
            await Promise.all(
                imgs.map((img) => {
                    const elImg = img as HTMLImageElement;
                    if (elImg.complete) return Promise.resolve();
                    return new Promise<void>((resolve) => {
                        elImg.onload = () => resolve();
                        elImg.onerror = () => resolve();
                    });
                })
            );

            const rect = el.getBoundingClientRect();
            const width = Math.max(1, Math.round(rect.width));
            const height = Math.max(1, Math.round(rect.height));

            const pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

            // Generar PNG real (mejor compatibilidad con ClipboardItem)
            const dataUrl = await toPng(el, {
                backgroundColor: '#ffffff',
                cacheBust: true,
                pixelRatio,
                width,
                height,
                style: {
                    width: `${width}px`,
                    height: `${height}px`,
                },
            });
            if (!dataUrl) throw new Error('No se pudo generar la imagen');

            // Convertimos el dataUrl a Blob SIN fetch (evita restricciones de "not allowed by the user agent").
            const parts = dataUrl.split(',');
            if (parts.length !== 2) throw new Error('Formato dataUrl inválido');
            const header = parts[0];
            const base64 = parts[1];
            const mimeMatch = header.match(/data:(.*?);base64/);
            const mime = mimeMatch?.[1] || 'image/png';
            const byteString = atob(base64);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
            const pngBlob =
                mime === 'image/png' ? new Blob([ab], { type: mime }) : new Blob([ab], { type: 'image/png' });
            setLastCaptureBlob(pngBlob);
            setLastCaptureCopied(false);

            // Ya no usamos copiar por defecto: en confirmación se prioriza compartir nativo.
            toast.success('Captura lista para compartir.');

            // Mostramos siempre confirmación para continuar flujo y abrir WhatsApp.
            setShowConfirmEnviar(true);
        } catch (e: any) {
            const msg = e instanceof Error ? e.message : String(e);
            toast.error(`Error al capturar: ${msg.slice(0, 80)}`);
        } finally {
            setIsSending(false);
            try {
                toast.dismiss(toastId);
            } catch {
                // No hacer nada: el estado ya se ha restaurado.
            }
        }
    }, [tab]);

    if (!isOpen) return null;

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-4 bg-[#36606F]/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                ref={modalRef}
                className={cn(
                    'bg-white relative rounded-2xl shadow-2xl overflow-hidden w-full animate-in zoom-in-95 duration-200 flex flex-col max-h-[calc(100dvh-2rem)]',
                    tab === 'breakdown' ? 'max-w-[320px]' : 'max-w-[280px]'
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-[#36606F] px-3 py-2 flex items-center justify-between text-white shrink-0">
                    <div className="flex rounded-xl bg-white/10 p-0.5 gap-0.5">
                        <button
                            type="button"
                            onClick={() => setTab('calculator')}
                            className={cn(
                                'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all min-h-[40px]',
                                tab === 'calculator' ? 'bg-white text-[#36606F]' : 'text-white/80 hover:text-white'
                            )}
                        >
                            Calculadora
                        </button>
                        <button
                            type="button"
                            onClick={() => setTab('breakdown')}
                            className={cn(
                                'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all min-h-[40px] flex items-center gap-1',
                                tab === 'breakdown' ? 'bg-white text-[#36606F]' : 'text-white/80 hover:text-white'
                            )}
                        >
                            <Banknote size={14} />
                            Desglose
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/10 text-white min-h-[44px] min-w-[44px] shrink-0"
                        aria-label="Cerrar"
                    >
                        <X size={18} strokeWidth={3} />
                    </button>
                </div>
                <div className="p-4 bg-zinc-50 flex-1 overflow-y-auto min-h-0">
                    {tab === 'calculator' && (
                        <>
                            <div className="h-12 bg-white rounded-xl border border-zinc-200 px-3 flex items-center justify-end mb-3">
                                <span className="text-xl font-black tabular-nums text-zinc-800 truncate max-w-full">
                                    {display || '0'}
                                </span>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5 mb-3">
                                {BTN_VALUES.flat().map((key, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => handlePress(key)}
                                        className={cn(
                                            'min-h-[48px] rounded-xl font-black text-sm transition-all active:scale-95 flex items-center justify-center',
                                            key === 'C' && 'bg-rose-100 text-rose-700 hover:bg-rose-200',
                                            key === 'back' && 'bg-rose-500 text-white hover:bg-rose-600',
                                            key === '±' && 'bg-orange-100 text-orange-700 hover:bg-orange-200',
                                            key === '%' && 'bg-orange-100 text-orange-700 hover:bg-orange-200',
                                            ['+', '-', '*', '/'].includes(key) && 'bg-purple-600 text-white hover:bg-purple-500',
                                            key === '=' && 'bg-emerald-500 text-white hover:bg-emerald-600',
                                            !['C', 'back', '=', ''].includes(key) && !['+', '-', '*', '/', '%', '±'].includes(key) && 'bg-white border border-zinc-200 text-zinc-800 hover:bg-zinc-50',
                                            key === '' && 'invisible pointer-events-none'
                                        )}
                                    >
                                        {key === 'back' ? <Delete size={18} strokeWidth={2.5} /> : (key || '')}
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={handleCopy}
                                className="w-full min-h-[48px] rounded-xl bg-emerald-500 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-emerald-600 active:scale-[0.98] shadow-md"
                            >
                                <Copy size={16} />
                                Copiar resultado
                            </button>
                        </>
                    )}
                    {tab === 'breakdown' && (
                        <>
                            {zoomDenom !== null && (
                                <DenominationZoomModal
                                    isOpen={true}
                                    onClose={() => setZoomDenom(null)}
                                    denomination={zoomDenom}
                                    value={breakdownCounts[zoomDenom] || 0}
                                    onValueChange={(v) => setBreakdownCounts((prev) => ({ ...prev, [zoomDenom]: v }))}
                                />
                            )}
                            <div ref={breakdownCaptureRef}>
                                <div className="grid grid-cols-4 sm:grid-cols-5 gap-y-2 gap-x-1.5 p-0.5 mb-3">
                                    {DENOMINATIONS.map((denom) => {
                                        const qty = breakdownCounts[denom] || 0;
                                        return (
                                            <div key={denom} className="flex flex-col items-center gap-1 group transition-all">
                                                <div
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => setZoomDenom(denom)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setZoomDenom(denom); }}
                                                    className="w-full h-11 sm:h-14 flex items-center justify-center transition-transform group-hover:scale-110 cursor-pointer rounded-lg hover:bg-white/60 focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]/40 focus:ring-offset-1 min-h-[48px]"
                                                    aria-label={`Editar cantidad de ${denom >= 1 ? `${denom} euros` : `${(denom * 100).toFixed(0)} céntimos`}`}
                                                >
                                        <img
                                            src={CURRENCY_IMAGES[denom]}
                                            alt={`${denom}€`}
                                            width={140}
                                            height={140}
                                            className="h-full w-auto object-contain drop-shadow-lg pointer-events-none"
                                            draggable={false}
                                        />
                                                </div>
                                                <div className="text-center w-full">
                                                    <span className="font-black text-gray-500 text-[9px] uppercase tracking-widest block mb-0.5">
                                                        {denom >= 1 ? `${denom}€` : `${(denom * 100).toFixed(0)}c`}
                                                    </span>
                                                    <div className="flex items-center justify-between w-full h-10 min-h-[48px] bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm transition-all focus-within:ring-2 focus-within:ring-offset-1 focus-within:border-[#5B8FB9]/40 focus-within:ring-[#5B8FB9]/20">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleBreakdownAdjust(denom, -1)}
                                                            className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100 transition-colors shrink-0"
                                                        >
                                                            <Minus size={14} strokeWidth={3} />
                                                        </button>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            value={qty > 0 ? qty : ''}
                                                            onChange={(e) => handleBreakdownCountChange(denom, e.target.value)}
                                                            placeholder=""
                                                            className="flex-1 w-0 h-full bg-transparent text-center font-black text-zinc-700 outline-none p-0 text-[10px] tracking-tighter tabular-nums focus:bg-blue-50/20 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => handleBreakdownAdjust(denom, 1)}
                                                            className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100 transition-colors shrink-0"
                                                        >
                                                            <Plus size={14} strokeWidth={3} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex items-center justify-between gap-2 p-3 bg-[#36606F] rounded-xl mb-3">
                                    <span className="text-[10px] font-black text-white/80 uppercase tracking-widest">Total</span>
                                    <span className="text-lg font-black text-white tabular-nums">
                                        {breakdownTotal > 0.005 ? `${breakdownTotal.toFixed(2)}€` : ' '}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleBreakdownSend}
                                    disabled={isSending || showConfirmEnviar}
                                    className={cn(
                                        "w-full min-h-[48px] rounded-xl bg-purple-600 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-purple-500 active:scale-[0.98] shadow-md",
                                        isSending && "opacity-60 cursor-not-allowed"
                                    )}
                                >
                                    <Send size={16} />
                                    {isSending ? 'Generando…' : 'Enviar'}
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Modal de confirmación: abre WhatsApp para que el usuario pegue manualmente desde el portapapeles */}
                {showConfirmEnviar && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-[90] rounded-[2.5rem] animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl p-6 mx-4 max-w-[280px] shadow-xl">
                            <p className="text-center text-sm font-medium text-zinc-700 mb-4">
                                ¿Abrimos WhatsApp para que pegues la imagen del desglose?
                            </p>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmEnviar(false)}
                                    className="flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-all min-h-[48px]"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmEnviar}
                                    className="flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider bg-emerald-500 hover:bg-emerald-600 text-white transition-all min-h-[48px]"
                                >
                                    Sí, enviar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/** Botón discreto para cabecera de modal: abre la calculadora. Colocar a la izquierda de la X si hay cierre, o como elemento más a la derecha. */
export function CalculatorHeaderButton({
    isOpen,
    onToggle,
    className,
    ariaLabel = 'Abrir calculadora',
}: {
    isOpen: boolean;
    onToggle: () => void;
    className?: string;
    ariaLabel?: string;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-label={ariaLabel}
            className={cn(
                'w-10 h-10 flex items-center justify-center rounded-xl min-h-[48px] min-w-[48px] shrink-0',
                'text-white/80 hover:text-white hover:bg-white/10 transition-all active:scale-95',
                className
            )}
        >
            <Calculator size={20} strokeWidth={2.5} />
        </button>
    );
}

/**
 * Botón flotante tipo "chat" para abrir la calculadora mientras un modal está abierto.
 * Úsalo dentro del overlay del modal (idealmente en un contenedor `relative`).
 */
export function FloatingCalculatorFab({
    isOpen,
    onToggle,
    className,
    ariaLabel = 'Abrir calculadora',
}: {
    isOpen: boolean;
    onToggle: () => void;
    className?: string;
    ariaLabel?: string;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-label={ariaLabel}
            className={cn(
                'fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[220]',
                'w-14 h-14 min-h-[56px] min-w-[56px] rounded-full shadow-2xl shadow-black/20',
                'bg-purple-600 text-white border border-white/10',
                'hover:brightness-110 active:scale-95 transition-all',
                isOpen && 'opacity-0 pointer-events-none',
                className
            )}
        >
            <Calculator size={22} strokeWidth={2.75} className="mx-auto" />
        </button>
    );
}
