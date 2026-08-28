'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, Check } from 'lucide-react';
import PremiumCountUp from '@/components/ui/PremiumCountUp';
import DashboardShortcut from '@/components/dashboards/DashboardShortcut';
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

function formatBoxEur(v: number) {
    if (Math.abs(v) <= 0.005) return ' ';
    if (Math.abs(v - Math.round(v)) < 0.005) return `${Math.round(v)}€`;
    return `${v.toFixed(2)}€`;
}

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

    const items: Array<{ key: string; node: ReactNode }> = [
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
                    plate
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
                    plate
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
                    plate
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
                    plate
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
                    plate
                    onClick={onOpenHorarios}
                />
            ),
        },
        {
            key: 'hextras',
            node: (
                <DashboardShortcut
                    instance="hextras"
                    label="H. extras"
                    plate
                    onClick={() => router.push('/dashboard/overtime')}
                >
                    <div className="flex items-center justify-center gap-1 w-full h-full">
                        {overtimeLoading ? (
                            <LoadingSpinner size="sm" className="text-purple-600" />
                        ) : overtimeSnapshot ? (
                            <>
                                {overtimeSnapshot.isFullyPaid ? (
                                    <div className="w-3 h-3 md:w-3.5 md:h-3.5 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm shrink-0">
                                        <Check className="w-2 h-2 md:w-2.5 md:h-2.5 text-white" strokeWidth={4} />
                                    </div>
                                ) : (
                                    <div className="w-3 h-3 md:w-3.5 md:h-3.5 rounded-full bg-rose-500 flex items-center justify-center shadow-sm shrink-0">
                                        <span className="text-white font-black text-[7px] leading-none">!</span>
                                    </div>
                                )}
                                <span className="text-sm md:text-[11px] font-black text-zinc-800 leading-none tabular-nums text-center">
                                    {overtimeSnapshot.total > 0.05 ? `${overtimeSnapshot.total.toFixed(0)}€` : ' '}
                                </span>
                            </>
                        ) : (
                            <span className="text-sm md:text-[11px] font-black text-zinc-300 leading-none"> </span>
                        )}
                    </div>
                </DashboardShortcut>
            ),
        },
        {
            key: 'plantilla',
            node: (
                <DashboardShortcut
                    instance="plantilla"
                    label="Plantilla"
                    img="/icons/admin.png"
                    plate
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
                    plate
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
                    plate
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
                    plate
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
                    plate
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
                    icon={BarChart3}
                    iconClassName="text-[#36606F]"
                    plate
                    onClick={() => router.push('/dashboard/uso')}
                />
            ),
        },
    ];

    if (changeBox1) {
        items.push({
            key: 'cambio-1',
            node: (
                <DashboardShortcut
                    instance="cambio-1"
                    label="Cambio 1"
                    plate
                    onClick={() => onOpenChangeBoxAudit(changeBox1)}
                >
                    <span className="text-sm md:text-[11px] font-black text-zinc-800 leading-none tabular-nums text-center">
                        {formatBoxEur(Number(changeBox1.current_balance ?? 0))}
                    </span>
                </DashboardShortcut>
            ),
        });
    }

    if (changeBox2) {
        items.push({
            key: 'cambio-2',
            node: (
                <DashboardShortcut
                    instance="cambio-2"
                    label="Cambio 2"
                    plate
                    onClick={() => onOpenChangeBoxAudit(changeBox2)}
                >
                    <span className="text-sm md:text-[11px] font-black text-zinc-800 leading-none tabular-nums text-center">
                        {formatBoxEur(Number(changeBox2.current_balance ?? 0))}
                    </span>
                </DashboardShortcut>
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
                plate
                onClick={() => router.push('/suppliers')}
            />
        ),
    });

    return (
        <div className="grid grid-cols-4 gap-x-7 gap-y-8 md:grid-cols-7 md:gap-x-7 md:gap-y-8 md:justify-items-center lg:grid-cols-8 lg:gap-x-8 lg:gap-y-8">
            {items.map(({ key, node }) => (
                <div key={key} className="min-h-0 min-w-0 w-full md:w-auto md:flex md:justify-center">
                    {node}
                </div>
            ))}
        </div>
    );
}
