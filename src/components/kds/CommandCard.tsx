"use client";

import { useEffect, useState, useRef, useMemo } from 'react';
import Image from 'next/image';
import { KDSOrder, KDSItemStatus } from './types';
import { parseDBDate, formatLocalTimeKdsHeader } from '@/utils/date-utils';
import { NotesModal } from './NotesModal';
import { combinedLineNotesForDisplay } from './combined-line-notes';
import { KdsMesaNumber } from './KdsMesaNumber';
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
    /** Vista listado finalizadas: misma opacidad que pendientes; sin icono notas ni X en líneas */
    completedListView?: boolean;
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
    const input = String(raw).trim();
    if (!input) return [];

    const stripWrappers = (s: string) => {
        let out = s.trim();
        // Quitar wrappers redundantes comunes
        out = out.replace(/^\(+/, '').replace(/\)+$/, '').trim();
        out = out.replace(/^"+/, '').replace(/"+$/, '').trim();
        out = out.replace(/^'+/, '').replace(/'+$/, '').trim();
        // Evitar bullets duplicados o prefijos típicos
        out = out.replace(/^[·•\-–—]\s*/g, '').trim();
        return out;
    };

    const normalizePieces = (pieces: string[]) =>
        pieces
            .map((p) => stripWrappers(p))
            .flatMap((p) => p.split('\n').map((x) => stripWrappers(x)))
            .map((p) => p.trim())
            .filter(Boolean);

    // Caso 1: JSON array string: ["A","B"]
    if (input.startsWith('[') && input.endsWith(']')) {
        try {
            const parsed = JSON.parse(input);
            if (Array.isArray(parsed)) return normalizePieces(parsed.map((x) => String(x)));
        } catch {
            // fallback abajo
        }
    }

    // Caso 2: Postgres text[] estilo {A,B} o {"A","B"}
    if (input.startsWith('{') && input.endsWith('}')) {
        const inner = input.slice(1, -1).trim();
        if (!inner) return [];
        return normalizePieces(
            inner
                .split(',')
                .map((x) => x.trim())
        );
    }

    // Caso 3: lista bracketed sin JSON válido: [A, B]
    if (input.startsWith('[') && input.endsWith(']')) {
        const inner = input.slice(1, -1).trim();
        if (!inner) return [];
        return normalizePieces(inner.split(',').map((x) => x.trim()));
    }

    // Caso 4: texto normal con saltos de línea
    return normalizePieces(input.split('\n'));
}

function firstTwoWords(raw: string | null | undefined) {
    const v = (raw ?? '').trim();
    if (!v) return '';
    // Colapsar espacios y partir por whitespace.
    const parts = v.replace(/\s+/g, ' ').split(' ').filter(Boolean);
    return parts.slice(0, 2).join(' ');
}

