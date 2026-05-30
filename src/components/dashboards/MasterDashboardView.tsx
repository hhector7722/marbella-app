'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import DashboardVentasSection from '@/components/dashboards/DashboardVentasSection';
import MasterShortcutGrid from '@/components/dashboards/MasterShortcutGrid';
import MasterReservasModal from '@/components/dashboards/MasterReservasModal';
import { CashChangeModal, type BoxOption } from '@/components/CashChangeModal';
import { CashDenominationForm } from '@/components/CashDenominationForm';
import { SupplierSelectionModal } from '@/components/orders/SupplierSelectionModal';
import { useMasterTreasuryLive } from '@/hooks/useMasterTreasuryLive';
import { cn } from '@/lib/utils';

type MasterDashboardViewProps = {
    initialData?: {
        liveTickets?: { total: number; count: number };
        salesChartData?: { hora: number; total: number }[];
        actualBalance?: number;
        boxes?: any[];
    };
};

export default function MasterDashboardView({ initialData }: MasterDashboardViewProps) {
    const supabase = createClient();
    const { actualBalance, boxes, refresh } = useMasterTreasuryLive({
        actualBalance: initialData?.actualBalance,
        boxes: initialData?.boxes,
    });

    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
    const [isReservasModalOpen, setIsReservasModalOpen] = useState(false);
    const [auditBox, setAuditBox] = useState<any>(null);
    const [boxInventoryMap, setBoxInventoryMap] = useState<Record<number, number>>({});

    const changeBoxes = useMemo(
        () => boxes.filter((b) => b.type === 'change').sort((a, b) => (a.name || '').localeCompare(b.name || '')),
        [boxes]
    );

    const buildPaymentSources = (): BoxOption[] => {
        const list: BoxOption[] = [];
        const op = boxes.find((b: any) => b.type === 'operational');
        const changes = boxes.filter((b: any) => b.type === 'change').sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
        if (op) list.push({ id: op.id, name: 'Caja inicial', hasInventory: true, image_url: op.image_url });
        changes.forEach((b: any, i: number) => list.push({ id: b.id, name: `Caja cambio ${i + 1}`, hasInventory: true, image_url: b.image_url }));
        list.push({ id: 'tpv1', name: 'TPV 1', hasInventory: false });
        list.push({ id: 'tpv2', name: 'TPV 2', hasInventory: false });
        return list;
    };

    const openChangeBoxAudit = async (box: any) => {
        const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', box.id).gt('quantity', 0);
        const initial: Record<number, number> = {};
        data?.forEach((d) => {
            initial[Number(d.denomination)] = d.quantity;
        });
        setBoxInventoryMap(initial);
        setAuditBox(box);
    };

    const handleAuditSubmit = async (total: number, breakdown: Record<number, number>) => {
        if (!auditBox) return;
        try {
            await supabase.from('treasury_log').insert({
                box_id: auditBox.id,
                type: 'ADJUSTMENT',
                amount: total,
                breakdown,
                notes: 'Arqueo de caja',
            });
            setAuditBox(null);
            await refresh();
            toast.success('Arqueo registrado');
        } catch (err) {
            console.error(err);
            toast.error('Error al registrar arqueo');
        }
    };

    return (
        <div className="pt-3 md:pt-2 animate-in fade-in duration-500 pb-8 md:pb-4">
            <div className="px-4 w-full max-w-sm md:max-w-6xl mx-auto space-y-4 md:space-y-2">
                <DashboardVentasSection
                    initialData={{
                        liveTickets: initialData?.liveTickets,
                        salesChartData: initialData?.salesChartData,
                    }}
                />
                <MasterShortcutGrid
                    actualBalance={actualBalance}
                    changeBoxes={changeBoxes}
                    onOpenPedidos={() => setIsSupplierModalOpen(true)}
                    onOpenCambio={() => setIsSwapModalOpen(true)}
                    onOpenReservas={() => setIsReservasModalOpen(true)}
                    onOpenChangeBoxAudit={openChangeBoxAudit}
                />
            </div>

            <SupplierSelectionModal isOpen={isSupplierModalOpen} onClose={() => setIsSupplierModalOpen(false)} />

            <MasterReservasModal isOpen={isReservasModalOpen} onClose={() => setIsReservasModalOpen(false)} />

            {isSwapModalOpen && (
                <CashChangeModal
                    boxOptions={buildPaymentSources()}
                    isManager
                    onClose={() => setIsSwapModalOpen(false)}
                    onSuccess={() => {
                        setIsSwapModalOpen(false);
                        void refresh();
                    }}
                />
            )}

            {auditBox && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200" onClick={() => setAuditBox(null)}>
                    <div className={cn('bg-white w-full rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]', 'max-w-2xl')} onClick={(e) => e.stopPropagation()}>
                        <CashDenominationForm
                            key={`audit-${auditBox.id}`}
                            type="audit"
                            boxName={auditBox.name || 'Caja cambio'}
                            initialCounts={boxInventoryMap}
                            availableStock={boxInventoryMap}
                            onCancel={() => setAuditBox(null)}
                            onSubmit={handleAuditSubmit}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
