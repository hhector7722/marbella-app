'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Package, Truck } from 'lucide-react';
import { createClient } from "@/utils/supabase/client";
import { getSupplierLogo } from '@/lib/supplier-logos';
import { resolveSupplierPickerItems } from '@/lib/supplier-seed';
import { useRouter, usePathname } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { SearchField } from '@/components/ui/SearchField';
import { CatalogGrid, CatalogTile } from '@/components/catalog/CatalogTile';
import { trackUsageModalApply } from '@/lib/usage/client';

interface Supplier {
    id: string;
    name: string;
    image_url?: string | null;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export function SupplierSelectionModal({ isOpen, onClose }: Props) {
    const [supabase] = useState(() => createClient());
    const router = useRouter();
    const pathname = usePathname();
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchSuppliers = useCallback(async (showLoading = true) => {
        if (showLoading) setLoading(true);

        const { data, error } = await supabase
            .from('suppliers')
            .select('id, name, image_url')
            .order('name');

        const dbSuppliers: Supplier[] = (!error && data) ? data : [];
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
            .channel('supplier-selection-live')
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
    }, [fetchSuppliers, isOpen, supabase]);

    const filteredSuppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSelectSupplier = (supplierName: string) => {
        trackUsageModalApply(
            'supplier-selection',
            'Selección de proveedor',
            pathname,
            supplierName
        );
        router.push(`/orders/new?supplier=${encodeURIComponent(supplierName)}`);
        onClose();
    };

    const getLogo = (supplier: Supplier) => getSupplierLogo(supplier.image_url, supplier.name);

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Proveedor"
            subtitle={
                <span className="inline-flex items-center gap-1">
                    <Package className="h-[1em] w-[1em] shrink-0" aria-hidden /> Selecciona proveedor
                </span>
            }
            variant="standard"
            layer="base"
            instance="supplier-selection"
            headerTone="petroleum"
            usageId="supplier-selection"
            usageLabel="Selección de proveedor"
            scrollContent={false}
        >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white p-2.5 sm:p-3">
                <div className="mb-4 shrink-0">
                    <SearchField
                        instance="supplier-selection-search"
                        placeholder="Buscar proveedor..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                    />
                </div>

                <div className="overflow-y-auto no-scrollbar">
                    {loading ? (
                        <div className="py-10 flex justify-center">
                            <span className="text-sm font-bold text-gray-400 animate-pulse">Cargando proveedores...</span>
                        </div>
                    ) : filteredSuppliers.length === 0 ? (
                        <div className="py-10 text-center">
                            <span className="text-sm font-bold text-gray-400">No se encontraron proveedores</span>
                        </div>
                    ) : (
                        <CatalogGrid columns={4}>
                            {filteredSuppliers.map(supplier => (
                                <CatalogTile
                                    key={supplier.id}
                                    title={supplier.name}
                                    imageSrc={getLogo(supplier)}
                                    fallback={<Truck className="h-8 w-8 md:h-10 md:w-10" />}
                                    onClick={() => handleSelectSupplier(supplier.name)}
                                />
                            ))}
                        </CatalogGrid>
                    )}
                </div>
            </div>
        </Modal>
    );
}
