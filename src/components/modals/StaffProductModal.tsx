'use client';

import { Modal } from '@/components/ui/modal';
import { AccessMenuGrid, CatalogTile } from '@/components/catalog/CatalogTile';

interface StaffProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenSupplierModal: () => void;
}

/**
 * Los atajos de stock viven en el mosaico staff (`StaffDashboardView`).
 * Se conserva el modal por compatibilidad; no debe abrirse en producción.
 */
export function StaffProductModal({ isOpen, onClose }: StaffProductModalProps) {
    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Stock"
            subtitle="Gestión de Logística"
            variant="standard"
            headerVariant="petroleum"
            scheme="dark"
            usageId="staff-product"
            usageLabel="Menú stock (staff)"
            scrollContent={false}
        >
            <AccessMenuGrid>
                <p className="col-span-full px-2 py-4 text-center text-sm text-zinc-500">
                    Los atajos de stock están en el mosaico principal.
                </p>
            </AccessMenuGrid>
        </Modal>
    );
}
