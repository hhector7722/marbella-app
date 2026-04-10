"use client";

import { useEffect, useState, useRef } from 'react';
import { CheckCircle, AlertTriangle, X, ChevronDown } from 'lucide-react';
import Image from 'next/image';
import { KDSOrder, KDSItemStatus } from './types';
import { parseDBDate, formatLocalTime } from '@/utils/date-utils';
import { NotesModal } from './NotesModal';

interface CommandCardProps {
    order: KDSOrder;
    onTacharProductos: (lineIds: string[], currentState: KDSItemStatus) => void;
    onCompletarComanda: (orderId: string) => void;
    onRecuperarComanda: (orderId: string) => void;
    onUpdateLineNotes: (lineIds: string[], nextNotes: string) => Promise<void> | void;
    onUpdateOrderNotes: (orderId: string, nextNotes: string) => Promise<void> | void;
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

export function CommandCard({ order, onTacharProductos, onCompletarComanda, onRecuperarComanda, onUpdateLineNotes, onUpdateOrderNotes }: CommandCardProps) {
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

    // Agrupamiento de líneas: mismo nombre, notas y estado
    const groupedLines = (order.lineas || []).reduce((acc, line) => {
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
            className={`relative flex flex-col rounded-b-xl rounded-t-sm shadow-2xl transition-all duration-300 border-x border-b border-slate-300 bg-white ${
                openDropdownKey ? 'z-[100]' : 'z-auto'
            } ${isCompleted
                    ? 'opacity-60'
                    : isFullyDone
                        ? 'opacity-90'
                        : ''
                }`}
            style={{ marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '10px solid #cbd5e1' }}
        >
            {/* Cabecera coloreada (tonos más claros en alerta roja) */}
            <div className={`px-4 pb-2 flex justify-between items-start transition-colors duration-500 relative font-black rounded-t-sm ${isCompleted ? 'bg-slate-200 text-slate-600' : `${getIndicatorColor()} text-white`}`}>
                {isCompleted && (
                    <div className="absolute top-0 right-3 bg-white/50 px-2 py-1 rounded-b-md text-[10px] font-black uppercase tracking-[0.15em] text-slate-700">
                        FINALIZADA
                    </div>
                )}

                <div className="flex items-center gap-4 w-full pt-2">
                    {/* Mesa */}
                    <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm text-slate-900`}>
                        <span className="text-2xl sm:text-3xl font-black tracking-wide uppercase tabular-nums">
                            {(() => {
                                const mesaNum = parseInt(order.mesa || '');
                                if (!isNaN(mesaNum) && mesaNum > 1000) return '--';
                                return order.mesa || '--';
                            })()}
                        </span>
                    </div>

                    {/* Tiempo */}
                    <div className="flex flex-col items-end flex-1 pr-1 min-w-0">
                        <div className="flex items-center gap-1 text-right w-full justify-end opacity-95">
                            <span className="text-lg sm:text-xl font-black uppercase tracking-[0.12em] truncate">
                                {orderTime}
                            </span>
                        </div>
                        <div className="flex items-center gap-1 text-right w-full justify-end flex-wrap">
                            <span className="text-sm sm:text-base font-bold opacity-85 uppercase tracking-[0.1em]">
                                HACE {formatElapsed(elapsed)}
                            </span>
                            {order.origen_referencia && (
                                <>
                                    <span className="text-sm opacity-50 ml-1">•</span>
                                    <span className="text-sm sm:text-base font-bold opacity-80 uppercase tracking-[0.08em] ml-1 max-w-[12rem] truncate">
                                        {order.origen_referencia.replace(/^directo\s*-\s*/i, '').replace(/^directo-/i, '')}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Editar nota comanda */}
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
                        className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${isCompleted ? 'bg-slate-300/60 text-slate-600' : 'bg-white/10 hover:bg-white/15 text-white'}`}
                        title="Editar nota comanda"
                    >
                        <Image src="/icons/notas.png" alt="Notas" width={22} height={22} className="opacity-90" />
                    </button>
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
            <div className="flex-1 p-3 sm:p-4 space-y-2">
                {groupedArray.map((group) => {
                    const groupKey = group.ids.join(',');
                    const isDropdownOpen = openDropdownKey === groupKey;
                    const canInteract = !isCompleted && group.estado !== 'cancelado';

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
                                className={`group relative flex items-center p-3 sm:p-3.5 select-none transition-all duration-200 rounded-xl bg-white border border-slate-200 shadow-sm ${isCompleted
                                        ? 'opacity-40 cursor-default'
                                        : group.estado === 'terminado'
                                            ? 'hover:bg-slate-50 cursor-pointer opacity-70'
                                            : group.estado === 'cancelado'
                                                ? 'opacity-60 cursor-not-allowed rounded-lg'
                                                : 'hover:bg-slate-50 cursor-pointer active:scale-[0.98]'
                                    }`}
                            >
                                {/* Tick si no está pendiente */}
                                {group.estado !== 'pendiente' && (
                                    <div className={`w-11 h-11 sm:w-12 sm:h-12 shrink-0 flex items-center justify-center rounded-xl transition-all duration-300 mr-3 ${isCompleted ? 'bg-slate-200 text-slate-400' :
                                            group.estado === 'terminado' ? 'bg-green-500 text-white scale-110' :
                                                group.estado === 'cancelado' ? 'bg-slate-300 text-slate-500' :
                                                    'bg-slate-100 text-slate-400 border border-slate-300'
                                        }`}>
                                        {group.estado === 'cancelado' ? <X size={26} strokeWidth={3} /> : <CheckCircle size={26} strokeWidth={group.estado === 'terminado' ? 3 : 2} />}
                                    </div>
                                )}

                                <div className="flex-1 min-w-0 flex items-center justify-between">
                                    <div className="flex flex-col pr-1 min-w-0">
                                        <div className="flex items-start gap-2 min-w-0">
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
                                                className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${isCompleted ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                                title="Editar nota artículo"
                                            >
                                                <Image src="/icons/notas.png" alt="Notas" width={18} height={18} className="opacity-90" />
                                            </button>

                                            <span className={`flex-1 text-xl sm:text-2xl lg:text-3xl leading-tight font-bold tracking-[0.06em] transition-all duration-300 block truncate ${isCompleted ? 'text-slate-400 line-through' :
                                                group.estado === 'terminado' ? 'text-green-600/60 line-through decoration-2' :
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
                                            className={`shrink-0 flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 border-[3px] min-w-[3rem] transition-all duration-150 ${
                                                group.estado === 'terminado'
                                                    ? 'border-green-200 text-green-600 bg-green-50 cursor-default'
                                                    : canInteract && group.estado === 'pendiente' && group.cantidad > 1
                                                        ? 'border-slate-800 text-slate-900 bg-slate-50 cursor-pointer hover:bg-slate-200 active:scale-95'
                                                        : 'border-slate-800 text-slate-900 bg-slate-50 cursor-default'
                                            }`}
                                        >
                                            <span className="text-2xl sm:text-3xl font-black tracking-wide">{group.cantidad}</span>
                                            {canInteract && group.estado === 'pendiente' && group.cantidad > 1 && (
                                                <ChevronDown size={18} className={`transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} strokeWidth={2.5} />
                                            )}
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

            <div className="p-3 sm:p-4 border-t border-slate-100 rounded-b-xl">
                {isCompleted ? (
                    <button
                        onClick={() => onRecuperarComanda(order.id)}
                        className="w-full min-h-[52px] py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-base sm:text-lg uppercase tracking-[0.15em] transition-all duration-300 active:translate-y-1"
                    >
                        Restaurar
                    </button>
                ) : (
                    <button
                        onClick={() => onCompletarComanda(order.id)}
                        className={`w-full min-h-[52px] py-3 rounded-xl font-black text-base sm:text-lg uppercase tracking-[0.15em] transition-all duration-300 active:translate-y-1 ${isFullyDone
                                ? 'bg-green-100 text-green-700 hover:bg-green-200 border-2 border-green-300 shadow-sm'
                                : 'bg-slate-100/80 text-slate-400 hover:bg-slate-200/80'
                            }`}
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