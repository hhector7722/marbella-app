'use client';

import dynamic from 'next/dynamic';
import { Modal } from '@/components/ui/modal';

const EmbeddedSales = dynamic(() => import('@/components/dashboard/ventas/VentasDesktopWorkspace'), {
    ssr: false,
});

export type SalesPreview = { mode: 'day' | 'month'; date: string };

export function SalesPreviewModal({ preview, onClose }: { preview: SalesPreview | null; onClose: () => void }) {
    if (!preview) return null;
    const title = preview.mode === 'month' ? 'Ventas mensuales' : 'Detalle de ventas';
    return (
        <Modal open onClose={onClose} title={title} scheme="dark" variant="amplify"
            instance="home-sales-preview" scrollContent={true}>
            <div className="max-h-[75dvh] min-h-0 w-full overflow-y-auto overflow-x-hidden">
                <EmbeddedSales key={preview.mode + preview.date} embeddedMode={preview.mode} embeddedDate={preview.date}/>
            </div>
        </Modal>
    );
}
