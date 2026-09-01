'use client';

import { Truck } from 'lucide-react';
import { CatalogGrid, CatalogTileUnificado } from '@/components/catalog/CatalogTile';
import { getSupplierLogo } from '@/lib/supplier-logos';

export type SupplierPickerItem = {
    id: string;
    name: string;
    image_url?: string | null;
    current_price?: number | null;
    price_locked?: boolean;
};

export function SupplierPickerGrid({
    suppliers,
    onSelect,
    ink = 'invertido',
}: {
    suppliers: SupplierPickerItem[];
    onSelect: (supplier: SupplierPickerItem) => void;
    ink?: 'invertido' | 'paper';
}) {
    return (
        <CatalogGrid columns={4}>
            {suppliers.map((supplier) => {
                const logo = getSupplierLogo(supplier.image_url, supplier.name);
                return (
                    <CatalogTileUnificado
                        key={supplier.id}
                        title={supplier.name}
                        imageSrc={logo ?? undefined}
                        fallback={<Truck className="h-8 w-8 md:h-10 md:w-10 text-gray-400" />}
                        price={supplier.current_price ?? undefined}
                        priceLocked={supplier.price_locked ?? false}
                        nameTone={ink === 'paper' ? 'default' : 'invertido'}
                        onClick={() => onSelect(supplier)}
                    />
                );
            })}
        </CatalogGrid>
    );
}
