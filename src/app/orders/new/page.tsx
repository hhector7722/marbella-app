'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/SearchField';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { createClient } from "@/utils/supabase/client";
import { OrderProductCard } from "@/components/orders/OrderProductCard";
import { toast, Toaster } from 'sonner';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { getSupplierLogo } from '@/lib/supplier-logos';
import { Truck } from 'lucide-react';

interface Ingredient {
    id: string;
    name: string;
    supplier: string | null;
    supplier_2?: string | null;
    current_price: number;
    purchase_unit: string;
    image_url: string | null;
    category: string;
    order_unit?: string | null;
}

interface DraftItem {
    quantity: number;
    unit: string;
}

import { OrderSummaryModal } from "@/components/orders/OrderSummaryModal";
import { OrderSuccessModal } from "@/components/orders/OrderSuccessModal";
import { generateOrderPDF } from "@/utils/orders/pdf-generator";

export default function NewOrderPage() {
    const supabase = createClient();
    const [userId, setUserId] = useState<string | null>(null);
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [drafts, setDrafts] = useState<Record<string, DraftItem>>({});
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const searchParams = useSearchParams();
    const initialSupplier = searchParams.get('supplier');

    const [selectedSupplier, setSelectedSupplier] = useState<string | null>(initialSupplier);
    const [dbSuppliers, setDbSuppliers] = useState<{ id: string, name: string, phone: string | null, image_url: string | null }[]>([]);

    // UI Modals
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);
    const [isSuccessOpen, setIsSuccessOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [supplierPhoneForSuccess, setSupplierPhoneForSuccess] = useState<string | null>(null);
    const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

    // supplierId for drafts (drafts are shared per supplier)
    const supplierId = selectedSupplier ? dbSuppliers.find(s => s.name === selectedSupplier)?.id ?? null : null;

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUserId(user.id);
                await fetchData();
            }
        };
        init();
    }, []);

    // Load drafts for the selected supplier (shared: anyone sees the same draft for that supplier)
    useEffect(() => {
        if (!supplierId) {
            setDrafts({});
            return;
        }
        let channel: ReturnType<typeof supabase.channel> | null = null;
        const loadDrafts = async () => {
            const { data: draftData } = await supabase
                .from('order_drafts')
                .select('ingredient_id, quantity, unit')
                .eq('supplier_id', supplierId);
            const draftMap: Record<string, DraftItem> = {};
            draftData?.forEach(d => {
                draftMap[d.ingredient_id] = {
                    quantity: Number(d.quantity),
                    unit: d.unit || 'unidad'
                };
            });
            setDrafts(draftMap);
        };
        loadDrafts();

        channel = supabase.channel(`order_drafts_supplier_${supplierId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'order_drafts',
                filter: `supplier_id=eq.${supplierId}`
            }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    setDrafts(prev => {
                        const newDrafts = { ...prev };
                        delete newDrafts[payload.old.ingredient_id];
                        return newDrafts;
                    });
                } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                    setDrafts(prev => ({
                        ...prev,
                        [payload.new.ingredient_id]: {
                            quantity: Number(payload.new.quantity),
                            unit: payload.new.unit || 'unidad'
                        }
                    }));
                }
            })
            .subscribe();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [supplierId]);

    async function fetchData() {
        setLoading(true);
        try {
            const { data: ingData } = await supabase.from('ingredients').select('*').order('name');
            setIngredients(ingData || []);

            const { data: supData } = await supabase.from('suppliers').select('id, name, phone, image_url');
            setDbSuppliers(supData || []);

            // Drafts are loaded in useEffect when supplierId is set (shared per supplier)
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Error al cargar datos');
        } finally {
            setLoading(false);
        }
    }

    const filteredIngredients = ingredients.filter(ing => {
        const matchesSearch = ing.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSupplier = !selectedSupplier || ing.supplier === selectedSupplier || ing.supplier_2 === selectedSupplier;
        return matchesSearch && matchesSupplier;
    });

    // CRITICAL: Filter selected items BY THE CURRENTLY SELECTED SUPPLIER
    const selectedItems = ingredients
        .filter(ing => (drafts[ing.id]?.quantity || 0) > 0 && (!selectedSupplier || ing.supplier === selectedSupplier || ing.supplier_2 === selectedSupplier))
        .map(ing => ({
            ...ing,
            quantity: drafts[ing.id].quantity,
            unit: drafts[ing.id].unit
        }));

    const handleNewOrder = async () => {
        if (!supplierId || !selectedSupplier) return;
        setResetConfirmOpen(false);
        setIsProcessing(true);
        try {
            const { error } = await supabase.from('order_drafts').delete().eq('supplier_id', supplierId);
            if (error) throw error;
            setDrafts(prev => {
                const next = { ...prev };
                ingredients.filter(ing => ing.supplier === selectedSupplier || ing.supplier_2 === selectedSupplier).forEach(ing => {
                    delete next[ing.id];
                });
                return next;
            });
            toast.success('Borrador de este proveedor reiniciado');
        } catch (error) {
            console.error('Error clearing supplier draft:', error);
            toast.error('Error al reiniciar');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleFinalize = async () => {
        if (selectedItems.length === 0) {
            toast.error('No hay productos seleccionados');
            return;
        }

        if (!selectedSupplier) {
            toast.error('Debes seleccionar un proveedor');
            return;
        }

        const targetSupplier = dbSuppliers.find(s => s.name.toLowerCase() === selectedSupplier.toLowerCase());
        if (!targetSupplier) {
            toast.error('Proveedor no registrado');
            return;
        }

        setIsProcessing(true);
        try {
            const orderNum = `ORD-${Date.now().toString().slice(-6)}`;
            const blob = await generateOrderPDF({
                supplierName: selectedSupplier,
                items: selectedItems.map(i => ({
                    name: i.name,
                    quantity: i.quantity,
                    unit: i.unit,
                    price: 0,
                    image: i.image_url
                })),
                orderNumber: orderNum
            });
            setGeneratedBlob(blob);

            setIsSummaryOpen(false);
            setIsSuccessOpen(true);
            setIsGenerating(true);
            setIsUploading(true);
            setSupplierPhoneForSuccess(targetSupplier.phone ?? null);

            const { data: order, error: orderError } = await supabase.from('purchase_orders').insert({
                order_number: orderNum,
                created_by: userId,
                supplier_id: targetSupplier.id,
                supplier_name: selectedSupplier,
                total_items: selectedItems.length,
                status: 'SENT'
            }).select().single();

            if (orderError) throw orderError;

            const orderItems = selectedItems.map(i => ({
                purchase_order_id: order.id,
                ingredient_id: i.id,
                ingredient_name: i.name,
                quantity: i.quantity,
                unit: i.unit,
                unit_price: 0
            }));
            await supabase.from('purchase_order_items').insert(orderItems);

            const fileName = `${orderNum}.pdf`;
            const { error: uploadError } = await supabase.storage.from('orders').upload(fileName, blob);
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('orders').getPublicUrl(fileName);
            await supabase.from('purchase_orders').update({ pdf_url: publicUrl }).eq('id', order.id);
            setPdfUrl(publicUrl);

            // PERSISTENCE: We NO LONGER clear drafts here.
            setIsGenerating(false);
            toast.success('Pedido registrado (cantidades conservadas)');

        } catch (error: any) {
            console.error('Error finalizing order:', error);
            toast.error('Error: ' + error.message);
        } finally {
            setIsProcessing(false);
            setIsUploading(false);
            setIsGenerating(false);
        }
    };

    const handleDownload = () => {
        if (!generatedBlob) return;
        const url = URL.createObjectURL(generatedBlob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `Pedido_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 100);
    };

    const totalSelected = selectedItems.length;
    const selectedSupplierRow = selectedSupplier
        ? dbSuppliers.find((s) => s.name === selectedSupplier)
        : undefined;
    const supplierLogo = getSupplierLogo(selectedSupplierRow?.image_url, selectedSupplier);

    const ordersToolbar = (
        <div data-element="orders-toolbar" className="flex min-w-0 items-center gap-2">
            <div
                data-element="supplier-logo"
                className="flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white"
                title={selectedSupplier ?? 'Proveedor'}
            >
                {supplierLogo ? (
                    <img src={supplierLogo} alt="" className="h-full w-full object-contain" />
                ) : (
                    <Truck className="h-4 w-4 text-zinc-400" strokeWidth={2} aria-hidden />
                )}
            </div>
            <div className="min-w-0 flex-1">
                <SearchField
                    instance="orders-new-search"
                    placeholder="Buscar ingrediente..."
                    value={searchQuery}
                    onChange={setSearchQuery}
                />
            </div>
            <Button
                type="button"
                variant="secondary"
                instance="order-new-reset"
                disabled={!supplierId || !selectedSupplier}
                onClick={() => {
                    if (!supplierId || !selectedSupplier) return;
                    setResetConfirmOpen(true);
                }}
            >
                Nuevo
            </Button>
            <Button
                type="button"
                variant="primary"
                instance="order-new-tramitar"
                disabled={selectedItems.length === 0 || !selectedSupplier}
                onClick={() => setIsSummaryOpen(true)}
            >
                {totalSelected > 0 ? `Tramitar (${totalSelected})` : 'Tramitar'}
            </Button>
        </div>
    );

    const ordersCatalog = (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y scroll-pb-end-cards">
            <div
                data-element="orders-catalog-grid"
                className="grid grid-cols-3 gap-x-5 gap-y-6 pt-2 sm:grid-cols-4 sm:gap-x-6 sm:gap-y-8 md:grid-cols-5 md:gap-x-7 lg:grid-cols-5 lg:gap-x-5 lg:gap-y-6 xl:grid-cols-6 2xl:grid-cols-7"
            >
                {filteredIngredients.map(ing => (
                    <OrderProductCard
                        key={ing.id}
                        ingredient={ing}
                        supplierId={supplierId}
                        initialQuantity={drafts[ing.id]?.quantity || 0}
                        initialUnit={drafts[ing.id]?.unit}
                        onQuantityChange={(id, q, u) => setDrafts(prev => ({ ...prev, [id]: { quantity: q, unit: u } }))}
                    />
                ))}
            </div>
            <div className="scroll-end-touch-cards" aria-hidden />
        </div>
    );

    const ordersSummaryPanel = (
        <aside
            data-element="orders-summary"
            aria-label="Resumen del pedido"
            className="hidden min-h-0 flex-col overflow-hidden rounded-ds-superficie bg-white/95 shadow-ds-pagina lg:flex"
        >
            <div data-element="orders-summary-head">
                <p data-element="orders-summary-title">Pedido</p>
                <p data-element="orders-summary-meta">
                    {selectedSupplier ? selectedSupplier : 'Sin proveedor'}
                    {totalSelected > 0 ? ` · ${totalSelected}` : ''}
                </p>
            </div>
            <div data-element="orders-summary-body">
                {selectedItems.length === 0 ? (
                    <p data-element="orders-summary-empty">Ningún producto en el pedido</p>
                ) : (
                    <ul data-element="orders-summary-list">
                        {selectedItems.map((item) => (
                            <li key={item.id} data-element="orders-summary-row">
                                <span data-element="orders-summary-name" title={item.name}>{item.name}</span>
                                <span data-element="orders-summary-qty">{item.quantity}</span>
                                <span data-element="orders-summary-unit">{item.unit}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div data-element="orders-summary-actions">
                <Button
                    type="button"
                    variant="primary"
                    instance="order-new-tramitar-desktop"
                    disabled={selectedItems.length === 0 || !selectedSupplier}
                    onClick={() => setIsSummaryOpen(true)}
                >
                    {totalSelected > 0 ? `Tramitar (${totalSelected})` : 'Tramitar'}
                </Button>
            </div>
        </aside>
    );

    if (loading) {
        return (
            <DashboardDetailLayout
                title="Pedido nuevo"
                showBackButton={false}
                template="list"
                maxWidthClass="max-w-7xl lg:max-w-none"
                fillViewport
                className="page-orders-new"
                toolbarSlot={ordersToolbar}
            >
                <div className="flex flex-1 items-center justify-center py-20">
                    <LoadingSpinner size="xl" className="text-ds-marca" />
                </div>
            </DashboardDetailLayout>
        );
    }

    return (
        <DashboardDetailLayout
            title="Pedido nuevo"
            showBackButton={false}
            template="list"
            maxWidthClass="max-w-7xl lg:max-w-none"
            fillViewport
            className="page-orders-new"
            contentClassName="p-4 md:p-6 lg:px-4 lg:py-3 flex flex-col min-h-0"
            toolbarSlot={ordersToolbar}
        >
            <Toaster position="top-right" />

            <div
                data-element="orders-workspace"
                className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-6"
            >
                <div data-element="orders-catalog" className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {ordersCatalog}
                </div>
                {ordersSummaryPanel}
            </div>


            {/* MODALS */}
            <OrderSummaryModal
                isOpen={isSummaryOpen}
                onClose={() => setIsSummaryOpen(false)}
                items={selectedItems}
                onConfirm={handleFinalize}
                isProcessing={isProcessing}
            />

            <OrderSuccessModal
                isOpen={isSuccessOpen}
                pdfUrl={pdfUrl}
                generatedBlob={generatedBlob}
                supplierPhone={supplierPhoneForSuccess}
                isUploading={isUploading}
                isGenerating={isGenerating}
                onDownload={handleDownload}
                onClose={() => {
                    setIsSuccessOpen(false);
                    setSupplierPhoneForSuccess(null);
                    // Persistent quantities: no router.refresh() or reset needed
                }}
            />

            <ConfirmModal
                open={resetConfirmOpen}
                onClose={() => { if (!isProcessing) setResetConfirmOpen(false); }}
                title="Reiniciar borrador"
                confirmLabel="Reiniciar"
                confirmVariant="primary"
                instance="order-new-reset-confirm"
                usageLabel="Confirmar reiniciar borrador de pedido"
                confirming={isProcessing}
                onConfirm={() => void handleNewOrder()}
            >
                {`¿Reiniciar cantidades del borrador de "${selectedSupplier ?? ''}"? Solo se pondrán a 0 las cantidades de este proveedor.`}
            </ConfirmModal>
        </DashboardDetailLayout>
    );
}
