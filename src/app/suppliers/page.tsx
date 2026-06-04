'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import { Search, Plus, X, ChevronDown, Phone, Truck, Pencil, Trash2, Save, Upload, ImageIcon } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { toast, Toaster } from 'sonner';
import Image from 'next/image';
import { getSupplierLogo } from '@/lib/supplier-logos';
import { INITIAL_SUPPLIER_SEED, sortSuppliersByName } from '@/lib/supplier-seed';

interface Supplier {
    id: string; // bigint en BD; string en UI para soportar rows "initial-*"
    created_at: string | null;
    name: string;
    delivery_schedule: string | null;
    lead_time: string | null;
    reliability: string | null;
    phone: string | null;
    notes: string | null;
    email_domains: string[] | null;
    image_url: string | null;
    // Derivado (no existe en BD): se guarda dentro de notes como "Categoría (app): ..."
    category: string | null;
}

const CATEGORIES = ['Alimentos', 'Bebidas', 'Limpieza', 'Mantenimiento', 'Suministros', 'Otros'];

const INITIAL_SUPPLIERS: Partial<Supplier>[] = INITIAL_SUPPLIER_SEED.map((seed) => ({
    name: seed.name,
    category: seed.category ?? null,
}));

export default function SuppliersPage() {
    const [supabase] = useState(() => createClient());
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [showCategoryPopup, setShowCategoryPopup] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newSupplier, setNewSupplier] = useState<Partial<Supplier>>({ name: '', category: 'Alimentos' });
    const [isCreating, setIsCreating] = useState(false);

    function extractCategoryFromNotes(notes: string | null): string | null {
        if (!notes) return null;
        const m = notes.match(/(?:^|\n)\s*Categoría\s*\(app\)\s*:\s*(.+)\s*$/i);
        if (!m) return null;
        const v = String(m[1] ?? '').trim();
        return v ? v : null;
    }

    function stripCategoryFromNotes(notes: string | null): string | null {
        if (!notes) return null;
        const lines = notes
            .split('\n')
            .map((l) => l.trimEnd())
            .filter((l) => !/^\s*Categoría\s*\(app\)\s*:\s*/i.test(l));
        const joined = lines.join('\n').trim();
        return joined ? joined : null;
    }

    function buildNotesWithCategory(category: string | null | undefined, notesWithoutCategory: string | null | undefined): string | null {
        const cleanCategory = (category ?? '').trim();
        const cleanNotes = (notesWithoutCategory ?? '').trim();
        const parts = [
            cleanCategory ? `Categoría (app): ${cleanCategory}` : null,
            cleanNotes ? cleanNotes : null,
        ].filter(Boolean) as string[];
        const out = parts.join('\n').trim();
        return out ? out : null;
    }

    const isDbSupplierId = useCallback((id: string) => /^\d+$/.test(id), []);

    const fetchSuppliers = useCallback(async (showLoading = true, showErrorToast = true) => {
        try {
            if (showLoading) setLoading(true);
            const { data, error } = await supabase
                .from('suppliers')
                .select('id,created_at,name,delivery_schedule,lead_time,reliability,phone,notes,email_domains,image_url')
                .order('name');
            if (error) {
                console.error('Supabase Error:', error);
                if (showErrorToast) {
                    toast.error(`Error de base de datos: ${error.message}`);
                }
                throw error;
            }

            const dbSuppliers: Supplier[] = (data || []).map((r: {
                id: string | number;
                created_at: string | null;
                name: string | null;
                delivery_schedule: string | null;
                lead_time: string | null;
                reliability: string | null;
                phone: string | null;
                notes: string | null;
                email_domains: string[] | null;
                image_url: string | null;
            }) => ({
                id: String(r.id),
                created_at: r.created_at ?? null,
                name: String(r.name ?? ''),
                delivery_schedule: r.delivery_schedule ?? null,
                lead_time: r.lead_time ?? null,
                reliability: r.reliability ?? null,
                phone: r.phone ?? null,
                notes: r.notes ?? null,
                email_domains: Array.isArray(r.email_domains) ? r.email_domains : null,
                image_url: r.image_url ?? null,
                category: extractCategoryFromNotes(r.notes ?? null),
            })).filter((s) => s.name);

            // Las plantillas (INITIAL_SUPPLIERS) son únicamente "semilla" para una BD vacía.
            // Si la BD ya tiene proveedores, la fuente de la verdad es la BD: NO se inyectan
            // plantillas, así un proveedor borrado en Supabase desaparece de la UI.
            const combined =
                dbSuppliers.length === 0
                    ? INITIAL_SUPPLIERS.map((initial) => ({
                          id: `initial-${initial.name}`,
                          name: initial.name!,
                          created_at: null,
                          delivery_schedule: null,
                          lead_time: null,
                          reliability: null,
                          phone: null,
                          notes: initial.category ? `Categoría (app): ${initial.category}` : null,
                          email_domains: null,
                          image_url: null,
                          category: initial.category ?? null,
                      }))
                    : dbSuppliers;

            setSuppliers(sortSuppliersByName(combined));
        } catch (error: unknown) {
            console.error('Error fetching suppliers:', error);
            // Fallback solo si la base de datos está inaccesible o vacía
            if (suppliers.length === 0) {
                setSuppliers(INITIAL_SUPPLIERS.map((s, i) => ({
                    id: `fallback-${i}`,
                    name: s.name!,
                    category: s.category!,
                    created_at: null,
                    delivery_schedule: null,
                    lead_time: null,
                    reliability: null,
                    image_url: null,
                    phone: null,
                    notes: s.category ? `Categoría (app): ${s.category}` : null,
                    email_domains: null,
                })));
            }
        } finally {
            if (showLoading) setLoading(false);
        }
    }, [supabase, suppliers.length]);

    useEffect(() => {
        void fetchSuppliers();

        const refreshFromForeground = () => {
            if (document.visibilityState === 'visible') {
                void fetchSuppliers(false, false);
            }
        };

        const loadRole = async () => {
            try {
                const { data: { user }, error: userError } = await supabase.auth.getUser();
                if (userError) throw userError;
                if (!user) {
                    setUserRole(null);
                    return;
                }

                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                if (profileError) throw profileError;
                setUserRole((profile?.role ?? user.user_metadata?.role ?? null) as string | null);
            } catch (e) {
                console.error('Error loading user role in suppliers page:', e);
                setUserRole(null);
            }
        };

        void loadRole();

        const channel = supabase
            .channel('suppliers-page-live')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'suppliers' },
                () => void fetchSuppliers(false, false)
            )
            .subscribe();

        window.addEventListener('focus', refreshFromForeground);
        document.addEventListener('visibilitychange', refreshFromForeground);

        return () => {
            window.removeEventListener('focus', refreshFromForeground);
            document.removeEventListener('visibilitychange', refreshFromForeground);
            void supabase.removeChannel(channel);
        };
    }, [fetchSuppliers, supabase]);

    async function handleCreateSupplier() {
        const name = newSupplier.name?.trim();
        if (!name) {
            toast.error('El nombre es obligatorio');
            return;
        }
        try {
            setIsCreating(true);
            const phone = newSupplier.phone?.trim() || null;
            const notes = buildNotesWithCategory(newSupplier.category ?? null, null);
            const { error } = await supabase.from('suppliers').insert({
                name,
                phone,
                ...(notes ? { notes } : {}),
            });
            if (error) throw error;
            toast.success('Proveedor creado');
            await fetchSuppliers();
            setShowCreateModal(false);
            setNewSupplier({ name: '', category: 'Alimentos' });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            toast.error(`Error: ${message}`);
        } finally {
            setIsCreating(false);
        }
    }

    const [detailSupplier, setDetailSupplier] = useState<Supplier | null>(null);
    const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
    const [editNotes, setEditNotes] = useState<string>('');
    const [editEmailDomainsText, setEditEmailDomainsText] = useState<string>('');
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
    const [removeImage, setRemoveImage] = useState<boolean>(false);
    const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);

    function slugifyName(value: string): string {
        return value
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '')
            .slice(0, 60) || 'proveedor';
    }

    function extractSupplierStoragePath(url: string | null | undefined): string | null {
        if (!url) return null;
        const m = url.match(/\/storage\/v1\/object\/public\/suppliers\/(.+)$/);
        if (!m) return null;
        try {
            return decodeURIComponent(m[1]!);
        } catch {
            return m[1] ?? null;
        }
    }

    function resetImageEditState() {
        if (previewImageUrl) {
            URL.revokeObjectURL(previewImageUrl);
        }
        setSelectedImageFile(null);
        setPreviewImageUrl(null);
        setRemoveImage(false);
        setIsUploadingImage(false);
    }

    useEffect(() => {
        return () => {
            if (previewImageUrl) URL.revokeObjectURL(previewImageUrl);
        };
    }, [previewImageUrl]);

    const canEditOrDelete = useMemo(() => {
        if (!detailSupplier) return false;
        const isManager = userRole === 'manager';
        return isManager && isDbSupplierId(detailSupplier.id);
    }, [detailSupplier, isDbSupplierId, userRole]);

    function openEditModalFromDetail(s: Supplier) {
        const withoutCategory = stripCategoryFromNotes(s.notes ?? null) ?? '';
        resetImageEditState();
        setEditSupplier(s);
        setEditNotes(withoutCategory);
        setEditEmailDomainsText(Array.isArray(s.email_domains) ? s.email_domains.join(', ') : '');
    }

    function closeEditModal() {
        resetImageEditState();
        setEditSupplier(null);
    }

    function handleImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        e.target.value = '';
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error('El archivo debe ser una imagen (JPG, PNG, WebP o SVG).');
            return;
        }
        const maxBytes = 5 * 1024 * 1024;
        if (file.size > maxBytes) {
            toast.error('La imagen supera los 5 MB.');
            return;
        }

        if (previewImageUrl) URL.revokeObjectURL(previewImageUrl);
        const url = URL.createObjectURL(file);
        setSelectedImageFile(file);
        setPreviewImageUrl(url);
        setRemoveImage(false);
    }

    function handleRemoveImageClick() {
        if (previewImageUrl) {
            URL.revokeObjectURL(previewImageUrl);
            setPreviewImageUrl(null);
        }
        setSelectedImageFile(null);
        setRemoveImage(true);
    }

    async function handleSaveEdit() {
        if (!editSupplier) return;
        const name = editSupplier.name.trim();
        if (!name) {
            toast.error('El nombre es obligatorio');
            return;
        }

        const phone = editSupplier.phone?.trim() || null;
        const previousImageUrl = editSupplier.image_url?.trim() || null;
        const previousStoragePath = extractSupplierStoragePath(previousImageUrl);
        const notes = buildNotesWithCategory(editSupplier.category ?? null, editNotes);

        const emailDomains = editEmailDomainsText
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

        let nextImageUrl: string | null = previousImageUrl;

        try {
            setIsSavingEdit(true);

            if (selectedImageFile) {
                setIsUploadingImage(true);
                const ext = (selectedImageFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
                const folder = isDbSupplierId(editSupplier.id) ? editSupplier.id : slugifyName(name);
                const path = `${folder}/${Date.now()}-${slugifyName(name)}.${ext}`;

                const { error: uploadError } = await supabase.storage
                    .from('suppliers')
                    .upload(path, selectedImageFile, {
                        upsert: true,
                        cacheControl: '3600',
                        contentType: selectedImageFile.type || undefined,
                    });
                if (uploadError) throw uploadError;

                const { data: pub } = supabase.storage.from('suppliers').getPublicUrl(path);
                if (!pub?.publicUrl) {
                    throw new Error('No se pudo obtener la URL pública de la imagen.');
                }
                nextImageUrl = pub.publicUrl;
                setIsUploadingImage(false);

                if (previousStoragePath && previousStoragePath !== path) {
                    const { error: removePrevError } = await supabase.storage
                        .from('suppliers')
                        .remove([previousStoragePath]);
                    if (removePrevError) {
                        console.warn('No se pudo borrar la imagen anterior:', removePrevError);
                    }
                }
            } else if (removeImage) {
                nextImageUrl = null;
                if (previousStoragePath) {
                    const { error: removeError } = await supabase.storage
                        .from('suppliers')
                        .remove([previousStoragePath]);
                    if (removeError) {
                        console.warn('No se pudo borrar la imagen del bucket:', removeError);
                    }
                }
            }

            if (isDbSupplierId(editSupplier.id)) {
                const { error } = await supabase
                    .from('suppliers')
                    .update({
                        name,
                        phone,
                        notes,
                        image_url: nextImageUrl,
                        email_domains: emailDomains.length ? emailDomains : null,
                    })
                    .eq('id', Number(editSupplier.id));

                if (error) throw error;
                toast.success('Proveedor actualizado');
            } else {
                // Plantilla/fallback: crear en BD como proveedor real
                const { error } = await supabase
                    .from('suppliers')
                    .insert({
                        name,
                        phone,
                        notes,
                        image_url: nextImageUrl,
                        email_domains: emailDomains.length ? emailDomains : null,
                    });
                if (error) throw error;
                toast.success('Proveedor creado en la base de datos');
            }

            resetImageEditState();
            setEditSupplier(null);
            await fetchSuppliers(false, true);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            const lower = message.toLowerCase();
            if (lower.includes('bucket') && (lower.includes('not found') || lower.includes('does not exist'))) {
                toast.error("No existe el bucket 'suppliers' en Storage. Aplica la migración 20260511230000_suppliers_storage_bucket.sql.");
            } else {
                toast.error(`Error de base de datos: ${message}`);
            }
        } finally {
            setIsSavingEdit(false);
            setIsUploadingImage(false);
        }
    }

    async function handleDeleteSupplier(s: Supplier) {
        if (!isDbSupplierId(s.id)) {
            toast.error('Este proveedor es una plantilla y no existe en la base de datos.');
            return;
        }

        const ok = window.confirm(`¿Seguro que quieres eliminar "${s.name}"? Esta acción no se puede deshacer.`);
        if (!ok) return;

        try {
            setIsDeleting(true);
            const { error } = await supabase
                .from('suppliers')
                .delete()
                .eq('id', Number(s.id));

            if (error) throw error;
            toast.success('Proveedor eliminado');
            setDetailSupplier(null);
            await fetchSuppliers(false, true);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            toast.error(`Error de base de datos: ${message}`);
        } finally {
            setIsDeleting(false);
        }
    }

    const filteredSuppliers = suppliers.filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (s.notes?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
        const matchesCategory = !selectedCategory || s.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="flex h-[100dvh] max-h-[100dvh] w-full flex-col bg-[#5B8FB9]">
            <Toaster position="top-right" />

            <div className="shrink-0 px-6 pb-4 pt-4 md:px-8 md:pb-6 md:pt-6">
            <div className="flex flex-row items-center gap-2">
                <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-2.5 md:left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 md:pl-10 pr-2 md:pr-4 py-2 md:py-3 bg-white/95 rounded-xl md:rounded-2xl shadow-sm outline-none text-xs md:text-sm font-medium text-gray-700 focus:ring-2 focus:ring-emerald-400"
                    />
                </div>
                <div className="flex gap-1.5 md:gap-2 items-center shrink-0">
                    {!selectedCategory ? (
                        <div className="relative">
                            <button
                                onClick={() => setShowCategoryPopup(!showCategoryPopup)}
                                className="px-2.5 md:px-5 py-2 md:py-3 bg-white/90 hover:bg-white rounded-xl md:rounded-2xl font-black text-[9px] md:text-[10px] text-zinc-800 uppercase tracking-widest shadow-sm transition-all flex items-center gap-1 md:gap-2 border border-white/50"
                            >
                                <span className="hidden sm:inline">Categoría</span><span className="sm:hidden">Cat.</span> <ChevronDown size={12} className="text-zinc-400 md:w-3.5 md:h-3.5" />
                            </button>
                            {showCategoryPopup && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setShowCategoryPopup(false)}></div>
                                    <div className="absolute top-full right-0 mt-2 w-40 md:w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-40 animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-auto">
                                        <div className="px-4 py-2 border-b border-gray-50 mb-1">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Seleccionar</span>
                                        </div>
                                        <button
                                            onClick={() => { setSelectedCategory(null); setShowCategoryPopup(false); }}
                                            className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-zinc-50 transition-colors uppercase tracking-wider"
                                        >
                                            Todas
                                        </button>
                                        {CATEGORIES.map(cat => (
                                            <button
                                                key={cat}
                                                onClick={() => { setSelectedCategory(cat); setShowCategoryPopup(false); }}
                                                className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-zinc-50 transition-colors uppercase tracking-wider"
                                            >
                                                {cat}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-1 bg-white rounded-xl md:rounded-2xl pl-2.5 md:pl-4 pr-1 md:pr-1.5 py-1 md:py-1.5 shadow-md border border-white max-w-[100px] md:max-w-none">
                            <span className="text-zinc-800 font-black text-[9px] md:text-[10px] uppercase tracking-widest truncate">{selectedCategory}</span>
                            <button
                                onClick={() => setSelectedCategory(null)}
                                className="p-1 md:p-1.5 hover:bg-zinc-100 rounded-xl transition-colors shrink-0"
                            >
                                <X size={12} className="text-rose-500 md:w-3.5 md:h-3.5" strokeWidth={4} />
                            </button>
                        </div>
                    )}
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="bg-emerald-600 text-white w-9 h-9 md:w-12 md:h-12 rounded-xl md:rounded-2xl shadow-lg hover:bg-emerald-700 transition-all flex items-center justify-center hover:scale-105 active:scale-95 shrink-0"
                    >
                        <Plus className="w-5 h-5 md:w-6 md:h-6" />
                    </button>
                </div>
            </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y scroll-pb-end px-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-8">
            {loading ? (
                <div className="flex w-full items-center justify-center py-20">
                    <LoadingSpinner size="xl" className="text-white" />
                </div>
            ) : (
                <>
                <div className="grid grid-cols-3 gap-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
                    {filteredSuppliers.map((supplier) => (
                        <div key={supplier.id} className="relative group">
                            <div
                                onClick={() => setDetailSupplier(supplier)}
                                className="bg-white rounded-2xl p-1.5 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer h-full flex flex-col active:scale-95"
                            >
                                <div className="h-14 w-full bg-white rounded-lg flex items-center justify-center mb-1 overflow-hidden relative">
                                    {getSupplierLogo(supplier.image_url, supplier.name) ? (
                                        <img
                                            src={getSupplierLogo(supplier.image_url, supplier.name) || ''}
                                            alt=""
                                            className="w-full h-full object-contain"
                                        />
                                    ) : (
                                        <Truck className="w-6 h-6 text-gray-200" />
                                    )}
                                </div>
                                <div className="flex justify-between items-center mt-auto px-0.5 gap-1">
                                    <span
                                        className="font-bold text-gray-700 text-[10px] leading-tight truncate"
                                        title={supplier.name}
                                    >
                                        {supplier.name}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {filteredSuppliers.length === 0 && !loading && (
                        <div className="col-span-full py-20 bg-white/5 rounded-[2.5rem] border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-4">
                            <Truck size={48} className="text-white/20" />
                            <p className="text-white/40 font-black uppercase tracking-widest text-xs">No se encontraron proveedores</p>
                        </div>
                    )}
                </div>
                <div className="scroll-end-touch" aria-hidden />
                </>
            )}
            </div>

            {/* MODAL DETALLE / CONTACTO PROVEEDOR */}
            {detailSupplier && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[220] p-4" onClick={() => setDetailSupplier(null)}>
                    <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end -mt-4 -mr-4 mb-2">
                            <button onClick={() => setDetailSupplier(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                                <X className="text-gray-400" size={20} />
                            </button>
                        </div>

                        <div className="w-32 h-32 mx-auto rounded-3xl flex items-center justify-center mb-3 overflow-hidden">
                            {getSupplierLogo(detailSupplier.image_url, detailSupplier.name) ? (
                                <img src={getSupplierLogo(detailSupplier.image_url, detailSupplier.name) || ''} alt="" className="w-full h-full object-contain" />
                            ) : (
                                <Truck className="w-12 h-12 text-gray-200" />
                            )}
                        </div>

                        <h2 className="text-xl font-black text-gray-800 uppercase tracking-wider mb-0.5">
                            {detailSupplier.name}
                        </h2>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] mb-6">
                            {detailSupplier.category || ' '}
                        </p>

                        {userRole === 'manager' && (
                            <div className="grid grid-cols-2 gap-3 mb-6 mt-4">
                                <button
                                    type="button"
                                    disabled={!canEditOrDelete}
                                    onClick={() => openEditModalFromDetail(detailSupplier)}
                                    className="min-h-[48px] rounded-2xl bg-[#36606F] text-white font-black uppercase tracking-wider text-xs shadow-sm hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                                    title={!canEditOrDelete ? 'Solo se pueden editar proveedores existentes en BD (no plantillas).' : undefined}
                                >
                                    <Pencil size={16} />
                                    Editar
                                </button>
                                <button
                                    type="button"
                                    disabled={!canEditOrDelete || isDeleting}
                                    onClick={() => void handleDeleteSupplier(detailSupplier)}
                                    className="min-h-[48px] rounded-2xl bg-rose-600 text-white font-black uppercase tracking-wider text-xs shadow-sm hover:bg-rose-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                                    title={!canEditOrDelete ? 'Solo se pueden eliminar proveedores existentes en BD (no plantillas).' : undefined}
                                >
                                    <Trash2 size={16} />
                                    {isDeleting ? 'Eliminando…' : 'Eliminar'}
                                </button>
                            </div>
                        )}

                        <div className="flex items-center justify-center gap-6 mt-2">
                            {detailSupplier.phone && (
                                <>
                                    <a
                                        href={`tel:${detailSupplier.phone.replace(/\D/g, '').startsWith('34') ? '+' + detailSupplier.phone.replace(/\D/g, '') : '+34' + detailSupplier.phone.replace(/\D/g, '')}`}
                                        className="h-12 w-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white grid place-items-center transition-colors active:scale-95 shadow-sm"
                                        title="Llamar"
                                    >
                                        <Phone size={22} />
                                    </a>
                                    <a
                                        href={`https://wa.me/${detailSupplier.phone.replace(/\D/g, '').startsWith('34') ? detailSupplier.phone.replace(/\D/g, '') : '34' + detailSupplier.phone.replace(/\D/g, '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="transition-all hover:scale-110 active:scale-95"
                                        title="WhatsApp"
                                    >
                                        <Image src="/icons/whatsapp.png" alt="WhatsApp" width={36} height={36} className="object-contain" />
                                    </a>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL EDICIÓN PROVEEDOR */}
            {editSupplier && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[230] p-4" onClick={closeEditModal}>
                    <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-5">
                            <div className="flex flex-col">
                                <h2 className="text-lg font-black text-zinc-900 uppercase tracking-wider leading-none">
                                    {isDbSupplierId(editSupplier.id) ? 'Editar proveedor' : 'Crear en BD'}
                                </h2>
                                {!isDbSupplierId(editSupplier.id) && (
                                    <p className="text-[10px] text-zinc-400 font-black uppercase tracking-[0.2em] mt-1">
                                        Este proveedor era plantilla. Al guardar se creará en Supabase.
                                    </p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={closeEditModal}
                                className="w-10 h-10 flex items-center justify-center rounded-2xl hover:bg-zinc-100 transition-colors shrink-0"
                            >
                                <X className="text-zinc-400" size={18} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Nombre</label>
                                <input
                                    value={editSupplier.name ?? ''}
                                    onChange={(e) => setEditSupplier({ ...editSupplier, name: e.target.value })}
                                    className="w-full min-h-[48px] px-3 rounded-2xl border border-zinc-200 font-bold outline-none focus:border-[#36606F] focus:ring-2 focus:ring-[#36606F]/20"
                                    placeholder="Ej. Suministros Marbella"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Categoría</label>
                                    <select
                                        value={editSupplier.category ?? 'Alimentos'}
                                        onChange={(e) => setEditSupplier({ ...editSupplier, category: e.target.value })}
                                        className="w-full min-h-[48px] px-3 rounded-2xl border border-zinc-200 bg-white font-bold outline-none focus:border-[#36606F] focus:ring-2 focus:ring-[#36606F]/20"
                                    >
                                        {CATEGORIES.map((cat) => (
                                            <option key={cat} value={cat}>
                                                {cat}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Teléfono</label>
                                    <input
                                        value={editSupplier.phone ?? ''}
                                        onChange={(e) => setEditSupplier({ ...editSupplier, phone: e.target.value })}
                                        className="w-full min-h-[48px] px-3 rounded-2xl border border-zinc-200 font-bold outline-none focus:border-[#36606F] focus:ring-2 focus:ring-[#36606F]/20"
                                        placeholder="600 000 000"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Logo</label>
                                {(() => {
                                    const displaySrc = previewImageUrl
                                        ?? (removeImage
                                            ? null
                                            : getSupplierLogo(editSupplier.image_url, editSupplier.name));
                                    const hasAnyImage = Boolean(displaySrc);
                                    return (
                                        <div className="rounded-2xl border border-zinc-100 bg-zinc-50 overflow-hidden">
                                            <div className="h-32 w-full flex items-center justify-center bg-white">
                                                {hasAnyImage && displaySrc ? (
                                                    <img
                                                        src={displaySrc}
                                                        alt=""
                                                        className="max-h-full max-w-full object-contain"
                                                    />
                                                ) : (
                                                    <div className="flex flex-col items-center gap-1 text-zinc-300">
                                                        <ImageIcon size={32} />
                                                        <span className="text-[10px] font-black uppercase tracking-widest">Sin logo</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-2 border-t border-zinc-100 bg-zinc-50 p-2">
                                                <input
                                                    type="file"
                                                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                                    className="hidden"
                                                    id="supplier-logo-upload"
                                                    onChange={handleImageFileChange}
                                                    disabled={isSavingEdit || isUploadingImage}
                                                />
                                                <label
                                                    htmlFor="supplier-logo-upload"
                                                    className={`inline-flex min-h-[48px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-[11px] font-black uppercase tracking-widest text-zinc-800 transition-colors hover:bg-zinc-100 active:bg-zinc-50 ${(isSavingEdit || isUploadingImage) ? 'pointer-events-none opacity-60' : ''}`}
                                                >
                                                    <Upload size={16} strokeWidth={2.5} />
                                                    {selectedImageFile ? 'Cambiar' : 'Subir'}
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={handleRemoveImageClick}
                                                    disabled={!hasAnyImage || isSavingEdit || isUploadingImage}
                                                    className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-rose-100 bg-white px-3 text-[11px] font-black uppercase tracking-widest text-rose-600 transition-colors hover:bg-rose-50 active:bg-rose-100 disabled:opacity-50 disabled:pointer-events-none"
                                                >
                                                    <Trash2 size={16} strokeWidth={2.5} />
                                                    Eliminar
                                                </button>
                                            </div>
                                            <p className="px-3 pb-2 pt-1 text-[10px] font-semibold text-zinc-400">
                                                PNG, JPG, WebP o SVG · máx. 5 MB
                                            </p>
                                        </div>
                                    );
                                })()}
                            </div>

                            <div>
                                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Dominios email (separados por coma)</label>
                                <input
                                    value={editEmailDomainsText}
                                    onChange={(e) => setEditEmailDomainsText(e.target.value)}
                                    className="w-full min-h-[48px] px-3 rounded-2xl border border-zinc-200 font-bold outline-none focus:border-[#36606F] focus:ring-2 focus:ring-[#36606F]/20"
                                    placeholder="proveedor.com, proveedor.es"
                                />
                            </div>

                            <div>
                                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Notas</label>
                                <textarea
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    className="w-full min-h-[96px] px-3 py-3 rounded-2xl border border-zinc-200 font-bold outline-none focus:border-[#36606F] focus:ring-2 focus:ring-[#36606F]/20 resize-none"
                                    placeholder="Observaciones internas…"
                                />
                            </div>

                            <button
                                type="button"
                                disabled={isSavingEdit}
                                onClick={() => void handleSaveEdit()}
                                className="w-full min-h-[48px] rounded-2xl bg-emerald-600 text-white font-black uppercase tracking-wider text-xs shadow-sm hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:pointer-events-none"
                            >
                                {isSavingEdit ? (
                                    <>
                                        <LoadingSpinner size="sm" className="text-white" />
                                        <span>Guardando…</span>
                                    </>
                                ) : (
                                    <>
                                        <Save size={16} />
                                        Guardar cambios
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL CREACIÓN PROVEEDOR - ESTILO INGREDIENTES */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[220] p-4" onClick={() => setShowCreateModal(false)}>
                    <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-[#3F51B5]">Nuevo Proveedor</h2>
                            <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><X className="text-gray-400" /></button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Nombre Empresa</label>
                                <input
                                    autoFocus
                                    value={newSupplier.name ?? ''}
                                    onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value })}
                                    className="w-full p-3 border rounded-xl font-bold outline-none focus:border-[#5E35B1]"
                                    placeholder="Ej. Suministros Marbella"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Categoría</label>
                                    <select
                                        value={newSupplier.category ?? 'Alimentos'}
                                        onChange={e => setNewSupplier({ ...newSupplier, category: e.target.value })}
                                        className="w-full p-3 border rounded-xl bg-white font-bold outline-none focus:border-[#5E35B1]"
                                    >
                                        {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Teléfono</label>
                                    <input
                                        value={newSupplier.phone ?? ''}
                                        onChange={e => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                                        className="w-full p-3 border rounded-xl font-bold outline-none focus:border-[#5E35B1]"
                                        placeholder="600 000 000"
                                    />
                                </div>
                            </div>

                            <button
                                type="button"
                                disabled={isCreating}
                                onClick={() => void handleCreateSupplier()}
                                className="w-full min-h-[48px] py-4 bg-[#5E35B1] text-white rounded-xl font-bold mt-2 shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:pointer-events-none"
                            >
                                {isCreating ? (
                                    <>
                                        <LoadingSpinner size="sm" className="text-white" />
                                        <span>Guardando...</span>
                                    </>
                                ) : 'Crear Proveedor'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
