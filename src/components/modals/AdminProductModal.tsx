'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronDown, ChevronRight, FileText, Search } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';
import { confirmarMapeoAction } from '@/lib/actions/albaranes';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface AdminProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenSupplierModal: () => void;
}

type Tab = 'menu' | 'albaranes';

interface PurchaseInvoiceLine {
    id: string;
    invoice_id: string;
    original_name: string;
    quantity: number | null;
    unit_price: number | null;
    total_price: number | null;
    mapped_ingredient_id: string | null;
    status: string | null;
}

interface PurchaseInvoice {
    id: string;
    supplier_id: number | null;
    invoice_number: string | null;
    invoice_date: string | null;
    total_amount: number | null;
    file_path: string;
    status: string;
    created_at: string;
    purchase_invoice_lines?: PurchaseInvoiceLine[];
    suppliers?: { id: number; name: string } | null;
}

interface RawInvoiceResponse extends Omit<PurchaseInvoice, 'purchase_invoice_lines' | 'suppliers'> {
    suppliers: { id: number; name: string } | { id: number; name: string }[] | null;
}

interface Ingredient {
    id: string;
    name: string;
}

const ADMIN_MENU_ITEMS = [
    { title: 'Recetas', img: '/icons/recipes.png', link: '/recipes', hover: 'hover:bg-red-50/30' },
    { title: 'Ingredientes', img: '/icons/ingrediente.png', link: '/ingredients', hover: 'hover:bg-orange-50/30' },
    { title: 'Pedidos', img: '/icons/shipment.png', link: '/orders/new', hover: 'hover:bg-emerald-50/30' },
    { title: 'Inventario', img: '/icons/inventory.png', hover: 'hover:bg-purple-50/30' },
    { title: 'Stock', img: '/icons/productes.png', hover: 'hover:bg-blue-50/30' },
    { title: 'Proveedores', img: '/icons/suplier.png', link: '/suppliers', hover: 'hover:bg-zinc-100/30' },
];

