'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, ChevronDown, Check, ArrowRight, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { createClient } from "@/utils/supabase/client";
import { OrderProductCard } from "@/components/orders/OrderProductCard";
import { toast, Toaster } from 'sonner';
import { cn } from "@/lib/utils";

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

import { useRouter } from 'next/navigation';
import { OrderSummaryModal } from "@/components/orders/OrderSummaryModal";
import { OrderSuccessModal } from "@/components/orders/OrderSuccessModal";
import { generateOrderPDF } from "@/utils/orders/pdf-generator";

export default function NewOrderPage() {
    const supabase = createClient();
    const router = useRouter();
    const [userId, setUserId] = useState<string | null>(null);
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [drafts, setDrafts] = useState<Record<string, DraftItem>>({});
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const searchParams = useSearchParams();
    const initialSupplier = searchParams.get('supplier');

    const [selectedSupplier, setSelectedSupplier] = useState<string | null>(initialSupplier);
    const [showSupplierPopup, setShowSupplierPopup] = useState(false);
    const [suppliers, setSuppliers] = useState<string[]>([]);
    const [dbSuppliers, setDbSuppliers] = useState<{ id: string, name: string, phone: string | null }[]>([]);

    // UI Modals
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);
    const [isSuccessOpen, setIsSuccessOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [supplierPhoneForSuccess, setSupplierPhoneForSuccess] = useState<string | null>(null);

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

            const { data: supData } = await supabase.from('suppliers').select('id, name, phone');
            setDbSuppliers(supData || []);

            const uniqueSuppliers = Array.from(
                new Set(
                    (ingData || [])
                        .flatMap((i) => [i.supplier, i.supplier_2])
                        .filter(Boolean)
                )
            ) as string[];
            setSuppliers(uniqueSuppliers);
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
        const confirms = window.confirm(`¿Reiniciar cantidades del borrador de "${selectedSupplier}"? Solo se pondrán a 0 las cantidades de este proveedor.`);
        if (!confirms) return;

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

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#3E6A8A]">
                <LoadingSpinner size="xl" className="text-white" />
            </div>
        );
    }

    return (
        <div className="w-full bg-[#3E6A8A] min-h-screen p-4 md:p-6 pb-24">
            <Toaster position="top-right" />

            <div className="max-w-7xl mx-auto">
                <div className="sticky top-0 z-50 bg-[#36606F] rounded-2xl px-4 md:px-6 pt-4 pb-4">
                    <div className="flex flex-col gap-4">
                        {/* Fila 1: Proveedor y Buscador */}
                        <div className="flex items-center gap-2">
                            <div className={cn(
                                "shrink-0 px-4 py-2 bg-white/90 rounded-xl font-black text-[10px] text-zinc-800 uppercase tracking-widest shadow-sm flex items-center justify-center text-center border border-white/50",
                                selectedSupplier && "text-[#5E35B1] ring-1 ring-[#5E35B1]/10 border-[#5E35B1]/20 bg-white"
                            )}>
                                {selectedSupplier || "PROVEEDOR"}
                            </div>
                            <div className="relative w-full">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar ingrediente..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-white/95 rounded-xl shadow-sm outline-none text-[13px] font-medium text-gray-700 focus:ring-2 focus:ring-white/30 transition-all border border-transparent focus:border-[#5E35B1]/20"
                                />
                            </div>
                        </div>

                        {/* Fila 2: Borrar pedido y Tramitar */}
                        {selectedItems.length > 0 && selectedSupplier && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleNewOrder}
                                    className="flex-1 px-4 py-2 bg-white hover:bg-zinc-50 text-black rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2 animate-in zoom-in duration-200 border border-zinc-200"
                                >
                                    <span>Pedido Nuevo</span>
                                    <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center shrink-0 shadow-sm">
                                        <Plus className="w-3.5 h-3.5 text-white stroke-[4px]" />
                                    </div>
                                </button>
                                <button
                                    onClick={() => setIsSummaryOpen(true)}
                                    className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm transition-all active:scale-95 flex items-center justify-center animate-in zoom-in duration-200"
                                >
                                    Tramitar ({selectedItems.length})
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="pt-4 md:pt-6">
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-2.5 sm:gap-6">
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
                </div>
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
        </div>
    );
}
