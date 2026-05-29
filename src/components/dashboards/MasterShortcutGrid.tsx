'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import PremiumCountUp from '@/components/ui/PremiumCountUp';
import DashboardIosIcon from '@/components/dashboards/DashboardIosIcon';
import { cn } from '@/lib/utils';

const WEB_URL = 'https://marbella-web.vercel.app';

type MasterShortcutGridProps = {
    actualBalance: number;
    changeBoxes: any[];
    onOpenPedidos: () => void;
    onOpenCambio: () => void;
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
                    onClick={() => router.push('/dashboard/movements')}
                    className="border-emerald-700/20 bg-emerald-600 shadow-md border-0"
                >
                    <div className="flex flex-col items-center justify-center gap-0.5 w-full">
                        <PremiumCountUp value={actualBalance} suffix="€" decimals={2} className="text-sm md:text-base font-black text-white leading-none tabular-nums" />
                        <span className="text-[8px] md:text-[9px] font-black uppercase tracking-wider text-white/80 text-center leading-tight">Caja Inicial</span>
                    </div>
                </DashboardIosIcon>
            ),
        },
        { key: 'asistencia', node: <DashboardIosIcon label="Asistencia" img="/icons/calendar.png" onClick={() => router.push('/staff/history')} /> },
        { key: 'recetas', node: <DashboardIosIcon label="Recetas" img="/icons/recipes.png" onClick={() => router.push('/recipes')} /> },
        { key: 'ingredientes', node: <DashboardIosIcon label="Ingredientes" img="/icons/suppliers.png" onClick={() => router.push('/ingredients')} /> },
        { key: 'albaranes', node: <DashboardIosIcon label="Albaranes" img="/icons/shipment.png" onClick={() => router.push('/dashboard/albaranes')} /> },
        { key: 'pedidos', node: <DashboardIosIcon label="Pedidos" img="/icons/suppliers.png" onClick={onOpenPedidos} /> },
        { key: 'carta', node: <DashboardIosIcon label="Carta" img="/icons/menu.png" onClick={() => router.push('/dashboard/carta')} /> },
        { key: 'consumo', node: <DashboardIosIcon label="Consumo" img="/icons/change.png" onClick={() => router.push('/dashboard/consumo-personal')} /> },
        { key: 'horarios', node: <DashboardIosIcon label="Horarios" img="/icons/calendar.png" onClick={() => router.push('/staff/schedule')} /> },
        { key: 'hextras', node: <DashboardIosIcon label="H. extras" img="/icons/overtime.png" onClick={() => router.push('/dashboard/overtime')} /> },
        { key: 'plantilla', node: <DashboardIosIcon label="Plantilla" img="/icons/admin.png" onClick={() => router.push('/staff')} /> },
        { key: 'cierre', node: <DashboardIosIcon label="Cierre" img="/icons/lock.png" onClick={() => router.push('/dashboard/history')} /> },
        { key: 'cambio', node: <DashboardIosIcon label="Cambio" img="/icons/change.png" onClick={onOpenCambio} /> },
        { key: 'web', node: <DashboardIosIcon label="Web" img="/icons/web.png" onClick={() => window.open(WEB_URL, '_blank', 'noopener,noreferrer')} /> },
        { key: 'reservas', node: <DashboardIosIcon label="Reservas" img="/icons/reservas.png" onClick={() => router.push('/staff/reservas')} /> },
        { key: 'propinas', node: <DashboardIosIcon label="Propinas" img="/icons/change.png" onClick={() => router.push('/dashboard/propinas')} /> },
    ];

    if (changeBox1) {
        items.push({
            key: 'cambio-1',
            node: (
                <DashboardIosIcon label="Cambio 1" onClick={() => onOpenChangeBoxAudit(changeBox1)}>
                    <div className="flex flex-col items-center justify-center gap-0.5 w-full">
                        <span className={cn('text-sm md:text-base font-black text-zinc-800 leading-none tabular-nums')}>{formatBoxEur(Number(changeBox1.current_balance ?? 0))}</span>
                        <span className="text-[8px] md:text-[9px] font-black uppercase tracking-wider text-zinc-500 text-center leading-tight">Cambio 1</span>
                    </div>
                </DashboardIosIcon>
            ),
        });
    }

    if (changeBox2) {
        items.push({
            key: 'cambio-2',
            node: (
                <DashboardIosIcon label="Cambio 2" onClick={() => onOpenChangeBoxAudit(changeBox2)}>
                    <div className="flex flex-col items-center justify-center gap-0.5 w-full">
                        <span className={cn('text-sm md:text-base font-black text-zinc-800 leading-none tabular-nums')}>{formatBoxEur(Number(changeBox2.current_balance ?? 0))}</span>
                        <span className="text-[8px] md:text-[9px] font-black uppercase tracking-wider text-zinc-500 text-center leading-tight">Cambio 2</span>
                    </div>
                </DashboardIosIcon>
            ),
        });
    }

    items.push({
        key: 'proveedores',
        node: <DashboardIosIcon label="Proveedores" img="/icons/suplier.png" onClick={() => router.push('/suppliers')} />,
    });

    return (
        <div className="grid grid-cols-4 gap-3 items-stretch">
            {items.map(({ key, node }) => (
                <div key={key} className="min-h-0 min-w-0">
                    {node}
                </div>
            ))}
        </div>
    );
}
