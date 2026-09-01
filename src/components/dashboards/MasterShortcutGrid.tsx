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

const WEB_URL = 'https://marbella-web.vercel.app';

type MasterShortcutGridProps = {
    actualBalance: number;
    changeBoxes: any[];
    treasuryLoading?: boolean;
    overtimeSnapshot: OvertimeWeekSnapshot | null;
    overtimeLoading?: boolean;
    onOpenCambio: () => void;
    onOpenReservas: () => void;
    onOpenHorarios: () => void;
    onOpenPlantilla: () => void;
    onOpenCierre: () => void;
    onOpenChangeBoxAudit: (box: any) => void;
    pendingReservationsCount?: number;
};

export default function MasterShortcutGrid({
    actualBalance,
    changeBoxes,
    treasuryLoading = false,
    overtimeSnapshot,
    overtimeLoading = false,
    onOpenCambio,
    onOpenReservas,
    onOpenHorarios,
    onOpenPlantilla,
    onOpenCierre,
    onOpenChangeBoxAudit,
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
            node: (
                <DashboardShortcut
                    instance="caja-inicial"
                    label="C INICIAL"
                    plate
                    contentClassName="bg-emerald-600"
                    onClick={() => router.push('/dashboard/movements')}
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
                </DashboardShortcut>
            ),
        },
        {
            key: 'asistencia',
            node: (
                <DashboardShortcut
                    instance="asistencia"
                    label="Asistencia"
                    img="/icons/calendar.png"
                    onClick={() => router.push('/staff/history')}
                />
            ),
        },
        {
            key: 'recetas',
            node: (
                <DashboardShortcut
                    instance="recetas"
                    label="Recetas"
                    img="/icons/recipes.png"
                    onClick={() => router.push('/recipes')}
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
            key: 'carta',
            node: (
                <DashboardShortcut
                    instance="carta"
                    label="Carta"
                    img="/icons/menu.png"
                    onClick={() => router.push('/staff/carta')}
                />
            ),
        },
        {
            key: 'consumo',
            node: (
                <DashboardShortcut
                    instance="consumo"
                    label="Consumo"
                    img="/icons/consum.png"
                    onClick={() => router.push('/dashboard/consumo-personal')}
                />
            ),
        },
        {
            key: 'rentabilidad',
            node: (
                <DashboardShortcut
                    instance="rentabilidad"
                    label="Rentabilidad"
                    img="/icons/rent.png"
                    onClick={() => router.push('/dashboard/insights')}
                />
            ),
        },
        {
            key: 'horarios',
            node: (
                <DashboardShortcut
                    instance="horarios"
                    label="Horarios"
                    img="/icons/schedule.png"
                    onClick={onOpenHorarios}
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
            key: 'plantilla',
            node: (
                <DashboardShortcut
                    instance="plantilla"
                    label="Plantilla"
                    img="/icons/admin.png"
                    onClick={onOpenPlantilla}
                />
            ),
        },
        {
            key: 'cierre',
            node: (
                <DashboardShortcut
                    instance="cierre"
                    label="Cierre"
                    img="/icons/lock.png"
                    onClick={onOpenCierre}
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
            key: 'web',
            node: (
                <DashboardShortcut
                    instance="web"
                    label="Web"
                    img="/icons/link.png"
                    plate
                    onClick={() => window.open(WEB_URL, '_blank', 'noopener,noreferrer')}
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
            key: 'propinas',
            node: (
                <DashboardShortcut
                    instance="propinas"
                    label="Propinas"
                    img="/icons/tip.png"
                    onClick={() => router.push('/dashboard/propinas')}
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

    items.push({
        key: 'proveedores',
        node: (
            <DashboardShortcut
                instance="proveedores"
                label="Proveedores"
                img="/icons/suplier.png"
                onClick={() => router.push('/suppliers')}
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
