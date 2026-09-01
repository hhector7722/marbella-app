'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { resolveSupplierPickerItems } from '@/lib/supplier-seed';
import { useRouter, usePathname } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { SearchField } from '@/components/ui/SearchField';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { trackUsageModalApply } from '@/lib/usage/client';
import {
    SupplierPickerGrid,
    type SupplierPickerItem,
} from '@/components/suppliers/SupplierPickerGrid';

export type { SupplierPickerItem };

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /**
     * Si no se pasa, elige proveedor para un pedido (`/orders/new`).
     * El escáner pasa el suyo para el albarán.
     */
    onSelect?: (supplier: SupplierPickerItem) => void;
    instance?: string;
    usageId?: string;
    usageLabel?: string;
    subtitle?: React.ReactNode;
}

export function SupplierSelectionModal({
    isOpen,
    onClose,
    onSelect,
    instance = 'supplier-selection',
    usageId,
    usageLabel = 'Selección de proveedor',
    subtitle,
}: Props) {
    const [supabase] = useState(() => createClient());
    const router = useRouter();
    const pathname = usePathname();
    const [suppliers, setSuppliers] = useState<SupplierPickerItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const applyId = usageId ?? instance;

    const fetchSuppliers = useCallback(async (showLoading = true) => {
        if (showLoading) setLoading(true);

        const { data, error } = await supabase
            .from('suppliers')
            .select('id, name, image_url')
            .order('name');

        const dbSuppliers: SupplierPickerItem[] = (!error && data)
            ? data.map((row) => ({
                id: String(row.id),
                name: String(row.name ?? ''),
                image_url: row.image_url ?? null,
            }))
            : [];
        setSuppliers(resolveSupplierPickerItems(dbSuppliers));
        if (showLoading) setLoading(false);
    }, [supabase]);

    useEffect(() => {
        if (!isOpen) return;
        const initialFetchTimer = window.setTimeout(() => {
            void fetchSuppliers();
        }, 0);

        const refreshFromForeground = () => {
            if (document.visibilityState === 'visible') {
                void fetchSuppliers(false);
            }
        };

        const channel = supabase
            .channel(`supplier-picker-live-${instance}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'suppliers' },
                () => void fetchSuppliers(false)
            )
            .subscribe();

        window.addEventListener('focus', refreshFromForeground);
        document.addEventListener('visibilitychange', refreshFromForeground);

        return () => {
            window.clearTimeout(initialFetchTimer);
            window.removeEventListener('focus', refreshFromForeground);
            document.removeEventListener('visibilitychange', refreshFromForeground);
            void supabase.removeChannel(channel);
        };
    }, [fetchSuppliers, instance, isOpen, supabase]);

    useEffect(() => {
        if (!isOpen) setSearchQuery('');
    }, [isOpen]);

    const filteredSuppliers = suppliers.filter((s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSelectSupplier = (supplier: SupplierPickerItem) => {
        trackUsageModalApply(applyId, usageLabel, pathname, supplier.name);
        if (onSelect) {
            onSelect(supplier);
        } else {
            router.push(`/orders/new?supplier=${encodeURIComponent(supplier.name)}`);
        }
        onClose();
    };

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Proveedor"
            subtitle={
                subtitle ?? (
                    <span className="inline-flex items-center gap-1">
                        <Package className="h-[1em] w-[1em] shrink-0" aria-hidden /> Selecciona proveedor
                    </span>
                )
            }
            variant="standard"
            layer="base"
            instance={instance}
            headerTone="petroleum"
            scheme="dark"
            usageId={applyId}
            usageLabel={usageLabel}
            scrollContent={false}
        >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2.5 sm:p-3">
                <div className="mb-4 shrink-0">
                    <SearchField
                        instance={`${instance}-search`}
                        placeholder="Buscar proveedor..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                    />
                </div>

                <div className="overflow-y-auto no-scrollbar">
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <LoadingSpinner size="lg" className="text-ds-marca" />
                        </div>
                    ) : filteredSuppliers.length === 0 ? (
                        <p className="py-10 text-center text-sm font-bold">No se encontraron proveedores</p>
                    ) : (
                        <SupplierPickerGrid
                            suppliers={filteredSuppliers}
                            onSelect={handleSelectSupplier}
                            ink="invertido"
                        />
                    )}
                </div>
            </div>
        </Modal>
    );
}
