'use client';
import { Modal } from '@/components/ui/modal';
export type SalesPreview = { mode: 'day' | 'month'; date: string };
export function SalesPreviewModal({ preview, onClose }: { preview: SalesPreview | null; onClose: () => void }) {
    if (!preview) return null;
    const title = preview.mode === 'month' ? 'Ventas mensuales' : 'Detalle de ventas';
    const url = '/dashboard/ventas?preview=' + preview.mode + '&date=' + encodeURIComponent(preview.date);
    return <Modal open onClose={onClose} title={title} scheme="dark" variant="large" instance="home-sales-preview" scrollContent={false}>
        <iframe key={url} title={title} src={url} className="block h-[min(76dvh,760px)] w-full rounded-md border-0 bg-transparent" loading="eager"/>
    </Modal>;
}
