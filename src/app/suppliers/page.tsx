'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import { Plus, Truck, Upload, ImageIcon, Star } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { toast, Toaster } from 'sonner';
import Image from 'next/image';
import { getSupplierLogo } from '@/lib/supplier-logos';
import { INITIAL_SUPPLIER_SEED, sortSuppliersByName } from '@/lib/supplier-seed';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { namedEntitySummary } from '@/lib/usage/modal-apply';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/SearchField';
import { Field } from '@/components/ui/Field';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { CatalogFilterChip } from '@/components/catalog/CatalogFilterChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { SupplierPickerGrid } from '@/components/suppliers/SupplierPickerGrid';

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
    // Campos extendidos serializados
    order_deadline?: string | null;
    min_order?: string | null;
    order_channel?: string | null;
    contact_name?: string | null;
    payment_method?: string | null;
    instructions?: string | null;
    observations?: string | null;
}

interface SupplierNotesFields {
    category: string | null;
    order_deadline: string | null;
    min_order: string | null;
    order_channel: string | null;
    contact_name: string | null;
    payment_method: string | null;
    instructions: string | null;
    observations: string | null;
}

function parseSupplierNotes(notes: string | null): SupplierNotesFields {
    const defaultFields: SupplierNotesFields = {
        category: null,
        order_deadline: null,
        min_order: null,
        order_channel: null,
        contact_name: null,
        payment_method: null,
        instructions: null,
        observations: null,
    };

    if (!notes) return defaultFields;

    const trimmed = notes.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
            const parsed = JSON.parse(trimmed);
            return {
                category: parsed.category ?? null,
                order_deadline: parsed.order_deadline ?? null,
                min_order: parsed.min_order ?? null,
                order_channel: parsed.order_channel ?? null,
                contact_name: parsed.contact_name ?? null,
                payment_method: parsed.payment_method ?? null,
                instructions: parsed.instructions ?? null,
                observations: parsed.observations ?? null,
            };
        } catch (e) {
            console.error('Error parsing JSON from notes:', e);
        }
    }

    // Fallback para formato antiguo: Categoría (app): ...
    const lines = notes.split('\n');
    let category: string | null = null;
    const remainingLines: string[] = [];

    for (const line of lines) {
        const m = line.match(/^\s*Categoría\s*\(app\)\s*:\s*(.+)\s*$/i);
        if (m) {
            category = m[1].trim();
        } else {
            remainingLines.push(line);
        }
    }

    return {
        ...defaultFields,
        category,
        observations: remainingLines.join('\n').trim() || null,
    };
}

