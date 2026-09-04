'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { format, getISOWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import PremiumCountUp from '@/components/ui/PremiumCountUp';
import DashboardShortcut from '@/components/dashboards/DashboardShortcut';
import { HomeScreenSlot } from '@/components/dashboards/HomeScreen';
import { formatChangeBoxEur } from '@/components/dashboards/ops-widgets';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

type MasterShortcutGridProps = {
    actualBalance: number;
    changeBoxes: any[];
    treasuryLoading?: boolean;
    overtimeViewMonth: Date;
    overtimeWeeksData: any[];
    overtimeLoading?: boolean;
    onOpenCambio: () => void;
    onOpenOvertime: () => void;
    onOpenCajasCambio: () => void;
    onOpenReservas: () => void;
    onOpenCajaInicialAcciones: () => void;
    onOpenOtros: () => void;
    pendingReservationsCount?: number;
};

/**
 * Caja inicial Master — dos en uno (mismo lenguaje que el fichaje en turno de Staff).
 * Reparte solo el hueco del icono: el nombre «C Inicial» vive en la franja del slot.
 * Arriba: importe verde (movimientos). Abajo: Acción (menú Entrada/Salida/Compra/Arqueo).
 * Composición local del mosaico master; no es pieza de sistema.
 */
function CajaInicialControl({
    treasuryLoading,
    actualBalance,
    onOpenMovements,
    onOpenAcciones,
}: {
    treasuryLoading: boolean;
    actualBalance: number;
    onOpenMovements: () => void;
    onOpenAcciones: () => void;
}) {
    const iconButtonClassName =
        'relative touch-manipulation text-white transition-[filter] active:brightness-[0.99] ' +
        'before:absolute before:inset-0 before:-m-1 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-[\'\']';

    return (
        <div data-component="CajaInicialControl" data-layout="dual-stack" data-plate="fill">
            <div data-element="iconStack">
                <div data-element="iconWrap">
                    <button
                        type="button"
                        data-element="iconBox"
                        onClick={onOpenMovements}
                        aria-label="Caja inicial: ver movimientos"
                        className={iconButtonClassName}
                        style={{ ['--shortcut-fill' as string]: 'var(--color-positivo)' }}
                    >
                        <div
                            data-element="asset"
                            className="flex h-full w-full items-center justify-center bg-emerald-600"
                        >
                            {treasuryLoading ? (
                                <LoadingSpinner size="sm" className="text-white" />
                            ) : (
                                <PremiumCountUp
                                    value={actualBalance}
                                    suffix="€"
                                    decimals={2}
                                    className="text-sm font-black leading-none text-white tabular-nums whitespace-nowrap md:text-[11px]"
                                />
                            )}
                        </div>
                    </button>
                    <span data-element="rim" aria-hidden />
                </div>
                <div data-element="iconWrap">
                    <button
                        type="button"
                        data-element="iconBox"
                        onClick={onOpenAcciones}
                        aria-label="Caja inicial: acciones"
                        className={iconButtonClassName}
                        style={{ ['--shortcut-fill' as string]: '#f97316' }}
                    >
                        <div
                            data-element="asset"
                            className="flex h-full w-full items-center justify-center bg-gradient-to-b from-orange-500 to-orange-600"
                        >
                            <span className="text-[10px] font-black uppercase leading-none tracking-wide">
                                Acción
                            </span>
                        </div>
                    </button>
                    <span data-element="rim" aria-hidden />
                </div>
            </div>
        </div>
    );
}

/**
 * Cajas Cambio unificadas (Cambio 1 + Cambio 2): dos filas iguales con el
 * importe de cada caja, centradas en el ancho y alto de su fila.
 * Pulsar abre el selector de caja (desglose). Composición local del mosaico master.
 */
function MasterCajasCambioWidget({
    treasuryLoading,
    box1,
    box2,
    onOpen,
}: {
    treasuryLoading: boolean;
    box1: any | undefined;
    box2: any | undefined;
    onOpen: () => void;
}) {
    return (
        <button
            type="button"
            aria-label="Cajas Cambio"
            onClick={onOpen}
            className="flex h-full min-h-0 w-full flex-col"
        >
            {treasuryLoading ? (
                <div className="flex h-full items-center justify-center" role="status" aria-label="Cargando cajas">
                    <LoadingSpinner size="sm" className="text-zinc-500" />
                </div>
            ) : (
                <>
                    <div className="flex min-h-0 flex-1 items-center justify-center">
                        <span className="text-sm font-black leading-none tabular-nums text-zinc-800">
                            {box1 ? formatChangeBoxEur(Number(box1.current_balance ?? 0)) : ' '}
                        </span>
                    </div>
                    <div className="flex min-h-0 flex-1 items-center justify-center">
                        <span className="text-sm font-black leading-none tabular-nums text-zinc-800">
                            {box2 ? formatChangeBoxEur(Number(box2.current_balance ?? 0)) : ' '}
                        </span>
                    </div>
                </>
            )}
        </button>
    );
}

/**
 * Horas extra del mes: mes actual en cabecera y una fila por semana completada.
 * Cada fila: número de semana, importe y estado de pago (rojo = falta, verde = pagado).
 * Pulsar abre el modal de horas extras (mismo widget que el dashboard).
 * Composición local del mosaico master; no es pieza de sistema.
 */
