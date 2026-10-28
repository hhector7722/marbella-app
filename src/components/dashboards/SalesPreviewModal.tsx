'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { endOfMonth, format, parseISO } from 'date-fns';
import { CloudSun } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { createClient } from '@/utils/supabase/client';

const EmbeddedSales = dynamic(() => import('@/components/dashboard/ventas/VentasDesktopWorkspace'), {
    ssr: false,
    loading: () => (
        <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center" role="status" aria-label="Cargando detalle de ventas">
            <LoadingSpinner size="lg" className="text-sky-200"/>
        </div>
    ),
});

export type SalesPreview = { mode: 'current' | 'day' | 'month'; date: string };

type PreviewHeader = {
    key: string;
    weather: string | null;
    tickets: number | null;
    avgTicket: number | null;
};

export function SalesPreviewModal({ preview, onClose }: { preview: SalesPreview | null; onClose: () => void }) {
    const supabase = useMemo(() => createClient(), []);
    const [facts, setFacts] = useState<PreviewHeader | null>(null);
    const previewKey = preview ? preview.mode + ':' + preview.date : '';

    useEffect(() => {
        if (!preview) return;
        const mode = preview.mode;
        const date = preview.date;
        const key = mode + ':' + date;
        const firstDay = mode === 'month' ? date.slice(0, 7) + '-01' : date;
        const lastDay = mode === 'month' ? format(endOfMonth(parseISO(firstDay)), 'yyyy-MM-dd') : date;
        let mounted = true;
        const fetchHeader = async () => {
            const [salesResult, closingResult] = await Promise.all([
                supabase.rpc('get_ventas_crossfilter', {
                    p_start_date: firstDay, p_end_date: lastDay, p_limit: 1,
                }),
                mode === 'month' ? Promise.resolve(null) : supabase.from('cash_closings')
                    .select('weather').eq('closing_date', date)
                    .order('closed_at', { ascending: false }).limit(1).maybeSingle(),
            ]);
            if (!mounted) return;
            const summary = (salesResult.data as {
                summary?: { count?: number; avgTicket?: number; totalSales?: number }
            } | null)?.summary;
            const count = !salesResult.error && summary ? Number(summary.count ?? 0) : null;
            const avg = count !== null && count > 0
                ? Number(summary?.avgTicket ?? Number(summary?.totalSales ?? 0) / count) : null;
            setFacts({
                key,
                weather: closingResult?.data?.weather ? String(closingResult.data.weather) : null,
                tickets: count,
                avgTicket: avg,
            });
        };
        void fetchHeader();
        return () => { mounted = false; };
    }, [supabase, preview]);

    if (!preview) return null;
    const title = preview.mode === 'month' ? 'Ventas mensuales' : 'Detalle de ventas';
    const currentFacts = facts?.key === previewKey ? facts : null;
    return (
        <Modal open onClose={onClose} title={title} scheme="dark" variant="amplify"
            instance="home-sales-preview" scrollContent={false}
            headerTrailing={
                <div className="flex max-w-[66vw] min-w-0 items-center gap-2 pr-1 text-[10px] text-white/75 tabular-nums sm:gap-3 sm:text-[11px]">
                    {currentFacts?.weather && (
                        <span className="inline-flex min-w-0 items-center gap-1" title={currentFacts.weather}>
                            <CloudSun size={13} className="shrink-0"/>
                            <span className="max-w-[64px] truncate">{currentFacts.weather}</span>
                        </span>
                    )}
                    <span className="shrink-0 whitespace-nowrap">
                        <strong className="text-white">{currentFacts?.tickets == null ? '—' :
                            currentFacts.tickets.toLocaleString('es-ES')}</strong> tickets
                    </span>
                    <span className="shrink-0 whitespace-nowrap">
                        <strong className="text-white">{currentFacts?.avgTicket == null ? '—' :
                            currentFacts.avgTicket.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</strong> medio
                    </span>
                </div>
            }>
            <div data-element="sales-preview-viewport" className="flex h-[min(74dvh,730px)] min-h-0 w-full flex-col overflow-hidden">
                <EmbeddedSales key={previewKey} embeddedMode={preview.mode === 'current' ? 'day' : preview.mode}
                    embeddedDate={preview.date} embeddedShowLive={preview.mode === 'current'}/>
            </div>
        </Modal>
    );
}