export function AdminProductModal({ isOpen, onClose, onOpenSupplierModal }: AdminProductModalProps) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<Tab>('menu');
    const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

    const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([]);
    const [loadingAlbaranes, setLoadingAlbaranes] = useState(false);
    const [linkingLineId, setLinkingLineId] = useState<string | null>(null);
    const [selectedSupplierPerInvoice, setSelectedSupplierPerInvoice] = useState<Record<string, number | undefined>>({});

    const fetchAlbaranes = useCallback(async () => {
        const supabase = createClient();
        setLoadingAlbaranes(true);
        try {
            const { data: invData, error: invError } = await supabase
                .from('purchase_invoices')
                .select(`
                    id,
                    supplier_id,
                    invoice_number,
                    invoice_date,
                    total_amount,
                    file_path,
                    status,
                    created_at,
                    suppliers ( id, name )
                `)
                .eq('status', 'pending_mapping')
                .order('created_at', { ascending: false });

            if (invError) throw invError;

            const rawInvoices = (invData as unknown) as RawInvoiceResponse[];

            const { data: linesData, error: linesError } = await supabase
                .from('purchase_invoice_lines')
                .select('*')
                .in('invoice_id', (rawInvoices || []).map((i) => i.id));

            if (linesError) throw linesError;

            const linesByInvoice = (linesData || []).reduce<Record<string, PurchaseInvoiceLine[]>>((acc, line) => {
                const id = line.invoice_id;
                if (!acc[id]) acc[id] = [];
                acc[id].push(line);
                return acc;
            }, {});

            const invoicesWithLines: PurchaseInvoice[] = (rawInvoices || []).map((inv) => ({
                ...inv,
                suppliers: Array.isArray(inv.suppliers) ? inv.suppliers[0] : inv.suppliers,
                purchase_invoice_lines: linesByInvoice[inv.id] || [],
            }));

            setInvoices(invoicesWithLines);

            const { data: ingData } = await supabase.from('ingredients').select('id, name').order('name');
            setIngredients(ingData || []);

            const { data: supData } = await supabase.from('suppliers').select('id, name').order('name');
            setSuppliers(supData || []);
        } catch (e) {
            console.error(e);
            toast.error('Error al cargar albaranes');
            setInvoices([]);
        } finally {
            setLoadingAlbaranes(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen && activeTab === 'albaranes') fetchAlbaranes();
    }, [isOpen, activeTab, fetchAlbaranes]);

    const handleEnlazar = async (
        lineId: string,
        invoiceId: string,
        supplierId: number | null,
        originalName: string,
        ingredientId: string,
        conversionFactor: number
    ) => {
        const sid = supplierId ?? selectedSupplierPerInvoice[invoiceId];
        if (sid == null) {
            toast.error('Selecciona un proveedor para esta factura');
            return;
        }
        setLinkingLineId(lineId);
        try {
            const formData = new FormData();
            formData.set('lineId', lineId);
            formData.set('supplierId', String(sid));
            formData.set('originalName', originalName);
            formData.set('ingredientId', ingredientId);
            formData.set('conversionFactor', String(conversionFactor));
            await confirmarMapeoAction(formData);
            toast.success('Línea enlazada');
            await fetchAlbaranes();
            router.refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al enlazar');
        } finally {
            setLinkingLineId(null);
        }
    };

    if (!isOpen) return null;

    const isAlbaranes = activeTab === 'albaranes';
    const pendingLines = invoices.flatMap((inv) =>
        (inv.purchase_invoice_lines || []).filter((l) => !l.mapped_ingredient_id)
    );
    const hasPending = pendingLines.length > 0;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div
                className={cn(
                    'bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-4 duration-300',
                    isAlbaranes ? 'w-full max-w-2xl' : 'w-full max-w-sm'
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-[#36606F] px-4 py-3 flex justify-between items-center text-white shrink-0">
                    <div className="flex items-center gap-2">
                        <h3 className="text-lg font-black uppercase tracking-wider leading-none">Producto</h3>
                        <div className="flex rounded-lg bg-white/10 overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setActiveTab('menu')}
                                className={cn(
                                    'px-3 py-1.5 text-[10px] font-bold uppercase',
                                    activeTab === 'menu' ? 'bg-white text-[#36606F]' : 'text-white/80 hover:bg-white/10'
                                )}
                            >
                                Menú
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('albaranes')}
                                className={cn(
                                    'px-3 py-1.5 text-[10px] font-bold uppercase flex items-center gap-1',
                                    activeTab === 'albaranes' ? 'bg-white text-[#36606F]' : 'text-white/80 hover:bg-white/10'
                                )}
                            >
                                <FileText size={12} />
                                Albaranes
                                {hasPending && (
                                    <span className="bg-rose-500 text-white text-[8px] px-1.5 py-0 rounded-full">
                                        {pendingLines.length}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90">
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>

                {activeTab === 'menu' && (
                    <div className="p-4 grid grid-cols-2 gap-3 bg-gray-50/30 overflow-y-auto">
                        {ADMIN_MENU_ITEMS.map((item, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => {
                                    if (item.title === 'Pedidos') {
                                        onClose();
                                        setTimeout(() => onOpenSupplierModal(), 150);
                                    } else if (item.link) {
                                        router.push(item.link);
                                    } else {
                                        toast.info(`${item.title} próximamente`);
                                    }
                                }}
                                className={cn('bg-transparent border-0 p-4 rounded-2xl flex flex-col items-center gap-3 group transition-all active:scale-95', item.hover)}
                            >
                                <div className="w-12 h-12 transition-transform group-hover:scale-110">
                                    <Image src={item.img} alt={item.title} width={48} height={48} className="w-full h-full object-contain" />
                                </div>
                                <span className="font-black text-sm text-gray-700">{item.title}</span>
                            </button>
                        ))}
                    </div>
                )}

                {activeTab === 'albaranes' && (
                    <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 min-h-0">
                        {loadingAlbaranes ? (
                            <div className="flex items-center justify-center py-12">
                                <LoadingSpinner />
                            </div>
                        ) : !hasPending ? (
                            <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
                                <FileText className="mx-auto text-zinc-300 mb-3" size={40} />
                                <p className="text-sm font-bold text-zinc-600">Todos los albaranes están procesados</p>
                                <p className="text-xs text-zinc-400 mt-1">No hay facturas pendientes de mapeo.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {invoices.map((inv) => {
                                    const unmappedLines = (inv.purchase_invoice_lines || []).filter((l) => !l.mapped_ingredient_id);
                                    if (unmappedLines.length === 0) return null;
                                    const supplierName = inv.suppliers?.name ?? (inv.supplier_id ? 'Proveedor' : null);
                                    const isExpanded = expandedInvoiceId === inv.id;
                                    return (
                                        <div key={inv.id} className="rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
                                            <button
                                                type="button"
                                                onClick={() => setExpandedInvoiceId(isExpanded ? null : inv.id)}
                                                className="w-full flex items-center gap-2 p-3 text-left hover:bg-zinc-50 transition-colors"
                                            >
                                                {isExpanded ? <ChevronDown size={18} className="text-zinc-500 shrink-0" /> : <ChevronRight size={18} className="text-zinc-500 shrink-0" />}
                                                <span className="font-bold text-zinc-800 truncate flex-1">{supplierName || 'Sin proveedor'}</span>
                                                <span className="text-[10px] text-zinc-500 shrink-0">{inv.invoice_date || '—'}</span>
                                                <span className="font-black text-emerald-600 shrink-0">{inv.total_amount != null ? `${Number(inv.total_amount).toFixed(2)} €` : '—'}</span>
                                            </button>
                                            {isExpanded && (
                                                <div className="border-t border-zinc-100 p-3 space-y-3 bg-zinc-50/50">
                                                    {!inv.supplier_id && (
                                                        <div className="flex items-center gap-2">
                                                            <label className="text-[10px] font-bold text-zinc-500 uppercase shrink-0">Proveedor:</label>
                                                            <select
                                                                value={selectedSupplierPerInvoice[inv.id] ?? ''}
                                                                onChange={(e) => setSelectedSupplierPerInvoice((prev) => ({ ...prev, [inv.id]: e.target.value ? Number(e.target.value) : undefined }))}
                                                                className="flex-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm bg-white"
                                                            >
                                                                <option value="">Selecciona proveedor</option>
                                                                {suppliers.map((s) => (
                                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                    <table className="w-full text-left border-collapse">
                                                        <thead>
                                                            <tr className="text-[9px] font-black uppercase text-zinc-500 border-b border-zinc-200">
                                                                <th className="pb-1.5 pr-2">Artículo (PDF)</th>
                                                                <th className="pb-1.5 pr-2 w-20 text-right">P. unit.</th>
                                                                <th className="pb-1.5 pr-2">Ingrediente</th>
                                                                <th className="pb-1.5 pr-2 w-16">Factor</th>
                                                                <th className="pb-1.5 w-20"></th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {unmappedLines.map((line) => (
                                                                <LineMappingRow
                                                                    key={line.id}
                                                                    line={line}
                                                                    invoiceId={inv.id}
                                                                    supplierId={inv.supplier_id ?? selectedSupplierPerInvoice[inv.id] ?? undefined}
                                                                    ingredients={ingredients}
                                                                    onEnlazar={handleEnlazar}
                                                                    linking={linkingLineId === line.id}
                                                                />
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function LineMappingRow({
    line,
    invoiceId,
    supplierId,
    ingredients,
    onEnlazar,
    linking,
}: {
    line: PurchaseInvoiceLine;
    invoiceId: string;
    supplierId: number | undefined;
    ingredients: Ingredient[];
    onEnlazar: (lineId: string, invoiceId: string, supplierId: number | null, originalName: string, ingredientId: string, conversionFactor: number) => Promise<void>;
    linking: boolean;
}) {
    const [ingredientId, setIngredientId] = useState('');
    const [conversionFactor, setConversionFactor] = useState(1);
    const [search, setSearch] = useState('');
    const filtered = search.trim() ? ingredients.filter((i) => i.name.toLowerCase().includes(search.toLowerCase())) : ingredients;

    return (
        <tr className="border-b border-zinc-100 last:border-0 align-top">
            <td className="py-2 pr-2">
                <span className="text-xs font-medium text-zinc-800 block max-w-[140px] truncate" title={line.original_name}>{line.original_name}</span>
            </td>
            <td className="py-2 pr-2 text-right">
                <span className="text-xs font-black text-emerald-600">{line.unit_price != null ? `${Number(line.unit_price).toFixed(2)} €` : '—'}</span>
            </td>
            <td className="py-2 pr-2">
                <div className="relative">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input type="text" placeholder="Buscar ingrediente..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-7 pr-2 py-1 rounded-lg border border-zinc-200 text-xs bg-white" />
                    <select value={ingredientId} onChange={(e) => setIngredientId(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1 text-xs bg-white max-h-24">
                        <option value="">Seleccionar</option>
                        {filtered.slice(0, 50).map((ing) => (
                            <option key={ing.id} value={ing.id}>{ing.name}</option>
                        ))}
                    </select>
                </div>
            </td>
            <td className="py-2 pr-2">
                <input type="number" min={0.0001} step={0.01} value={conversionFactor} onChange={(e) => setConversionFactor(Number(e.target.value) || 1)} className="w-full rounded-lg border border-zinc-200 px-2 py-1 text-xs bg-white w-14" />
            </td>
            <td className="py-2">
                <button
                    type="button"
                    disabled={!ingredientId || supplierId == null || linking}
                    onClick={() => onEnlazar(line.id, invoiceId, supplierId ?? null, line.original_name, ingredientId, conversionFactor)}
                    className="rounded-lg bg-[#36606F] text-white text-[10px] font-bold px-2 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#2d4d59] active:scale-95 min-h-[32px]"
                >
                    {linking ? '...' : 'Enlazar'}
                </button>
            </td>
        </tr>
    );
}