function MasterOvertimeIconWidget({
    monthLabel,
    weeks,
    loading,
    onOpen,
}: {
    monthLabel: string;
    weeks: any[];
    loading: boolean;
    onOpen: () => void;
}) {
    return (
        <button
            type="button"
            aria-label="Horas extras"
            onClick={onOpen}
            className="flex h-full min-h-0 w-full flex-col items-stretch px-0.5"
        >
            {loading ? (
                <div className="flex h-full items-center justify-center" role="status" aria-label="Cargando horas extras">
                    <LoadingSpinner size="sm" className="text-zinc-500" />
                </div>
            ) : (
                <>
                    <span className="shrink-0 text-center text-[6px] font-black uppercase leading-none tracking-widest text-zinc-700">
                        {monthLabel}
                    </span>
                    <div className="flex min-h-0 flex-1 flex-col justify-center gap-[3px] pt-1">
                        {weeks.map((week) => {
                            const isFullyPaid = (week.staff ?? []).every((s: any) => {
                                const cost = s.totalCost ?? s.amount ?? 0;
                                return cost < 0.05 || !!s.isPaid || s.preferStock === true;
                            });
                            const weekTotal = week.totalAmount ?? week.total ?? 0;
                            return (
                                <div
                                    key={week.weekId}
                                    className="flex w-full min-w-0 items-center justify-between gap-1"
                                >
                                    <span className="shrink-0 text-[8px] font-black leading-none tabular-nums text-zinc-800">
                                        {getISOWeek(new Date(week.weekId))}
                                    </span>
                                    <span className="shrink-0 text-[8px] font-normal leading-none tabular-nums text-zinc-600">
                                        {weekTotal > 0.05 ? `${weekTotal.toFixed(0)}€` : ' '}
                                    </span>
                                    <span className="flex shrink-0 items-center">
                                        {isFullyPaid ? (
                                            <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-emerald-500 shadow-sm">
                                                <Check className="h-1.5 w-1.5 text-white" strokeWidth={4} />
                                            </span>
                                        ) : (
                                            <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-rose-500 shadow-sm">
                                                <X className="h-1.5 w-1.5 text-white" strokeWidth={3.5} />
                                            </span>
                                        )}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </button>
    );
}

export default function MasterShortcutGrid({
    actualBalance,
    changeBoxes,
    treasuryLoading = false,
    overtimeViewMonth,
    overtimeWeeksData,
    overtimeLoading = false,
    onOpenCambio,
    onOpenOvertime,
    onOpenCajasCambio,
    onOpenReservas,
    onOpenCajaInicialAcciones,
    onOpenOtros,
    pendingReservationsCount = 0,
}: MasterShortcutGridProps) {
    const router = useRouter();

    const changeBox1 = changeBoxes[0];
    const changeBox2 = changeBoxes[1];
    const overtimeMonthLabel = format(overtimeViewMonth, 'MMMM', { locale: es });

    const items: Array<{ key: string; size?: 'icon' | 'tile' | 'half'; label?: string; node: ReactNode }> = [
        {
            key: 'caja-inicial',
            label: 'C Inicial',
            node: (
                <CajaInicialControl
                    treasuryLoading={treasuryLoading}
                    actualBalance={actualBalance}
                    onOpenMovements={() => router.push('/dashboard/movements')}
                    onOpenAcciones={onOpenCajaInicialAcciones}
                />
            ),
        },
        {
            key: 'ingredientes',
            node: (
                <DashboardShortcut
                    instance="ingredientes"
                    label="Ingredientes"
                    img="/icons/ingrediente.png"
                    onClick={() => router.push('/ingredients')}
                />
            ),
        },
        {
            key: 'albaranes',
            node: (
                <DashboardShortcut
                    instance="albaranes"
                    label="Albaranes"
                    img="/icons/scan.png"
                    onClick={() => router.push('/dashboard/albaranes')}
                />
            ),
        },
        {
            key: 'cambio',
            node: (
                <DashboardShortcut
                    instance="cambio"
                    label="Cambio"
                    img="/icons/change.png"
                    onClick={onOpenCambio}
                />
            ),
        },
        {
            key: 'hextras',
            size: 'tile',
            label: 'H. extras',
            node: (
                <MasterOvertimeIconWidget
                    monthLabel={overtimeMonthLabel}
                    weeks={overtimeWeeksData}
                    loading={overtimeLoading}
                    onOpen={onOpenOvertime}
                />
            ),
        },
        {
            key: 'reservas',
            node: (
                <DashboardShortcut
                    instance="reservas"
                    label="Reservas"
                    img="/icons/reservas.png"
                    onClick={onOpenReservas}
                    badgeCount={pendingReservationsCount}
                />
            ),
        },
        {
            key: 'uso-app',
            node: (
                <DashboardShortcut
                    instance="uso-app"
                    label="Uso app"
                    img="/icons/uso.png"
                    onClick={() => router.push('/dashboard/uso')}
                />
            ),
        },
        {
            key: 'otros',
            node: (
                <DashboardShortcut
                    instance="master-otros"
                    label="Otros"
                    img="/icons/more.png"
                    onClick={onOpenOtros}
                />
            ),
        },
    ];

    items.push({
        key: 'cajas-cambio',
        size: 'half',
        label: 'Cajas Cambio',
        node: (
            <MasterCajasCambioWidget
                treasuryLoading={treasuryLoading}
                box1={changeBox1}
                box2={changeBox2}
                onOpen={onOpenCajasCambio}
            />
        ),
    });

    return (
        <>
            {items.map(({ key, size = 'icon', label, node }) => (
                <HomeScreenSlot key={key} size={size} instance={key} label={label}>
                    {node}
                </HomeScreenSlot>
            ))}
        </>
    );
}