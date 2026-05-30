'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import PremiumCountUp from '@/components/ui/PremiumCountUp';
import DashboardIosIcon from '@/components/dashboards/DashboardIosIcon';

const WEB_URL = 'https://marbella-web.vercel.app';

type MasterShortcutGridProps = {
    actualBalance: number;
    changeBoxes: any[];
    onOpenPedidos: () => void;
    onOpenCambio: () => void;
    onOpenReservas: () => void;
    onOpenHorarios: () => void;
    onOpenPlantilla: () => void;
    onOpenCierre: () => void;
    onOpenChangeBoxAudit: (box: any) => void;
};

function formatBoxEur(v: number) {
    if (Math.abs(v) <= 0.005) return ' ';
    if (Math.abs(v - Math.round(v)) < 0.005) return `${Math.round(v)}€`;
    return `${v.toFixed(2)}€`;
}

export default function MasterShortcutGrid({
    actualBalance,
    changeBoxes,
    onOpenPedidos,
    onOpenCambio,
    onOpenReservas,
    onOpenHorarios,
    onOpenPlantilla,
    onOpenCierre,
    onOpenChangeBoxAudit,
}: MasterShortcutGridProps) {
    const router = useRouter();

    const changeBox1 = changeBoxes[0];
    const changeBox2 = changeBoxes[1];

    const items: Array<{ key: string; node: ReactNode }> = [
        {
            key: 'caja-inicial',
            node: (
                <DashboardIosIcon
                    label="Caja Inicial"
                    labelClassName="text-white/90"
                    onClick={() => router.push('/dashboard/movements')}
                    className="border-emerald-700/20 bg-emerald-600 shadow-md border-0"
                >
                    <PremiumCountUp value={actualBalance} suffix="€" decimals={2} className="text-sm md:text-[11px] font-black text-white leading-none tabular-nums text-center" />
                </DashboardIosIcon>
            ),
        },
        { key: 'asistencia', node: <DashboardIosIcon label="Asistencia" img="/icons/calendar.png" onClick={() => router.push('/staff/history')} /> },
        { key: 'recetas', node: <DashboardIosIcon label="Recetas" img="/icons/recipes.png" onClick={() => router.push('/recipes')} /> },
        { key: 'ingredientes', node: <DashboardIosIcon label="Ingredientes" img="/icons/ingrediente.png" onClick={() => router.push('/ingredients')} /> },
        { key: 'albaranes', node: <DashboardIosIcon label="Albaranes" img="/icons/scan.png" onClick={() => router.push('/dashboard/albaranes')} /> },
        { key: 'pedidos', node: <DashboardIosIcon label="Pedidos" img="/icons/suppliers.png" onClick={onOpenPedidos} /> },
        { key: 'carta', node: <DashboardIosIcon label="Carta" img="/icons/menu.png" onClick={() => router.push('/staff/carta')} /> },
        { key: 'consumo', node: <DashboardIosIcon label="Consumo" img="/icons/consum.png" onClick={() => router.push('/dashboard/consumo-personal')} /> },
        { key: 'horarios', node: <DashboardIosIcon label="Horarios" img="/icons/schedule.png" onClick={onOpenHorarios} /> },
        { key: 'hextras', node: <DashboardIosIcon label="H. extras" img="/icons/overtime.png" onClick={() => router.push('/dashboard/overtime')} /> },
        { key: 'plantilla', node: <DashboardIosIcon label="Plantilla" img="/icons/admin.png" onClick={onOpenPlantilla} /> },
        { key: 'cierre', node: <DashboardIosIcon label="Cierre" img="/icons/lock.png" onClick={onOpenCierre} /> },
        { key: 'cambio', node: <DashboardIosIcon label="Cambio" img="/icons/change.png" onClick={onOpenCambio} /> },
        { key: 'web', node: <DashboardIosIcon label="Web" img="/icons/web.png" onClick={() => window.open(WEB_URL, '_blank', 'noopener,noreferrer')} /> },
        { key: 'reservas', node: <DashboardIosIcon label="Reservas" img="/icons/reservas.png" onClick={onOpenReservas} /> },
        { key: 'propinas', node: <DashboardIosIcon label="Propinas" img="/icons/change.png" onClick={() => router.push('/dashboard/propinas')} /> },
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