function buildNotesWithJSON(fields: SupplierNotesFields): string {
    return JSON.stringify(fields);
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
        const trimmed = notes.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
                const parsed = JSON.parse(trimmed);
                return parsed.category ?? null;
            } catch {
                // ignore
            }
        }
        const m = notes.match(/(?:^|\n)\s*Categoría\s*\(app\)\s*:\s*(.+)\s*$/i);
        if (!m) return null;
        const v = String(m[1] ?? '').trim();
        return v ? v : null;
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
            }) => {
                const fields = parseSupplierNotes(r.notes ?? null);
                return {
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
                    category: fields.category || extractCategoryFromNotes(r.notes ?? null),
                    order_deadline: fields.order_deadline,
                    min_order: fields.min_order,
                    order_channel: fields.order_channel,
                    contact_name: fields.contact_name,
                    payment_method: fields.payment_method,
                    instructions: fields.instructions,
                    observations: fields.observations,
                };
            }).filter((s) => s.name);

            // Las plantillas (INITIAL_SUPPLIERS) son únicamente "semilla" para una BD vacía.
            // Si la BD ya tiene proveedores, la fuente de la verdad es la BD: NO se inyectan
            // plantillas, así un proveedor borrado en Supabase desaparece de la UI.
            const combined =
                dbSuppliers.length === 0
                    ? INITIAL_SUPPLIERS.map((initial) => {
                          const seedNotes = initial.category ? `Categoría (app): ${initial.category}` : null;
                          const fields = parseSupplierNotes(seedNotes);
                          return {
                              id: `initial-${initial.name}`,
                              name: initial.name!,
                              created_at: null,
                              delivery_schedule: null,
                              lead_time: null,
                              reliability: null,
                              phone: null,
                              notes: seedNotes,
                              email_domains: null,
                              image_url: null,
                              category: initial.category ?? null,
                              order_deadline: fields.order_deadline,
                              min_order: fields.min_order,
                              order_channel: fields.order_channel,
                              contact_name: fields.contact_name,
                              payment_method: fields.payment_method,
                              instructions: fields.instructions,
                              observations: fields.observations,
                          };
                      })
                    : dbSuppliers;

            setSuppliers(sortSuppliersByName(combined));
        } catch (error: unknown) {
            console.error('Error fetching suppliers:', error);
            // Fallback solo si la base de datos está inaccesible o vacía
            if (suppliers.length === 0) {
                setSuppliers(INITIAL_SUPPLIERS.map((s, i) => {
                    const seedNotes = s.category ? `Categoría (app): ${s.category}` : null;
                    const fields = parseSupplierNotes(seedNotes);
                    return {
                        id: `fallback-${i}`,
                        name: s.name!,
                        category: s.category!,
                        created_at: null,
                        delivery_schedule: null,
                        lead_time: null,
                        reliability: null,
                        image_url: null,
                        phone: null,
                        notes: seedNotes,
                        email_domains: null,
                        order_deadline: fields.order_deadline,
                        min_order: fields.min_order,
                        order_channel: fields.order_channel,
                        contact_name: fields.contact_name,
                        payment_method: fields.payment_method,
                        instructions: fields.instructions,
                        observations: fields.observations,
                    };
                }));
            }
        } finally {
            if (showLoading) setLoading(false);
        }
    }, [supabase, suppliers.length]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
            const notesObj: SupplierNotesFields = {
                category: newSupplier.category ?? 'Alimentos',
                order_deadline: null,
                min_order: null,
                order_channel: null,
                contact_name: null,
                payment_method: null,
                instructions: null,
                observations: null,
            };
            const notes = buildNotesWithJSON(notesObj);
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
    
    // Estados para campos extendidos de edición
    const [editOrderDeadline, setEditOrderDeadline] = useState('');
    const [editMinOrder, setEditMinOrder] = useState('');
    const [editOrderChannel, setEditOrderChannel] = useState('');
    const [editContactName, setEditContactName] = useState('');
    const [editPaymentMethod, setEditPaymentMethod] = useState('');
    const [editInstructions, setEditInstructions] = useState('');

    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

    const trackSupplierCategory = useTrackModalApply('suppliers-category-filter', 'Filtro categoría proveedores');
    const trackSupplierDetail = useTrackModalApply('supplier-detail', 'Detalle proveedor');
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
        const fields = parseSupplierNotes(s.notes);
        resetImageEditState();
        setEditSupplier(s);
        setEditNotes(fields.observations ?? '');
        setEditEmailDomainsText(Array.isArray(s.email_domains) ? s.email_domains.join(', ') : '');
        
        // Cargar campos extendidos
        setEditOrderDeadline(fields.order_deadline ?? '');
        setEditMinOrder(fields.min_order ?? '');
        setEditOrderChannel(fields.order_channel ?? '');
        setEditContactName(fields.contact_name ?? '');
        setEditPaymentMethod(fields.payment_method ?? '');
        setEditInstructions(fields.instructions ?? '');
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
        
        // Serializar campos extendidos
        const notesObj: SupplierNotesFields = {
            category: editSupplier.category ?? 'Alimentos',
            order_deadline: editOrderDeadline.trim() || null,
            min_order: editMinOrder.trim() || null,
            order_channel: editOrderChannel.trim() || null,
            contact_name: editContactName.trim() || null,
            payment_method: editPaymentMethod.trim() || null,
            instructions: editInstructions.trim() || null,
            observations: editNotes.trim() || null,
        };
        const notes = buildNotesWithJSON(notesObj);

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
                        delivery_schedule: editSupplier.delivery_schedule || null,
                        lead_time: editSupplier.lead_time || null,
                        reliability: editSupplier.reliability || null,
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
                        delivery_schedule: editSupplier.delivery_schedule || null,
                        lead_time: editSupplier.lead_time || null,
                        reliability: editSupplier.reliability || null,
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

        setDeleteConfirmOpen(false);
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
        <>
            <Toaster position="top-right" />
            <DashboardDetailLayout
                title="Proveedores"
                titleFace="display"
                titleBlockClassName="w-full text-center"
                showBackButton={false}
                template="list"
                maxWidthClass="max-w-7xl"
                toolbarSlot={
                <div className="flex flex-row items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowCreateModal(true)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 hover:shadow transition-all"
                        aria-label="Nuevo proveedor"
                    >
                        <Plus size={16} strokeWidth={3} />
                    </button>
                    <div className="min-w-0 flex-1">
                        <SearchField
                            instance="suppliers-search"
                            placeholder="Buscar..."
                            value={searchQuery}
                            onChange={setSearchQuery}
                        />
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
                        {!selectedCategory ? (
                            <CatalogFilterChip
                                label="CAT"
                                onOpen={() => setShowCategoryPopup(true)}
                            />
                        ) : (
                            <CatalogFilterChip
                                label="CAT"
                                value={selectedCategory}
                                onClear={() => setSelectedCategory(null)}
                            />
                        )}
                    </div>
                </div>
                }
            >

            {!loading && (
                <div className="pt-1">
                    {filteredSuppliers.length === 0 ? (
                        <EmptyState
                            instance="suppliers-empty"
                            variant="mismatch"
                            title="No se encontraron proveedores"
                        />
                    ) : (
                        <SupplierPickerGrid
                            suppliers={filteredSuppliers}
                            onSelect={(supplier) => {
                                const full = filteredSuppliers.find((row) => row.id === supplier.id);
                                if (!full) return;
                                trackSupplierDetail(namedEntitySummary(supplier.name));
                                setDetailSupplier(full);
                            }}
                        />
                    )}
                </div>
            )}
            {loading ? (
                <div className="flex w-full items-center justify-center py-20">
                    <LoadingSpinner size="xl" className="text-ds-marca" />
                </div>
            ) : null}
            </DashboardDetailLayout>

            <Modal
                open={showCategoryPopup}
                onClose={() => setShowCategoryPopup(false)}
                title="Categoría"
                variant="compact"
                layer="base"
                instance="suppliers-category-filter"
                usageId="suppliers-category-filter"
                usageLabel="Filtro categoría proveedores"
            >
                <div>
                    <button
                        type="button"
                        onClick={() => { trackSupplierCategory('Todas'); setSelectedCategory(null); setShowCategoryPopup(false); }}
                        className="w-full min-h-12 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-700 transition-colors hover:bg-zinc-50"
                    >
                        Todas
                    </button>
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat}
                            type="button"
                            onClick={() => { trackSupplierCategory(cat); setSelectedCategory(cat); setShowCategoryPopup(false); }}
                            className="w-full min-h-12 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-700 transition-colors hover:bg-zinc-50"
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </Modal>

            <Modal
                open={!!detailSupplier}
                onClose={() => setDetailSupplier(null)}
                title={detailSupplier?.name ?? 'Proveedor'}
                subtitle={detailSupplier?.category || 'Ficha de Proveedor'}
                variant="amplify"
                scheme="dark"
                layer="base"
                instance="supplier-detail"
                headerTone="petroleum"
                usageId="supplier-detail"
                usageLabel="Detalle proveedor"
                footer={
                    userRole === 'manager' && detailSupplier ? (
                        <div className="flex w-full justify-end gap-3">
                            <Button
                                type="button"
                                variant="primary"
                                instance="supplier-detail-edit"
                                layout="hug"
                                disabled={!canEditOrDelete}
                                onClick={() => openEditModalFromDetail(detailSupplier)}
                            >
                                Editar
                            </Button>
                            <Button
                                type="button"
                                variant="destructive"
                                instance="supplier-detail-delete"
                                layout="hug"
                                disabled={!canEditOrDelete || isDeleting}
                                loading={isDeleting}
                                loadingLabel="Eliminando…"
                                onClick={() => setDeleteConfirmOpen(true)}
                            >
                                Eliminar
                            </Button>
                        </div>
                    ) : undefined
                }
            >
                {detailSupplier ? (() => {
                    const renderFieldValue = (val: string | null | undefined) => {
                        if (!val || !val.trim() || val === '—') {
                            return (
                                <span className="text-xs font-normal !text-zinc-400 select-none text-center flex-1">
                                    
                                </span>
                            );
                        }
                        return (
                            <span className="text-xs font-bold !text-zinc-800 ml-auto">
                                {val}
                            </span>
                        );
                    };

                    return (
                        <div className="space-y-4 px-2 py-2">
                            {/* Cabecera / Ficha principal */}
                            <div className="flex flex-col sm:flex-row items-center gap-4 rounded-2xl !bg-white p-5 !shadow-lg border border-zinc-100/60">
                                <div className="flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl !bg-white border border-zinc-100 shadow-sm p-1">
                                    {getSupplierLogo(detailSupplier.image_url, detailSupplier.name) ? (
                                        <img src={getSupplierLogo(detailSupplier.image_url, detailSupplier.name) || ''} alt="" className="h-full w-full object-contain" />
                                    ) : (
                                        <Truck className="h-8 w-8 text-zinc-300" />
                                    )}
                                </div>
                                
                                <div className="flex-1 text-center sm:text-left space-y-1 w-full">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div>
                                            <h2 className="text-base font-black !text-zinc-800 leading-tight">{detailSupplier.name}</h2>
                                            <span className="inline-block mt-0.5 rounded-full bg-ds-marca/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider !text-ds-marca">
                                                {detailSupplier.category || 'Sin categoría'}
                                            </span>
                                        </div>
                                        
                                        {/* Acciones de contacto directas */}
                                        {detailSupplier.phone ? (
                                            <div className="flex items-center justify-center sm:justify-end gap-2.5 self-center sm:self-auto">
                                                <a
                                                    href={`tel:${detailSupplier.phone.replace(/\D/g, '').startsWith('34') ? '+' + detailSupplier.phone.replace(/\D/g, '') : '+34' + detailSupplier.phone.replace(/\D/g, '')}`}
                                                    className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-600 shadow-sm transition-all hover:scale-105 active:scale-95"
                                                    title="Llamar directamente"
                                                >
                                                    <Image src="/icons/phone.png" alt="Llamar" width={24} height={24} className="object-contain" />
                                                </a>
                                                <a
                                                    href={`https://wa.me/${detailSupplier.phone.replace(/\D/g, '').startsWith('34') ? detailSupplier.phone.replace(/\D/g, '') : '34' + detailSupplier.phone.replace(/\D/g, '')}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-600 shadow-sm transition-all hover:scale-105 active:scale-95"
                                                    title="Enviar WhatsApp"
                                                >
                                                    <Image src="/icons/whatsapp.png" alt="WhatsApp" width={24} height={24} className="object-contain" />
                                                </a>
                                            </div>
                                        ) : null}
                                    </div>
                                    
                                    {/* Fiabilidad */}
                                    <div className="flex items-center justify-center sm:justify-start gap-2 pt-0.5">
                                        <span className="text-[10px] font-black uppercase tracking-wider !text-zinc-400">Fiabilidad</span>
                                        <div className="flex gap-0.5" aria-label={`Fiabilidad: ${Number(detailSupplier.reliability) || 0} de 5 estrellas`}>
                                            {Array.from({ length: 5 }).map((_, idx) => {
                                                const rating = Number(detailSupplier.reliability) || 0;
                                                return (
                                                    <Star
                                                        key={idx}
                                                        size={12}
                                                        className={idx < rating ? "fill-amber-400 text-amber-400" : "text-zinc-200"}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Contenido en dos columnas */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Columna 1 */}
                                <div className="space-y-4">
                                    {/* Bloque Logística */}
                                    <div className="rounded-2xl border border-zinc-100/60 !bg-white p-5 !shadow-lg">
                                        <h3 className="mb-3 text-[11px] font-black uppercase tracking-widest !text-zinc-400">
                                            Logística y Suministro
                                        </h3>
                                        <div className="space-y-2.5">
                                            <div className="flex justify-between items-center py-0.5 border-b !border-zinc-100/80">
                                                <span className="text-xs font-semibold !text-zinc-500 shrink-0">Día y hora límite de pedido</span>
                                                {renderFieldValue(detailSupplier.order_deadline)}
                                            </div>
                                            <div className="flex justify-between items-center py-0.5 border-b !border-zinc-100/80">
                                                <span className="text-xs font-semibold !text-zinc-500 shrink-0">Días de reparto</span>
                                                {renderFieldValue(detailSupplier.delivery_schedule)}
                                            </div>
                                            <div className="flex justify-between items-center py-0.5 border-b !border-zinc-100/80">
                                                <span className="text-xs font-semibold !text-zinc-500 shrink-0">Plazo de entrega</span>
                                                {renderFieldValue(detailSupplier.lead_time)}
                                            </div>
                                            <div className="flex justify-between items-center py-0.5">
                                                <span className="text-xs font-semibold !text-zinc-500 shrink-0">Pedido mínimo</span>
                                                {renderFieldValue(detailSupplier.min_order)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bloque Pedido y Contacto */}
                                    <div className="rounded-2xl border border-zinc-100/60 !bg-white p-5 !shadow-lg">
                                        <h3 className="mb-3 text-[11px] font-black uppercase tracking-widest !text-zinc-400">
                                            Pedido y Contacto
                                        </h3>
                                        <div className="space-y-2.5">
                                            <div className="flex justify-between items-center py-0.5 border-b !border-zinc-100/80">
                                                <span className="text-xs font-semibold !text-zinc-500 shrink-0">Canal de pedido</span>
                                                {renderFieldValue(detailSupplier.order_channel)}
                                            </div>
                                            <div className="flex justify-between items-center py-0.5 border-b !border-zinc-100/80">
                                                <span className="text-xs font-semibold !text-zinc-500 shrink-0">Contacto</span>
                                                {renderFieldValue(detailSupplier.contact_name)}
                                            </div>
                                            <div className="flex justify-between items-center py-0.5">
                                                <span className="text-xs font-semibold !text-zinc-500 shrink-0">Forma de pago</span>
                                                {renderFieldValue(detailSupplier.payment_method)}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Columna 2 */}
                                <div className="space-y-4">
                                    {/* Bloque Información Operativa - Instrucciones */}
                                    <div className="rounded-2xl border border-zinc-100/60 !bg-white p-5 !shadow-lg flex flex-col justify-between h-full">
                                        <div className="space-y-3">
                                            <div>
                                                <h3 className="mb-1.5 text-[11px] font-black uppercase tracking-widest !text-zinc-400">
                                                    Instrucciones Especiales
                                                </h3>
                                                <p className="text-xs !text-zinc-600 leading-relaxed whitespace-pre-wrap">
                                                    {detailSupplier.instructions || 'Sin instrucciones operativas específicas.'}
                                                </p>
                                            </div>
                                            
                                            <div className="pt-3 border-t !border-zinc-100/80">
                                                <h3 className="mb-1.5 text-[11px] font-black uppercase tracking-widest !text-zinc-400">
                                                    Observaciones
                                                </h3>
                                                <p className="text-xs !text-zinc-600 leading-relaxed whitespace-pre-wrap">
                                                    {detailSupplier.observations || 'Sin observaciones adicionales.'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })() : null}
            </Modal>

            <ConfirmModal
                open={deleteConfirmOpen && !!detailSupplier}
                onClose={() => { if (!isDeleting) setDeleteConfirmOpen(false); }}
                title="Eliminar proveedor"
                confirmLabel="Eliminar"
                instance="supplier-delete-confirm"
                usageLabel="Confirmar eliminar proveedor"
                confirming={isDeleting}
                onConfirm={() => {
                    if (detailSupplier) void handleDeleteSupplier(detailSupplier);
                }}
            >
                {`¿Seguro que quieres eliminar "${detailSupplier?.name ?? ''}"? Esta acción no se puede deshacer.`}
            </ConfirmModal>

            <Modal
                open={!!editSupplier}
                onClose={closeEditModal}
                title={editSupplier && isDbSupplierId(editSupplier.id) ? 'Editar proveedor' : 'Crear en BD'}
                subtitle={
                    editSupplier && !isDbSupplierId(editSupplier.id)
                        ? 'Este proveedor era plantilla. Al guardar se creará en Supabase.'
                        : undefined
                }
                variant="amplify"
                layer="derived"
                instance="supplier-edit"
                parentInstance="supplier-detail"
                usageId="supplier-edit"
                usageLabel="Editar proveedor"
                footer={
                    <div className="flex w-full justify-end gap-3">
                        <Button
                            type="button"
                            variant="secondary"
                            instance="supplier-edit-cancel"
                            layout="hug"
                            disabled={isSavingEdit}
                            onClick={closeEditModal}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            instance="supplier-edit-save"
                            layout="hug"
                            disabled={isSavingEdit}
                            loading={isSavingEdit}
                            loadingLabel="Guardando…"
                            onClick={() => void handleSaveEdit()}
                        >
                            Guardar cambios
                        </Button>
                    </div>
                }
            >
                {editSupplier ? (
                    <div className="space-y-4 px-1 py-1">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Columna Izquierda */}
                            <div className="space-y-4">
                                <Field instance="supplier-edit-name" label="Nombre" htmlFor="supplier-edit-name">
                                    <input
                                        id="supplier-edit-name"
                                        value={editSupplier.name ?? ''}
                                        onChange={(e) => setEditSupplier({ ...editSupplier, name: e.target.value })}
                                        placeholder="Ej. Suministros Marbella"
                                    />
                                </Field>

                                <div className="grid grid-cols-2 gap-3">
                                    <Field instance="supplier-edit-category" label="Categoría" htmlFor="supplier-edit-category">
                                        <select
                                            id="supplier-edit-category"
                                            value={editSupplier.category ?? 'Alimentos'}
                                            onChange={(e) => setEditSupplier({ ...editSupplier, category: e.target.value })}
                                        >
                                            {CATEGORIES.map((cat) => (
                                                <option key={cat} value={cat}>
                                                    {cat}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>
                                    <Field instance="supplier-edit-phone" label="Teléfono" htmlFor="supplier-edit-phone">
                                        <input
                                            id="supplier-edit-phone"
                                            value={editSupplier.phone ?? ''}
                                            onChange={(e) => setEditSupplier({ ...editSupplier, phone: e.target.value })}
                                            placeholder="600 000 000"
                                        />
                                    </Field>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <Field instance="supplier-edit-delivery-schedule" label="Días de reparto" htmlFor="supplier-edit-delivery-schedule">
                                        <input
                                            id="supplier-edit-delivery-schedule"
                                            value={editSupplier.delivery_schedule ?? ''}
                                            onChange={(e) => setEditSupplier({ ...editSupplier, delivery_schedule: e.target.value })}
                                            placeholder="Ej. Lunes, Miércoles"
                                        />
                                    </Field>
                                    <Field instance="supplier-edit-lead-time" label="Plazo de entrega" htmlFor="supplier-edit-lead-time">
                                        <input
                                            id="supplier-edit-lead-time"
                                            value={editSupplier.lead_time ?? ''}
                                            onChange={(e) => setEditSupplier({ ...editSupplier, lead_time: e.target.value })}
                                            placeholder="Ej. 24 horas"
                                        />
                                    </Field>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <Field instance="supplier-edit-reliability" label="Fiabilidad" htmlFor="supplier-edit-reliability">
                                        <select
                                            id="supplier-edit-reliability"
                                            value={editSupplier.reliability ?? ''}
                                            onChange={(e) => setEditSupplier({ ...editSupplier, reliability: e.target.value || null })}
                                        >
                                            <option value="">Sin valorar</option>
                                            <option value="1">1 estrella</option>
                                            <option value="2">2 estrellas</option>
                                            <option value="3">3 estrellas</option>
                                            <option value="4">4 estrellas</option>
                                            <option value="5">5 estrellas</option>
                                        </select>
                                    </Field>
                                    <Field instance="supplier-edit-order-channel" label="Canal de pedido" htmlFor="supplier-edit-order-channel">
                                        <input
                                            id="supplier-edit-order-channel"
                                            value={editOrderChannel}
                                            onChange={(e) => setEditOrderChannel(e.target.value)}
                                            placeholder="Ej. App, WhatsApp, llamada"
                                        />
                                    </Field>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <Field instance="supplier-edit-order-deadline" label="Día y hora límite de pedido" htmlFor="supplier-edit-order-deadline">
                                        <input
                                            id="supplier-edit-order-deadline"
                                            value={editOrderDeadline}
                                            onChange={(e) => setEditOrderDeadline(e.target.value)}
                                            placeholder="Ej. Lunes · 18:00"
                                        />
                                    </Field>
                                    <Field instance="supplier-edit-min-order" label="Pedido mínimo" htmlFor="supplier-edit-min-order">
                                        <input
                                            id="supplier-edit-min-order"
                                            value={editMinOrder}
                                            onChange={(e) => setEditMinOrder(e.target.value)}
                                            placeholder="Ej. 50 €"
                                        />
                                    </Field>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <Field instance="supplier-edit-contact-name" label="Nombre de contacto" htmlFor="supplier-edit-contact-name">
                                        <input
                                            id="supplier-edit-contact-name"
                                            value={editContactName}
                                            onChange={(e) => setEditContactName(e.target.value)}
                                            placeholder="Ej. Juan Pérez"
                                        />
                                    </Field>
                                    <Field instance="supplier-edit-payment-method" label="Forma de pago" htmlFor="supplier-edit-payment-method">
                                        <input
                                            id="supplier-edit-payment-method"
                                            value={editPaymentMethod}
                                            onChange={(e) => setEditPaymentMethod(e.target.value)}
                                            placeholder="Ej. Transferencia, Giro"
                                        />
                                    </Field>
                                </div>
                            </div>

                            {/* Columna Derecha */}
                            <div className="space-y-4 flex flex-col justify-between">
                                <div>
                                    <label className="mb-1.5 ml-1 block text-[9px] font-black uppercase tracking-widest text-gray-400">Logo</label>
                                    {(() => {
                                        const displaySrc = previewImageUrl
                                            ?? (removeImage
                                                ? null
                                                : getSupplierLogo(editSupplier.image_url, editSupplier.name));
                                        const hasAnyImage = Boolean(displaySrc);
                                        return (
                                            <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-50">
                                                <div className="flex h-32 w-full items-center justify-center bg-white">
                                                    {hasAnyImage && displaySrc ? (
                                                        <img
                                                            src={displaySrc}
                                                            alt=""
                                                            className="max-h-full max-w-full object-contain p-2"
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
                                                    <Button
                                                        type="button"
                                                        variant="destructive"
                                                        instance="supplier-edit-remove-image"
                                                        layout="hug"
                                                        className="flex-1"
                                                        disabled={!hasAnyImage || isSavingEdit || isUploadingImage}
                                                        onClick={handleRemoveImageClick}
                                                    >
                                                        Eliminar
                                                    </Button>
                                                </div>
                                                <p className="px-3 pb-2 pt-1 text-[10px] font-semibold text-zinc-400">
                                                    PNG, JPG, WebP o SVG · máx. 5 MB
                                                </p>
                                            </div>
                                        );
                                    })()}
                                </div>

                                <Field instance="supplier-edit-domains" label="Dominios email (separados por coma)" htmlFor="supplier-edit-domains">
                                    <input
                                        id="supplier-edit-domains"
                                        value={editEmailDomainsText}
                                        onChange={(e) => setEditEmailDomainsText(e.target.value)}
                                        placeholder="proveedor.com, proveedor.es"
                                    />
                                </Field>

                                <Field instance="supplier-edit-instructions" label="Instrucciones Especiales" htmlFor="supplier-edit-instructions">
                                    <textarea
                                        id="supplier-edit-instructions"
                                        value={editInstructions}
                                        onChange={(e) => setEditInstructions(e.target.value)}
                                        placeholder="Indicaciones operativas para el personal…"
                                        rows={2}
                                    />
                                </Field>

                                <Field instance="supplier-edit-notes" label="Observaciones" htmlFor="supplier-edit-notes">
                                    <textarea
                                        id="supplier-edit-notes"
                                        value={editNotes}
                                        onChange={(e) => setEditNotes(e.target.value)}
                                        placeholder="Información adicional de interés…"
                                        rows={2}
                                    />
                                </Field>
                            </div>
                        </div>
                    </div>
                ) : null}
            </Modal>

            <Modal
                open={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                title="Nuevo Proveedor"
                variant="standard"
                layer="base"
                instance="supplier-create"
                usageId="supplier-create"
                usageLabel="Crear proveedor"
                footer={
                    <Button
                        type="button"
                        variant="primary"
                        instance="supplier-create-submit"
                        disabled={isCreating}
                        loading={isCreating}
                        loadingLabel="Guardando..."
                        onClick={() => void handleCreateSupplier()}
                    >
                        Crear Proveedor
                    </Button>
                }
            >
                <div className="space-y-4">
                    <Field instance="supplier-create-name" label="Nombre Empresa" htmlFor="supplier-create-name">
                        <input
                            id="supplier-create-name"
                            autoFocus
                            value={newSupplier.name ?? ''}
                            onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value })}
                            placeholder="Ej. Suministros Marbella"
                        />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                        <Field instance="supplier-create-category" label="Categoría" htmlFor="supplier-create-category">
                            <select
                                id="supplier-create-category"
                                value={newSupplier.category ?? 'Alimentos'}
                                onChange={e => setNewSupplier({ ...newSupplier, category: e.target.value })}
                            >
                                {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </Field>
                        <Field instance="supplier-create-phone" label="Teléfono" htmlFor="supplier-create-phone">
                            <input
                                id="supplier-create-phone"
                                value={newSupplier.phone ?? ''}
                                onChange={e => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                                placeholder="600 000 000"
                            />
                        </Field>
                    </div>
                </div>
            </Modal>
        </>
    );
}
