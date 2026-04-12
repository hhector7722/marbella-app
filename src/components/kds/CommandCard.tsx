"use client";

import { useEffect, useState, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import Image from 'next/image';
import { KDSOrder, KDSItemStatus } from './types';
import { parseDBDate, formatLocalTime } from '@/utils/date-utils';
import { NotesModal } from './NotesModal';
import { cn } from '@/lib/utils';

interface CommandCardProps {
    order: KDSOrder;
    onTacharProductos: (lineIds: string[], currentState: KDSItemStatus) => void;
    onCompletarComanda: (orderId: string, idTicket: string | null) => void;
    onRecuperarComanda: (orderId: string) => void;
    onUpdateLineNotes: (lineIds: string[], nextNotes: string) => Promise<void> | void;
    onUpdateOrderNotes: (orderId: string, nextNotes: string) => Promise<void> | void;
    /** KDS: sin margen superior; pegada visualmente al riel comandero */
    kdsRailAttached?: boolean;
}

const QUICK_NOTES = [
    'PARA LLEVAR',
    'NO HACER',
    'CORTADO EN DOS',
    'PARA COMPARTIR',
    'SIN TOMATE',
    'CON TOMATE',
    'CALIENTE',
    'FRIO',
    'SIN QUESO',
    'SIN PIMIENTO',
    'SIN OLIVAS',
    'SIN SALSA',
    'EXTRA SALSA BRAVA',
    'POCO HECHO',
    'PUNTO MENOS',
    'PUNTO MÁS',
    'MUY HECHO',
    'SIN SAL',
] as const;

function hasNotes(raw: string | null | undefined) {
    return (raw ?? '').trim().length > 0;
}

function splitBullets(raw: string | null | undefined) {
    if (!raw) return [];
    return raw.split('\n').map(s => s.trim()).filter(Boolean);
}

export function CommandCard({ order, onTacharProductos, onCompletarComanda, onRecuperarComanda, onUpdateLineNotes, onUpdateOrderNotes, kdsRailAttached = false }: CommandCardProps) {
    const [elapsed, setElapsed] = useState<number>(0);
    // Clave del grupo cuyo dropdown de unidades está abierto (null = ninguno)
    const [openDropdownKey, setOpenDropdownKey] = useState<string | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const isCompleted = order.estado === 'completada';

    const [notesModal, setNotesModal] = useState<null | {
        kind: 'order' | 'lineGroup';
        title: string;
        subtitle?: string | null;
        initialNotes: string | null | undefined;
        lineIds?: string[];
    }>(null);

    const getEffectiveStartTime = () => {
        const pendingLines = order.lineas?.filter(l => l.estado === 'pendiente') || [];
        if (pendingLines.length > 0) {
            return Math.min(...pendingLines.map(l => parseDBDate(l.created_at).getTime()));
        }
        if (order.lineas && order.lineas.length > 0) {
            return Math.max(...order.lineas.map(l => parseDBDate(l.created_at).getTime()));
        }
        return parseDBDate(order.created_at).getTime();
    };


    const effectiveStart = getEffectiveStartTime();

    useEffect(() => {
        const calc = () => {
            const now = new Date().getTime();
            setElapsed(Math.floor((now - effectiveStart) / 60000));
        };
        calc();
        const timer = setInterval(calc, 60000);
        return () => clearInterval(timer);
    }, [effectiveStart]);

    // Cerrar dropdown si se hace click fuera de la tarjeta
    useEffect(() => {
        if (!openDropdownKey) return;
        const handleOutside = (e: MouseEvent) => {
            if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
                setOpenDropdownKey(null);
            }
        };
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, [openDropdownKey]);

    const formatElapsed = (minutes: number) => {
        if (minutes < 0) return '0m';
        if (minutes < 60) return `${minutes}m`;
        const hrs = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hrs}h ${mins}m`;
    };

    const getIndicatorColor = () => {
        if (isCompleted) return 'bg-slate-600';
        // Indicador temporal: ≤15 min petróleo, 16–24 amarillo, ≥25 rojo
        if (elapsed >= 25) return 'animate-pulse-critical';
        if (elapsed >= 16) return 'bg-amber-400';
        return 'bg-[#407080]';
    };

    const orderTime = formatLocalTime(new Date(effectiveStart));
    const isFullyDone = (order.lineas?.length || 0) > 0 && order.lineas?.every(l => l.estado === 'terminado' || l.estado === 'cancelado');

    // Finalizar si todas las líneas vienen canceladas desde TPV (sin tachar en cocina); el caso terminado lo cubre useKDS.tacharProductos.
    const allCancelado =
        (order.lineas?.length ?? 0) > 0 && order.lineas!.every((l) => l.estado === 'cancelado');
    const finalizeCancelOnce = useRef(false);
    useEffect(() => {
        finalizeCancelOnce.current = false;
    }, [order.id]);
    useEffect(() => {
        if (isCompleted || !allCancelado || finalizeCancelOnce.current) return;
        finalizeCancelOnce.current = true;
        onCompletarComanda(order.id, order.id_ticket ?? null);
    }, [allCancelado, isCompleted, order.id, order.id_ticket, onCompletarComanda]);

    // Todas las líneas visibles: pendientes, tachadas (terminado) y canceladas.
    const lineasVisibles = order.lineas || [];

    // Agrupamiento de líneas: mismo nombre, notas y estado
    const groupedLines = lineasVisibles.reduce((acc, line) => {
        const key = `${line.producto_nombre}_${line.notas || ''}_${line.estado}`;
        if (!acc[key]) {
            acc[key] = {
                ids: [line.id],
                producto_nombre: line.producto_nombre,
                notas: line.notas,
                estado: line.estado,
                cantidad: 1
            };
        } else {
            acc[key].ids.push(line.id);
            acc[key].cantidad++;
        }
        return acc;
    }, {} as Record<string, { ids: string[]; producto_nombre: string; notas: string | null; estado: KDSItemStatus; cantidad: number }>);

    const groupedArray = Object.values(groupedLines);

    return (
        <>
            <div
            ref={cardRef}
            className={cn(
                'relative flex flex-col overflow-hidden rounded-b-xl bg-white w-full min-w-0 sm:w-fit sm:max-w-[min(100vw-2rem,48rem)] border-[0.5px] border-black shadow-[0_12px_40px_rgba(0,0,0,0.18)] transition-all duration-300',
                openDropdownKey ? 'z-[100]' : 'z-auto',
                isCompleted ? 'opacity-60' : isFullyDone ? 'opacity-90' : '',
                !kdsRailAttached && 'mt-2'
            )}
        >
            {/* Cabecera: sin bordes laterales (evita franja clara); el color llega al borde del contenedor */}
            <div
                className={cn(
                    'px-3 sm:px-4 pb-2 pt-1.5 flex justify-between items-start transition-colors duration-500 relative font-black w-full min-w-0',
                    isCompleted ? 'bg-slate-200 text-slate-600' : `${getIndicatorColor()} text-white`
                )}
            >
                {isCompleted && (
                    <div className="absolute top-0 right-3 bg-white/50 px-2 py-1 rounded-b-md text-[10px] font-black uppercase tracking-[0.15em] text-slate-700">
                        FINALIZADA
                    </div>
                )}

                <div className="flex w-full items-center gap-2 pt-0 sm:gap-3">
                    {/* Mesa — columna izquierda */}
                    <div className="flex min-w-0 flex-1 justify-start">
                        <div className="flex h-[9rem] w-[9rem] shrink-0 items-center justify-center rounded-full bg-white text-slate-900 shadow-md ring-2 ring-black/10 sm:h-[10.5rem] sm:w-[10.5rem] md:h-[11.5rem] md:w-[11.5rem]">
                            <span className="text-[clamp(2.75rem,10vw,4.75rem)] font-black uppercase leading-none tabular-nums tracking-tight sm:text-[clamp(3.25rem,9vw,5.5rem)] md:text-[clamp(3.5rem,8vw,6rem)]">
                                {(() => {
                                    const mesaNum = parseInt(order.mesa || '');
                                    if (!isNaN(mesaNum) && mesaNum > 1000) return '--';
                                    return order.mesa || '--';
                                })()}
                            </span>
                        </div>
                    </div>

                    {/* Hora + transcurrido — centrados en la cabecera */}
                    <div className="flex min-w-0 shrink-0 flex-col items-center justify-center px-1 text-center">
                        <span className="text-lg font-black uppercase tracking-[0.12em] opacity-95 sm:text-xl">{orderTime}</span>
                        <div className="mt-0.5 flex flex-col items-center justify-center gap-0.5 sm:flex-row sm:flex-wrap sm:justify-center">
                            <span className="text-sm font-bold uppercase tracking-[0.1em] opacity-85 sm:text-base">
                                HACE {formatElapsed(elapsed)}
                            </span>
                            {order.origen_referencia && (
                                <>
                                    <span className="hidden text-sm opacity-50 sm:inline">·</span>
                                    <span className="max-w-[14rem] truncate text-xs font-bold uppercase tracking-[0.08em] opacity-80 sm:text-sm">
                                        {order.origen_referencia.replace(/^directo\s*-\s*/i, '').replace(/^directo-/i, '')}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Editar nota — derecha, mismo ancho flexible que la mesa para centrar hora */}
                    <div className="flex min-w-0 flex-1 justify-end">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setNotesModal({
                                    kind: 'order',
                                    title: `Mesa ${order.mesa || '--'}`,
                                    subtitle: 'NOTA COMANDA',
                                    initialNotes: order.notas_comanda,
                                });
                            }}
                            className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center border-0 bg-transparent shadow-none transition hover:opacity-90 active:scale-95 sm:h-24 sm:w-24 md:h-[5.5rem] md:w-[5.5rem]"
                            title="Editar nota comanda"
                        >
                            <Image src="/icons/notas.png" alt="Notas" width={56} height={56} className={`h-12 w-12 object-contain sm:h-14 sm:w-14 md:h-16 md:w-16 ${isCompleted ? 'opacity-50' : 'opacity-95'} drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]`} />
                        </button>
                    </div>
                </div>
            </div>

            {order.notas_comanda && (
                <div className={`px-4 py-2.5 flex items-start gap-2 border-b border-slate-100 ${isCompleted ? 'bg-slate-50' : 'bg-rose-100/90'}`}>
                    <AlertTriangle size={22} className={`${isCompleted ? 'text-slate-400' : 'text-rose-500'} mt-0.5 shrink-0`} strokeWidth={2.5} />
                    <div className={`flex-1 text-base sm:text-lg font-bold leading-snug uppercase tracking-[0.08em] ${isCompleted ? 'text-slate-500' : 'text-rose-800'}`}>
                        {splitBullets(order.notas_comanda).map((n, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                                <span className="font-black">·</span>
                                <span className="break-words">{n}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Lista de Líneas */}
            <div className="flex-1 space-y-2 px-0 py-2 sm:py-3">
                {groupedArray.map((group, lineIndex) => {
                    const groupKey = group.ids.join(',');
                    const isDropdownOpen = openDropdownKey === groupKey;
                    const canInteract = !isCompleted && group.estado !== 'cancelado';
                    const isLastLine = lineIndex === groupedArray.length - 1;

                    return (
                        <div key={groupKey} className="relative">
                            <div
                                onClick={() => {
                                    if (!canInteract) return;
                                    // Cerrar dropdown si está abierto al pulsar el cuerpo
                                    if (isDropdownOpen) { setOpenDropdownKey(null); return; }
                                    // Tachar TODAS las unidades del grupo de golpe
                                    onTacharProductos(group.ids, group.estado);
                                }}
                                className={`group relative flex items-center pl-0 pr-3 py-3 sm:py-3.5 select-none transition-all duration-200 rounded-xl bg-white/95 ${isLastLine ? 'shadow-none' : 'shadow-sm'} ${isCompleted
                                        ? 'opacity-40 cursor-default'
                                        : group.estado === 'terminado'
                                            ? 'hover:bg-emerald-50/80 cursor-pointer'
                                            : group.estado === 'cancelado'
                                                ? 'opacity-60 cursor-not-allowed rounded-lg'
                                                : 'hover:bg-slate-50 cursor-pointer active:scale-[0.98]'
                                    }`}
                            >
                                {/* Solo cancelados: icono X. Terminado: tachado verde sin tick. */}
                                {group.estado === 'cancelado' && (
                                    <div
                                        className={`mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all duration-300 sm:h-12 sm:w-12 ${
                                            isCompleted ? 'bg-slate-200 text-slate-400' : 'bg-slate-300 text-slate-500'
                                        }`}
                                    >
                                        <X size={26} strokeWidth={3} />
                                    </div>
                                )}

                                <div className="flex-1 min-w-0 flex items-center justify-between">
                                    <div className="flex flex-col pr-1 min-w-0">
                                        <div className="flex items-center gap-0 min-w-0">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setNotesModal({
                                                        kind: 'lineGroup',
                                                        title: group.producto_nombre,
                                                        subtitle: `Mesa ${order.mesa || '--'}`,
                                                        initialNotes: group.notas,
                                                        lineIds: group.ids,
                                                    });
                                                }}
                                                className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 min-h-[48px] min-w-[48px] sm:min-h-[48px] sm:min-w-[48px] flex items-center justify-center bg-transparent border-0 p-0 shadow-none hover:opacity-90 active:scale-95 transition"
                                                title="Editar nota artículo"
                                            >
                                                <Image src="/icons/notas.png" alt="Notas" width={34} height={34} className={`${isCompleted ? 'opacity-45' : 'opacity-90'} drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]`} />
                                            </button>

                                            <span className={`flex-1 min-w-0 text-xl sm:text-2xl lg:text-3xl leading-tight font-bold tracking-[0.06em] transition-all duration-300 block truncate ${isCompleted ? 'text-slate-400 line-through' :
                                                group.estado === 'terminado' ? 'text-emerald-600 line-through decoration-emerald-600 decoration-2 [text-decoration-thickness:2px]' :
                                                    group.estado === 'cancelado' ? 'text-slate-400 line-through decoration-slate-400 decoration-2' :
                                                        'text-slate-900'
                                            }`}>
                                            {group.producto_nombre}
                                            </span>
                                        </div>

                                        {hasNotes(group.notas) && (
                                            <div className="mt-2 space-y-1">
                                                {splitBullets(group.notas).map((n, idx) => (
                                                    <div key={idx} className={`flex items-start gap-2 ${group.estado === 'cancelado' || isCompleted ? 'opacity-50' : ''}`}>
                                                        <span className="text-rose-600 font-black text-lg">·</span>
                                                        <span className="text-base sm:text-lg font-bold text-rose-700 italic tracking-wide break-words">
                                                            {n}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Badge de cantidad — interactivo solo si hay >1 unidad y está pendiente */}
                                    {group.cantidad > 0 && (
                                        <div
                                            onClick={(e) => {
                                                // Solo abre el dropdown si hay más de 1 unidad, está pendiente, y se puede interactuar
                                                if (!canInteract || group.estado !== 'pendiente' || group.cantidad <= 1) return;
                                                e.stopPropagation(); // No propagar al div padre (que tacharía todo)
                                                setOpenDropdownKey(isDropdownOpen ? null : groupKey);
                                            }}
                                            className={`shrink-0 flex items-center justify-center rounded-lg px-2.5 py-1.5 border-[3px] min-w-[3rem] transition-all duration-150 ${
                                                group.estado === 'terminado'
                                                    ? 'border-green-200 text-green-600 bg-green-50 cursor-default'
                                                    : canInteract && group.estado === 'pendiente' && group.cantidad > 1
                                                        ? 'border-slate-800 text-slate-900 bg-slate-50 cursor-pointer hover:bg-slate-200 active:scale-95'
                                                        : 'border-slate-800 text-slate-900 bg-slate-50 cursor-default'
                                            }`}
                                        >
                                            <span className="text-2xl sm:text-3xl font-black tracking-wide">{group.cantidad}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Dropdown "Finalizar por unidad" */}
                            {isDropdownOpen && (
                                <div className="absolute right-1 top-full z-50 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden min-w-[220px]">
                                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                                        <span className="text-sm font-black uppercase tracking-[0.12em] text-slate-500">Finalizar por unidad</span>
                                    </div>
                                    {/* Opciones: 1 unidad, 2 unidades... hasta N */}
                                    {Array.from({ length: group.cantidad }, (_, i) => i + 1).map(n => (
                                        <button
                                            key={n}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenDropdownKey(null);
                                                // Tachar solo las primeras N IDs del grupo
                                                const idsToMark = group.ids.slice(0, n);
                                                onTacharProductos(idsToMark, group.estado);
                                            }}
                                            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-emerald-50 active:bg-emerald-100 transition-colors border-b border-slate-50 last:border-none min-h-[48px]"
                                        >
                                            <span className="text-base font-black tracking-wide text-slate-800">
                                                {n === group.cantidad
                                                    ? `Finalizar todos (${n})`
                                                    : `Finalizar ${n}`}
                                            </span>
                                            <span className="text-sm font-bold text-slate-500 bg-slate-100 rounded px-2 py-1">{n}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Franja inferior alineada con bordes laterales e inferior de la comanda (sin padding horizontal). */}
            <div className="w-full shrink-0 overflow-hidden rounded-b-xl bg-slate-100/95">
                {isCompleted ? (
                    <button
                        type="button"
                        onClick={() => onRecuperarComanda(order.id)}
                        className="w-full min-h-[52px] rounded-none px-3 py-3 sm:px-4 bg-amber-500 hover:bg-amber-600 text-white font-black text-base sm:text-lg uppercase tracking-[0.15em] transition-all duration-300 active:translate-y-1"
                    >
                        Restaurar
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => onCompletarComanda(order.id, order.id_ticket ?? null)}
                        className={cn(
                            'w-full min-h-[52px] rounded-none px-3 py-3 sm:px-4 font-black text-base sm:text-lg uppercase tracking-[0.15em] transition-all duration-300 active:translate-y-1',
                            isFullyDone
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200/90'
                                : 'bg-slate-200/90 text-slate-500 hover:bg-slate-300/90'
                        )}
                    >
                        Finalizar
                    </button>
                )}
            </div>

            <style jsx>{`
        @keyframes pulse-critical {
          0%, 100% { background-color: #dc2626; } /* red-600 */
          50% { background-color: #b91c1c; } /* red-700 */
        }
        .animate-pulse-critical {
          animation: pulse-critical 2s ease-in-out infinite;
        }
      `}</style>
            </div>

            <NotesModal
                isOpen={notesModal !== null}
                title={notesModal?.title ?? ''}
                subtitle={notesModal?.subtitle ?? null}
                initialNotes={notesModal?.initialNotes}
                quickNotes={QUICK_NOTES}
                accent="rose"
                onClose={() => setNotesModal(null)}
                onSave={async (next) => {
                    if (!notesModal) return;
                    if (notesModal.kind === 'order') {
                        await onUpdateOrderNotes(order.id, next);
                    } else {
                        await onUpdateLineNotes(notesModal.lineIds ?? [], next);
                    }
                }}
            />
        </>
    );
}