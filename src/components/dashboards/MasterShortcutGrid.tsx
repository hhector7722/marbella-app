'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, Check, Smartphone } from 'lucide-react';
import PremiumCountUp from '@/components/ui/PremiumCountUp';
import DashboardIosIcon from '@/components/dashboards/DashboardIosIcon';
import type { OvertimeWeekSnapshot } from '@/lib/master-overtime-snapshot';
const WEB_URL = 'https://marbella-web.vercel.app';

type MasterShortcutGridProps = {
    actualBalance: number;
    changeBoxes: any[];
    overtimeSnapshot: OvertimeWeekSnapshot | null;
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
    overtimeSnapshot,
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
                <DashboardIosIcon
                    label="C INICIAL"
                    labelClassName="text-white/90"
                    contentClassName="w-full h-12 md:h-11 flex-none items-center justify-center"
                    onClick={() => router.push('/dashboard/movements')}
                    className="bg-emerald-600 shadow-md border-2 border-white"
                >
                    <PremiumCountUp
                        value={actualBalance}
                        suffix="€"
                        decimals={2}
                        className="block w-full text-center text-sm font-black leading-none text-white tabular-nums whitespace-nowrap md:text-[11px]"
                    />
                </DashboardIosIcon>
            ),
        },
        { key: 'asistencia', node: <DashboardIosIcon label="Asistencia" img="/icons/calendar.png" onClick={() => router.push('/staff/history')} /> },
        { key: 'recetas', node: <DashboardIosIcon label="Recetas" img="/icons/recipes.png" onClick={() => router.push('/recipes')} /> },
        { key: 'ingredientes', node: <DashboardIosIcon label="Ingredientes" img="/icons/ingrediente.png" onClick={() => router.push('/ingredients')} /> },
        { key: 'albaranes', node: <DashboardIosIcon label="Albaranes" img="/icons/scan.png" onClick={() => router.push('/dashboard/albaranes')} /> },
        { key: 'carta', node: <DashboardIosIcon label="Carta" img="/icons/menu.png" onClick={() => router.push('/staff/carta')} /> },
        { key: 'consumo', node: <DashboardIosIcon label="Consumo" img="/icons/consum.png" onClick={() => router.push('/dashboard/consumo-personal')} /> },
        {
            key: 'rentabilidad',
            node: (
                <DashboardIosIcon
                    label="Rentabilidad"
                    img="/icons/rent.png"
                    onClick={() => router.push('/dashboard/insights')}
                />
            ),
        },
        { key: 'horarios', node: <DashboardIosIcon label="Horarios" img="/icons/schedule.png" onClick={onOpenHorarios} /> },
        {
            key: 'hextras',
            node: (
                <DashboardIosIcon
                    label="H. extras"
                    contentClassName="w-12 h-12 md:w-11 md:h-11 flex-none"
                    onClick={() => router.push('/dashboard/overtime')}
                >
                    <div className="flex items-center justify-center gap-1 w-full h-full">
                        {overtimeSnapshot ? (
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
                </DashboardIosIcon>
            ),
        },
        { key: 'plantilla', node: <DashboardIosIcon label="Plantilla" img="/icons/admin.png" onClick={onOpenPlantilla} /> },
        { key: 'cierre', node: <DashboardIosIcon label="Cierre" img="/icons/lock.png" onClick={onOpenCierre} /> },
        { key: 'cambio', node: <DashboardIosIcon label="Cambio" img="/icons/change.png" onClick={onOpenCambio} /> },
        { key: 'web', node: <DashboardIosIcon label="Web" img="/icons/link.png" onClick={() => window.open(WEB_URL, '_blank', 'noopener,noreferrer')} /> },
        {
            key: 'reservas',
            node: (
                <DashboardIosIcon
                    label="Reservas"
                    img="/icons/reservas.png"
                    onClick={onOpenReservas}
                    badgeCount={pendingReservationsCount}
                />
            ),
        },
        { key: 'propinas', node: <DashboardIosIcon label="Propinas" img="/icons/tip.png" onClick={() => router.push('/dashboard/propinas')} /> },
        {
            key: 'instalacion-app',
            node: (
                <DashboardIosIcon
                    label="Apps"
                    icon={Smartphone}
                    iconClassName="text-[#36606F]"
                    onClick={() => router.push('/dashboard/instalacion-app')}
                />
            ),
        },
        {
            key: 'uso-app',
            node: (
                <DashboardIosIcon
                    label="Uso app"
                    icon={BarChart3}
                    iconClassName="text-[#36606F]"
                    onClick={() => router.push('/dashboard/uso')}
                />
            ),
        },
    ];

    if (changeBox1) {
        items.push({
            key: 'cambio-1',
            node: (
                <DashboardIosIcon label="Cambio 1" onClick={() => onOpenChangeBoxAudit(changeBox1)}>
                    <span className="text-sm md:text-[11px] font-black text-zinc-800 leading-none tabular-nums text-center">{formatBoxEur(Number(changeBox1.current_balance ?? 0))}</span>
                </DashboardIosIcon>
            ),
        });
    }

    if (changeBox2) {
        items.push({
            key: 'cambio-2',
            node: (
                <DashboardIosIcon label="Cambio 2" onClick={() => onOpenChangeBoxAudit(changeBox2)}>
                    <span className="text-sm md:text-[11px] font-black text-zinc-800 leading-none tabular-nums text-center">{formatBoxEur(Number(changeBox2.current_balance ?? 0))}</span>
                </DashboardIosIcon>
            ),
        });
    }

    items.push({
        key: 'proveedores',
        node: <DashboardIosIcon label="Proveedores" img="/icons/suplier.png" onClick={() => router.push('/suppliers')} />,
    });

    return (
        <div className="grid grid-cols-4 gap-3 md:grid-cols-7 md:gap-x-3 md:gap-y-2.5 md:justify-items-center lg:grid-cols-8 lg:gap-x-4 lg:gap-y-3">
            {items.map(({ key, node }) => (
                <div key={key} className="min-h-0 min-w-0 w-full md:w-auto md:flex md:justify-center">
                    {node}
                </div>
            ))}
        </div>
    );
}
