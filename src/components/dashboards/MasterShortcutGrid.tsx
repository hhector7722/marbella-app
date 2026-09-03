'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import PremiumCountUp from '@/components/ui/PremiumCountUp';
import DashboardShortcut from '@/components/dashboards/DashboardShortcut';
import { HomeScreenSlot } from '@/components/dashboards/HomeScreen';
import { CajaCambioWidget } from '@/components/dashboards/ops-widgets';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { OvertimeWeekSnapshot } from '@/lib/master-overtime-snapshot';

type MasterShortcutGridProps = {
    actualBalance: number;
    changeBoxes: any[];
    treasuryLoading?: boolean;
    overtimeSnapshot: OvertimeWeekSnapshot | null;
    overtimeLoading?: boolean;
    onOpenCambio: () => void;
    onOpenReservas: () => void;
    onOpenChangeBoxAudit: (box: any) => void;
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

export default function MasterShortcutGrid({
    actualBalance,
    changeBoxes,
    treasuryLoading = false,
    overtimeSnapshot,
    overtimeLoading = false,
    onOpenCambio,
    onOpenReservas,
    onOpenChangeBoxAudit,
    onOpenCajaInicialAcciones,
    onOpenOtros,
    pendingReservationsCount = 0,
}: MasterShortcutGridProps) {
    const router = useRouter();

    const changeBox1 = changeBoxes[0];
    const changeBox2 = changeBoxes[1];
    const overtimeAmount = overtimeSnapshot && overtimeSnapshot.total > 0.05
        ? overtimeSnapshot.total
        : null;

    const items: Array<{ key: string; size?: 'icon' | 'tile'; label?: string; node: ReactNode }> = [
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
                <button
                    type="button"
                    aria-label="H. extras"
                    onClick={() => router.push('/dashboard/overtime')}
                    className="flex h-full min-h-0 w-full items-center justify-center"
                >
                    {overtimeLoading ? (
                        <LoadingSpinner size="sm" className="text-zinc-500" />
                    ) : overtimeAmount != null ? (
                        <span className="text-sm font-black leading-none tabular-nums text-zinc-800">
                            {`${overtimeAmount.toFixed(0)}€`}
                        </span>
                    ) : (
                        <Check className="h-6 w-6 text-zinc-800" strokeWidth={2.5} aria-hidden />
                    )}
                </button>
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

    if (changeBox1) {
        items.push({
            key: 'cambio-1',
            size: 'tile',
            label: 'Cambio 1',
            node: (
                <CajaCambioWidget
                    title="Cambio 1"
                    idx={0}
                    treasuryLoading={treasuryLoading}
                    box={changeBox1}
                    onAudit={onOpenChangeBoxAudit}
                />
            ),
        });
    }

    if (changeBox2) {
        items.push({
            key: 'cambio-2',
            size: 'tile',
            label: 'Cambio 2',
            node: (
                <CajaCambioWidget
                    title="Cambio 2"
                    idx={1}
                    treasuryLoading={treasuryLoading}
                    box={changeBox2}
                    onAudit={onOpenChangeBoxAudit}
                />
            ),
        });
    }

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