'use client';

import dynamic from 'next/dynamic';
import { Modal } from '@/components/ui/modal';

const EmbeddedSales = dynamic(() => import('@/components/dashboard/ventas/VentasDesktopWorkspace'), {
    ssr: false,
});

export type SalesPreview = { mode: 'current' | 'day' | 'month'; date: string };

export function SalesPreviewModal({ preview, onClose }: { preview: SalesPreview | null; onClose: () => void }) {
    if (!preview) return null;
    const title = preview.mode === 'month' ? 'Ventas mensuales' : 'Detalle de ventas';
    return (
        <Modal open onClose={onClose} title={title} scheme="dark" variant="amplify"
            instance="home-sales-preview" scrollContent={false}>
            <div data-element="sales-preview-viewport" className="flex h-[min(74dvh,730px)] min-h-0 w-full flex-col overflow-hidden">
                <EmbeddedSales key={preview.mode + preview.date} embeddedMode={preview.mode === 'current' ? 'day' : preview.mode} embeddedDate={preview.date} embeddedShowLive={preview.mode === 'current'}/>
            </div>
        </Modal>
    );
}
