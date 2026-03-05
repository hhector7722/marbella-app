'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, ChevronDown, Check, ArrowRight } from 'lucide-react';
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

    useEffect(() => {
        let channel: any;
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUserId(user.id);
                await fetchData(user.id);

                // Supabase Realtime para actualizar la IU al recibir comandos de voz de la IA
                channel = supabase.channel('order_drafts_changes')
                    .on('postgres_changes', {
                        event: '*',
                        schema: 'public',
                        table: 'order_drafts',
                        filter: `user_id=eq.${user.id}`
                    }, (payload) => {
                        console.log('Realtime AI worker event:', payload);
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
            }
        };
        init();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, []);

    async function fetchData(uid: string) {
        setLoading(true);
        try {
            const { data: ingData } = await supabase.from('ingredients').select('*').order('name');
            setIngredients(ingData || []);

            // Fetch registered suppliers for ID lookup
            const { data: supData } = await supabase.from('suppliers').select('id, name, phone');
            setDbSuppliers(supData || []);

            // Unique suppliers from ingredients for the filter dropdown
            const uniqueSuppliers = Array.from(new Set((ingData || []).map(i => i.supplier).filter(Boolean))) as string[];
            setSuppliers(uniqueSuppliers);

            const { data: draftData } = await supabase.from('order_drafts').select('ingredient_id, quantity, unit').eq('user_id', uid);
            const draftMap: Record<string, DraftItem> = {};
            draftData?.forEach(d => {
                draftMap[d.ingredient_id] = {
                    quantity: Number(d.quantity),
                    unit: d.unit || 'unidad'
                };
            });
            setDrafts(draftMap);
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Error al cargar datos');
        } finally {
            setLoading(false);
        }
    }

    const filteredIngredients = ingredients.filter(ing => {
        const matchesSearch = ing.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSupplier = !selectedSupplier || ing.supplier === selectedSupplier;
        return matchesSearch && matchesSupplier;
    });

    // CRITICAL: Filter selected items BY THE CURRENTLY SELECTED SUPPLIER
    const selectedItems = ingredients
        .filter(ing => (drafts[ing.id]?.quantity || 0) > 0 && (!selectedSupplier || ing.supplier === selectedSupplier))
        .map(ing => ({
            ...ing,
            quantity: drafts[ing.id].quantity,
            unit: drafts[ing.id].unit
        }));

    const handleNewOrder = async () => {
        if (!userId) return;
        const confirms = window.confirm('¿Estás seguro de que quieres empezar un NUEVO pedido? Se borrarán todas las cantidades actuales de TODOS los proveedores.');
        if (!confirms) return;

        setIsProcessing(true);
        try {
            const { error } = await supabase.from('order_drafts').delete().eq('user_id', userId);
            if (error) throw error;
            setDrafts({});
            toast.success('Cantidades reiniciadas');
        } catch (error) {
            console.error('Error clearing all drafts:', error);
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
            <div className="flex items-center justify-center min-h-screen bg-[#5B8FB9]">
                <LoadingSpinner size="xl" className="text-white" />
            </div>
        );
    }

    return (
        <div className="w-full bg-[#5B8FB9] min-h-screen">
            <Toaster position="top-right" />

            {/* STICKY HEADER (2 ROWS) */}
            <div className="sticky top-0 z-50 bg-[#5B8FB9]/95 backdrop-blur-md px-6 pt-6 pb-4 border-b border-white/10 shadow-lg">
                <div className="max-w-7xl mx-auto flex flex-col gap-4">
                    {/* Row 1: Search */}
                    <div className="relative w-full">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar ingrediente..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-white/95 rounded-2xl shadow-sm outline-none text-sm font-medium text-gray-700 focus:ring-2 focus:ring-[#5E35B1] transition-all"
                        />
                    </div>

                    {/* Row 2: Tools */}
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                        {/* Supplier Selector */}
                        <div className="relative shrink-0">
                            <button
                                onClick={() => setShowSupplierPopup(!showSupplierPopup)}
                                className={cn(
                                    "px-4 py-2.5 bg-white/90 hover:bg-white rounded-xl font-black text-[10px] text-zinc-800 uppercase tracking-widest shadow-sm transition-all flex items-center gap-2 border border-white/50",
                                    selectedSupplier && "bg-white border-[#5E35B1]/20 ring-1 ring-[#5E35B1]/10 text-[#5E35B1]"
                                )}
                            >
                                {selectedSupplier || "Proveedor"} <ChevronDown size={14} className="text-zinc-400" />
                            </button>

                            {showSupplierPopup && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setShowSupplierPopup(false)}></div>
                                    <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-40 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="px-4 py-2 border-b border-gray-50 mb-1">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Seleccionar Proveedor</span>
                                        </div>
                                        <button
                                            onClick={() => { setSelectedSupplier(null); setShowSupplierPopup(false); }}
                                            className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-zinc-50 transition-colors uppercase tracking-wider flex justify-between items-center"
                                        >
                                            Todos {!selectedSupplier && <Check size={14} className="text-[#5E35B1]" />}
                                        </button>
                                        {suppliers.map(sup => (
                                            <button
                                                key={sup}
                                                onClick={() => { setSelectedSupplier(sup); setShowSupplierPopup(false); }}
                                                className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-zinc-50 transition-colors uppercase tracking-wider flex justify-between items-center"
                                            >
                                                {sup} {selectedSupplier === sup && <Check size={14} className="text-[#5E35B1]" />}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Nuevo Button (Conditional) */}
                        {selectedItems.length > 0 && selectedSupplier && (
                            <button
                                onClick={handleNewOrder}
                                className="shrink-0 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm transition-all active:scale-95 flex items-center gap-2 animate-in zoom-in duration-200"
                            >
                                Nuevo
                            </button>
                        )}

                        {/* Tramitar Button (Conditional) */}
                        {selectedItems.length > 0 && selectedSupplier && (
                            <button
                                onClick={() => setIsSummaryOpen(true)}
                                className="shrink-0 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm transition-all active:scale-95 flex items-center gap-2 animate-in zoom-in duration-200"
                            >
                                Tramitar ({selectedItems.length})
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* PRODUCT GRID */}
            <div className="p-6 md:p-8 max-w-7xl mx-auto">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-2.5 sm:gap-6 pb-24">
                    {filteredIngredients.map(ing => (
                        <OrderProductCard
                            key={ing.id}
                            ingredient={ing}
                            userId={userId!}
                            initialQuantity={drafts[ing.id]?.quantity || 0}
                            initialUnit={drafts[ing.id]?.unit}
                            onQuantityChange={(id, q, u) => setDrafts(prev => ({ ...prev, [id]: { quantity: q, unit: u } }))}
                        />
                    ))}
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
                supplierPhone={dbSuppliers.find(s => s.name.toLowerCase() === selectedSupplier?.toLowerCase())?.phone || null}
                isUploading={isUploading}
                isGenerating={isGenerating}
                onDownload={handleDownload}
                onClose={() => {
                    setIsSuccessOpen(false);
                    // Persistent quantities: no router.refresh() or reset needed
                }}
            />
        </div>
    );
}
