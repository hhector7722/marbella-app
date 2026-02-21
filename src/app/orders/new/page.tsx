'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, ChevronDown, Check, ArrowRight } from 'lucide-react';
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

    const handleFinalize = async () => {
        if (selectedItems.length === 0) {
            toast.error('No hay productos seleccionados');
            return;
        }

        // Validate Validation: Must have a selected supplier for the ID
        if (!selectedSupplier) {
            toast.error('Debes seleccionar un proveedor para generar el pedido');
            return;
        }

        const targetSupplier = dbSuppliers.find(s => s.name.toLowerCase() === selectedSupplier.toLowerCase());
        if (!targetSupplier) {
            toast.error(`El proveedor "${selectedSupplier}" no está registrado en la base de datos (Falta ID).`);
            return;
        }

        setIsProcessing(true);
        try {
            // 1. Generate PDF (Precios eliminados en pdf-generator)
            const orderNum = `ORD-${Date.now().toString().slice(-6)}`;
            console.log("NEW_ORDER_PAGE: Calling generateOrderPDF for", selectedSupplier);
            const blob = await generateOrderPDF({
                supplierName: selectedSupplier,
                items: selectedItems.map(i => ({
                    name: i.name,
                    quantity: i.quantity,
                    unit: i.unit,
                    price: 0, // Se ignora en el PDF
                    image: i.image_url // Pass image URL
                })),
                orderNumber: orderNum
            });
            setGeneratedBlob(blob);

            // 2. Open Success Modal and start background upload
            setIsSummaryOpen(false);
            setIsSuccessOpen(true);
            setIsUploading(true);

            // 3. Save Order Header
            const { data: order, error: orderError } = await supabase.from('purchase_orders').insert({
                order_number: orderNum,
                created_by: userId,
                supplier_id: targetSupplier.id, // CRITICAL FIX: Added supplier_id
                supplier_name: selectedSupplier,
                total_items: selectedItems.length,
                status: 'SENT'
            }).select().single();

            if (orderError) throw orderError;

            // 4. Save Order Items
            const orderItems = selectedItems.map(i => ({
                purchase_order_id: order.id,
                ingredient_id: i.id,
                ingredient_name: i.name,
                quantity: i.quantity,
                unit: i.unit,
                unit_price: 0 // No guardamos precio en pedidos
            }));
            await supabase.from('purchase_order_items').insert(orderItems);

            // 5. Upload PDF to Storage
            const fileName = `${orderNum}.pdf`;
            const { error: uploadError } = await supabase.storage.from('orders').upload(fileName, blob);
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('orders').getPublicUrl(fileName);

            // 6. Update order with PDF URL
            await supabase.from('purchase_orders').update({ pdf_url: publicUrl }).eq('id', order.id);
            setPdfUrl(publicUrl);

            // 7. Clear Drafts ONLY FOR THE ITEMS ORDERED
            const orderedIds = selectedItems.map(i => i.id);
            await supabase.from('order_drafts').delete()
                .eq('user_id', userId)
                .in('ingredient_id', orderedIds);

            setDrafts(prev => {
                const NewDrafts = { ...prev };
                orderedIds.forEach(id => delete NewDrafts[id]);
                return NewDrafts;
            });

            toast.success('Pedido procesado correctamente');

        } catch (error: any) {
            console.error('Error finalizing order:', error);
            toast.error('Error al procesar el pedido: ' + error.message);
        } finally {
            setIsProcessing(false);
            setIsUploading(false);
        }
    };

    const handleDownload = () => {
        if (!generatedBlob) return;
        const url = URL.createObjectURL(generatedBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Pedido_${Date.now()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
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
        <div className="p-6 md:p-8 w-full bg-[#5B8FB9] min-h-screen">
            <Toaster position="top-right" />

            {/* HEADER & FILTERS */}
            <div className="mb-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar ingrediente..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-white/95 rounded-2xl shadow-sm outline-none text-sm font-medium text-gray-700 focus:ring-2 focus:ring-[#5E35B1] transition-all"
                    />
                </div>

                <div className="flex gap-2 items-center relative flex-1 w-full sm:w-auto">
                    <div className="relative w-full sm:w-auto">
                        <button
                            onClick={() => setShowSupplierPopup(!showSupplierPopup)}
                            className={cn(
                                "w-full sm:w-auto px-5 py-3 bg-white/90 hover:bg-white rounded-2xl font-black text-[10px] text-zinc-800 uppercase tracking-widest shadow-sm transition-all flex items-center justify-between sm:justify-start gap-2 border border-white/50",
                                selectedSupplier && "bg-white border-[#5E35B1]/20 ring-1 ring-[#5E35B1]/10"
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

                    {/* REPOSITIONED: VER RESUMEN BUTTON AT TOP */}
                    {totalSelected > 0 && (
                        <button
                            onClick={() => setIsSummaryOpen(true)}
                            className="flex-1 sm:flex-initial bg-[#5E35B1] text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 hover:scale-105 active:scale-95 transition-all group animate-in slide-in-from-right-4"
                        >
                            <span>Resumen ({totalSelected})</span>
                            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    )}
                </div>
            </div>

            {/* PRODUCT GRID */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-4 pb-24">
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
                onDownload={handleDownload}
                onClose={() => {
                    setIsSuccessOpen(false);
                    router.refresh();
                }}
            />
        </div>
    );
}