export function CommandCard({
    order,
    onTacharProductos,
    onCompletarComanda,
    onRecuperarComanda,
    onUpdateLineNotes,
    onUpdateOrderNotes,
    kdsRailAttached = false,
    completedListView = false,
}: CommandCardProps) {
    const [elapsed, setElapsed] = useState<number>(0);
    // Clave del grupo cuyo dropdown de unidades está abierto (null = ninguno)
    const [openDropdownKey, setOpenDropdownKey] = useState<string | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const isCompleted = order.estado === 'completada';
    /** Atenuación “comanda cerrada” solo en vista pendientes; en finalizadas se ve a opacidad plena */
    const chromeCompleted = isCompleted && !completedListView;
    /** Mantiene el hueco del botón notas al tachar para que el nombre no se desplace horizontalmente */
    const reserveLineNotesSlot = !completedListView && !chromeCompleted;

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
        if (minutes < 0) return '0 H 0 M';
        if (minutes < 60) return `0 H ${minutes} M`;
        const hrs = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hrs} H ${mins} M`;
    };

    const getElapsedTextColor = () => {
        if (chromeCompleted) return 'text-slate-500';
        // Aust: 0–15 negro, 16–25 naranja, ≥26 rojo
        if (elapsed >= 26) return 'text-rose-700';
        if (elapsed >= 16) return 'text-orange-600';
        return 'text-black';
    };

    const orderTime = formatLocalTimeKdsHeader(new Date(effectiveStart));
    const mesaDisplay = (() => {
        const mesaNum = parseInt(order.mesa || '');
        if (!isNaN(mesaNum) && mesaNum > 1000) return '--';
        return order.mesa || '--';
    })();
    const isFullyDone =
        (order.lineas?.length || 0) > 0 && order.lineas?.every((l) => l.estado === 'terminado' || l.estado === 'cancelado');

    // Todas las líneas visibles: pendientes, tachadas (terminado) y canceladas.
    const lineasVisibles = order.lineas || [];

    // Agrupamiento: nombre + notas TPV + notas cocina + estado (notas_cocina no entra en delta TPV)
    const groupedLines = useMemo(() => {
        return lineasVisibles.reduce((acc, line) => {
            const key = `${line.producto_nombre}_${line.notas || ''}_${line.notas_cocina || ''}_${line.estado}`;
            if (!acc[key]) {
                acc[key] = {
                    ids: [line.id],
                    producto_nombre: line.producto_nombre,
                    notas: line.notas,
                    notas_cocina: line.notas_cocina ?? null,
                    estado: line.estado,
                    cantidad: 1
                };
            } else {
                acc[key].ids.push(line.id);
                acc[key].cantidad++;
            }
            return acc;
        }, {} as Record<string, { ids: string[]; producto_nombre: string; notas: string | null; notas_cocina: string | null; estado: KDSItemStatus; cantidad: number }>);
    }, [lineasVisibles]);

    /** Orden estable por posición en ticket: al tachar no “salta” de fila por orden de inserción en el objeto. */
    const groupedArray = useMemo(() => {
        const groups = Object.values(groupedLines);
        const lineIndexById = new Map(lineasVisibles.map((l, i) => [l.id, i]));
        return [...groups].sort((a, b) => {
            const minA = Math.min(...a.ids.map((id) => lineIndexById.get(id) ?? Number.MAX_SAFE_INTEGER));
            const minB = Math.min(...b.ids.map((id) => lineIndexById.get(id) ?? Number.MAX_SAFE_INTEGER));
            return minA - minB;
        });
    }, [groupedLines, lineasVisibles]);

    return (
        <>
            <div
            ref={cardRef}
            className={cn(
                'relative flex flex-col overflow-hidden rounded-b-xl bg-white w-full min-w-0 sm:w-fit sm:max-w-[min(100vw-2rem,48rem)] border-[0.5px] border-black shadow-[0_12px_40px_rgba(0,0,0,0.18)] transition-all duration-300',
                openDropdownKey ? 'z-[100]' : 'z-auto',
                chromeCompleted ? 'opacity-60' : isFullyDone ? 'opacity-90' : '',
                !kdsRailAttached && 'mt-2'
            )}
        >
            {/* Cabecera aust: fondo blanco, mesa centrada sin contorno, notas+cliente izq, hora+tiempo dcha */}
            <div
                className={cn(
                    'px-3 sm:px-4 pb-2 pt-2 flex items-start transition-colors duration-500 relative font-black w-full min-w-0',
                    chromeCompleted ? 'bg-slate-50 text-slate-600' : 'bg-white text-black'
                )}
            >
                {chromeCompleted && (
                    <div className="absolute top-0 right-3 bg-white/50 px-2 py-1 rounded-b-md text-[10px] font-black uppercase tracking-[0.15em] text-slate-700">
                        FINALIZADA
                    </div>
                )}

                <div className="relative flex w-full min-w-0 items-start gap-2 sm:gap-3">
                    {/* Izquierda: notas comanda + cliente */}
                    <div className="flex min-w-0 flex-1 flex-col items-start justify-start gap-1 pt-0.5">
                        <div className="flex items-start gap-2 min-w-0">
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
                                className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 min-h-[48px] min-w-[48px] sm:min-h-[48px] sm:min-w-[48px] flex items-center justify-center bg-transparent border-0 p-0 shadow-none hover:opacity-90 active:scale-95 transition"
                                title="Editar nota comanda"
                            >
                                <Image
                                    src="/icons/notas.png"
                                    alt="Notas"
                                    width={34}
                                    height={34}
                                    className={cn(chromeCompleted ? 'opacity-45' : 'opacity-90', 'drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]')}
                                />
                            </button>
                            <div className="min-w-0 flex-1">
                                {hasNotes(order.notas_comanda) ? (
                                    <div className={cn('text-xs sm:text-sm font-black uppercase tracking-[0.1em] leading-snug text-slate-700', chromeCompleted && 'text-slate-500')}>
                                        {splitBullets(order.notas_comanda)[0] ?? ' '}
                                    </div>
                                ) : (
                                    <div className="text-xs sm:text-sm font-black uppercase tracking-[0.1em] leading-snug text-slate-400">
                                        {' '}
                                    </div>
                                )}
                                {firstTwoWords(order.nombre_cliente) ? (
                                    <div className={cn('text-2xl sm:text-3xl font-black uppercase tracking-[0.06em] leading-none text-slate-900 truncate', chromeCompleted && 'text-slate-500')}>
                                        {firstTwoWords(order.nombre_cliente)}
                                    </div>
                                ) : (
                                    <div className="text-2xl sm:text-3xl font-black uppercase tracking-[0.06em] leading-none text-slate-300">
                                        {' '}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Centro: mesa grande sin contorno */}
                    <div className="flex min-w-0 shrink-0 flex-col items-center justify-start pt-0">
                        <KdsMesaNumber value={mesaDisplay} isCompleted={chromeCompleted} variant="plain" />
                    </div>

                    {/* Derecha: hora + indicador (color por tiempo) */}
                    <div className="flex min-w-0 flex-1 flex-col items-end justify-start gap-1 pt-1 text-right">
                        <div className={cn('text-sm sm:text-base font-black uppercase tracking-[0.12em] leading-none text-slate-600', chromeCompleted && 'text-slate-500')}>
                            {orderTime}
                        </div>
                        <div className={cn('text-sm sm:text-base font-black uppercase tracking-[0.12em] leading-none tabular-nums', getElapsedTextColor())}>
                            {formatElapsed(elapsed)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Notas comanda completas se editan en modal; en aust se muestran como preview en cabecera */}

            {/* Lista de Líneas */}
            <div className="flex-1 space-y-2 px-0 py-2 sm:py-3">
                {groupedArray.map((group, lineIndex) => {
                    const groupKey = group.ids.join(',');
                    const isDropdownOpen = openDropdownKey === groupKey;
                    const canInteract = !isCompleted && group.estado !== 'cancelado';
                    const isLastLine = lineIndex === groupedArray.length - 1;
                    const showLineNotesButton = !completedListView && !chromeCompleted && group.estado === 'pendiente';

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
                                className={`group relative flex items-center ${completedListView ? 'pl-3 sm:pl-4' : 'pl-0'} pr-3 py-3 sm:py-3.5 select-none transition-all duration-200 rounded-xl ${group.estado === 'cancelado' ? 'bg-transparent' : 'bg-white/95'} ${group.estado === 'cancelado' || isLastLine ? 'shadow-none' : 'shadow-sm'} ${chromeCompleted
                                        ? 'opacity-40 cursor-default'
                                        : group.estado === 'terminado'
                                            ? 'hover:bg-emerald-50/80 cursor-pointer'
                                            : group.estado === 'cancelado'
                                                ? 'opacity-70 cursor-not-allowed'
                                                : 'hover:bg-slate-50 cursor-pointer active:scale-[0.98]'
                                    }`}
                            >
                                <div className="flex-1 min-w-0 flex items-center justify-between">
                                    <div className="flex flex-col pr-1 min-w-0">
                                        <div className="flex items-center gap-0 min-w-0">
                                            {showLineNotesButton ? (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setNotesModal({
                                                            kind: 'lineGroup',
                                                            title: group.producto_nombre,
                                                            subtitle: `Mesa ${order.mesa || '--'}`,
                                                            initialNotes: group.notas_cocina,
                                                            lineIds: group.ids,
                                                        });
                                                    }}
                                                    className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 min-h-[48px] min-w-[48px] sm:min-h-[48px] sm:min-w-[48px] flex items-center justify-center bg-transparent border-0 p-0 shadow-none hover:opacity-90 active:scale-95 transition"
                                                    title="Editar nota artículo"
                                                >
                                                    <Image src="/icons/notas.png" alt="Notas" width={34} height={34} className={`${chromeCompleted ? 'opacity-45' : 'opacity-90'} drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]`} />
                                                </button>
                                            ) : reserveLineNotesSlot ? (
                                                <div
                                                    className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 min-h-[48px] min-w-[48px] sm:min-h-[48px] sm:min-w-[48px]"
                                                    aria-hidden
                                                />
                                            ) : null}

                                            <span
                                                className={`flex-1 min-w-0 text-xl sm:text-2xl lg:text-3xl leading-tight font-bold tracking-[0.06em] transition-all duration-300 block truncate ${
                                                    chromeCompleted
                                                        ? 'text-slate-400 line-through'
                                                        : group.estado === 'terminado'
                                                            ? 'text-emerald-700 line-through decoration-emerald-700 decoration-2 [text-decoration-thickness:2px]'
                                                            : group.estado === 'cancelado'
                                                                ? 'text-red-700 line-through decoration-red-700 decoration-2 [text-decoration-thickness:2px]'
                                                                : 'text-slate-900'
                                                }`}
                                            >
                                            {group.producto_nombre}
                                            </span>
                                        </div>

                                        {hasNotes(combinedLineNotesForDisplay(group.notas, group.notas_cocina)) && (
                                            <div
                                                className={`mt-0.5 space-y-1 ${completedListView ? 'pl-3 sm:pl-4' : reserveLineNotesSlot ? 'pl-12 sm:pl-14' : 'pl-3 sm:pl-4'} ${
                                                    group.estado === 'cancelado' || chromeCompleted ? 'opacity-50' : ''
                                                }`}
                                            >
                                                {splitBullets(combinedLineNotesForDisplay(group.notas, group.notas_cocina)).map((n, idx) => (
                                                    <div key={idx} className="flex items-baseline gap-1.5">
                                                        <span className="shrink-0 text-base sm:text-lg font-bold leading-snug text-rose-700" aria-hidden>
                                                            ·
                                                        </span>
                                                        <span className="min-w-0 flex-1 text-base sm:text-lg font-bold leading-snug text-rose-700 tracking-wide break-words not-italic">
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
                                            className={`shrink-0 flex items-center justify-center rounded-lg px-2.5 py-1.5 border-[4px] min-w-[3rem] transition-all duration-150 ${
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
                        Recuperar
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => onCompletarComanda(order.id, order.id_ticket ?? null)}
                        className={cn(
                            'w-full min-h-[52px] rounded-none px-3 py-3 sm:px-4 font-black text-base sm:text-lg uppercase tracking-[0.15em] transition-all duration-300 active:translate-y-1',
                            isFullyDone
                                ? 'bg-emerald-200/70 text-emerald-950 hover:bg-emerald-200/90'
                                : 'bg-slate-200/90 text-slate-500 hover:bg-slate-300/90'
                        )}
                    >
                        Finalizar
                    </button>
                )}
            </div>

            <style jsx>{`
        @keyframes pulse-critical {
          0%, 100% { background-color: #D56170; }
          50% { background-color: #C55462; }
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