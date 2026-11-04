'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/modal';
import { RecipeCategorySelectOptions } from '@/components/recipes/RecipeCategorySelectOptions';
import type { RecipeCategoryOption } from '@/lib/recipe-menu-categories';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/Field';
import { PetroleumSegmented } from '@/components/ui/PetroleumSegmented';
import { RECIPE_UNIT_OPTIONS } from '@/lib/recipe-cost';
import { RECIPE_KIND_OPTIONS, type RecipeKind, yieldFieldsForSave } from '@/lib/recipe-elaboration';
import { uploadNormalizedRecipePhoto } from '@/app/dashboard/carta/photo-actions';

export type RecipeNamePhotoSaved = {
    name: string;
    photo_url: string | null;
    is_sellable: boolean;
    yield_quantity: number | null;
    yield_unit: string | null;
    category?: string | null;
    menu_category_id?: string | null;
};

type Props = {
    open: boolean;
    onClose: () => void;
    recipeId: string;
    initialName: string;
    initialPhotoUrl: string | null;
    initialIsSellable?: boolean;
    initialYieldQuantity?: number | null;
    initialYieldUnit?: string | null;
    productionCategoryId?: string | null;
    onSaved: (payload: RecipeNamePhotoSaved) => void;
    onDelete?: () => void;
    categoryId?: string;
    categories?: RecipeCategoryOption[];
};

export function RecipeNamePhotoEditModal({
    open,
    onClose,
    recipeId,
    initialName,
    initialPhotoUrl,
    initialIsSellable = true,
    initialYieldQuantity = null,
    initialYieldUnit = null,
    productionCategoryId = null,
    onSaved,
    onDelete,
    categoryId = '',
    categories = [],
}: Props) {
    const supabase = createClient();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const stagedBlobRef = useRef<string | null>(null);

    const [nameDraft, setNameDraft] = useState('');
    const [kindDraft, setKindDraft] = useState<RecipeKind>('sellable');
    const [categoryDraft, setCategoryDraft] = useState('');
    const [fallbackProductionCategoryId, setFallbackProductionCategoryId] = useState<string | null>(null);
    const effectiveProductionCategoryId = productionCategoryId ?? fallbackProductionCategoryId;
    const [yieldQuantityDraft, setYieldQuantityDraft] = useState('');
    const [yieldUnitDraft, setYieldUnitDraft] = useState('');
    const [tortillaFormats, setTortillaFormats] = useState<Record<string, string>>({ entero: '7', medio: '14', pincho: '6' });
    const [formatsLoaded, setFormatsLoaded] = useState(false);
    const isTortilla = initialName.trim().toLocaleLowerCase('es') === 'tortilla' && kindDraft === 'internal';
    const [baselinePhotoUrl, setBaselinePhotoUrl] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const revokeStagedBlob = () => {
        if (stagedBlobRef.current) {
            URL.revokeObjectURL(stagedBlobRef.current);
            stagedBlobRef.current = null;
        }
    };

    const photoSyncKey = open
        ? `${initialName}\u0000${initialPhotoUrl ?? ''}\u0000${initialIsSellable}\u0000${initialYieldQuantity ?? ''}\u0000${initialYieldUnit ?? ''}`
        + ':' + categoryId
        : null;
    const [syncedPhotoKey, setSyncedPhotoKey] = useState<string | null>(null);

    if (photoSyncKey !== syncedPhotoKey) {
        setSyncedPhotoKey(photoSyncKey);
        if (open) {
            setNameDraft(initialName);
            setBaselinePhotoUrl(initialPhotoUrl);
            setKindDraft(initialIsSellable === false ? 'internal' : 'sellable');
            setCategoryDraft(categoryId);
            setYieldQuantityDraft(initialYieldQuantity != null ? String(initialYieldQuantity) : '');
            setYieldUnitDraft(initialYieldUnit ?? '');
        }
        setSelectedFile(null);
        setPreviewBlobUrl(null);
    }

    useEffect(() => {
        revokeStagedBlob();
        if (open && fileInputRef.current) fileInputRef.current.value = '';
    }, [open, initialName, initialPhotoUrl]);

    useEffect(() => {
        return () => revokeStagedBlob();
    }, []);

    // Permite escoger Producción incluso si el catálogo del detalle aún está cargando.
    useEffect(() => {
        if (!open || productionCategoryId) return;
        let cancelled = false;
        void (async () => {
            const client = createClient();
            const { data, error } = await client.from('categories')
                .select('id')
                .eq('scope', 'recipes')
                .eq('slug', 'produccion')
                .maybeSingle();
            if (!cancelled && !error && data?.id) setFallbackProductionCategoryId(data.id);
        })();
        return () => { cancelled = true; };
    }, [open, productionCategoryId]);

    useEffect(() => {
        if (!open || initialName.trim().toLocaleLowerCase('es') !== 'tortilla') return;
        let current = true;
        setFormatsLoaded(false);
        supabase.from('recipe_consumption_formats')
            .select('code, portions_per_batch')
            .eq('recipe_id', recipeId)
            .then(({ data, error }) => {
                if (!current) return;
                if (error) {
                    toast.error('No se pudieron cargar los formatos de tortilla');
                    return;
                }
                const values: Record<string, string> = { entero: '7', medio: '14', pincho: '6' };
                for (const row of data ?? []) values[row.code] = String(row.portions_per_batch);
                setTortillaFormats(values);
                setFormatsLoaded(true);
            });
        return () => { current = false; };
    }, [open, initialName, recipeId, supabase]);

    const displayPhotoSrc = previewBlobUrl ?? baselinePhotoUrl ?? null;

    const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        e.target.value = '';
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
            toast.error('La imagen es muy grande (máx. 10 MB)');
            return;
        }

        revokeStagedBlob();
        const url = URL.createObjectURL(file);
        stagedBlobRef.current = url;
        setPreviewBlobUrl(url);
        setSelectedFile(file);
    };

    const handleSave = async () => {
        const trimmed = nameDraft.trim();
        if (!trimmed) {
            toast.error('El nombre es obligatorio');
            return;
        }
        const internal = kindDraft === 'internal';
        if (internal && !effectiveProductionCategoryId) {
            toast.error('La categoría Producción no está disponible');
            return;
        }
        // La categoría y el tipo se guardan juntos al pulsar Guardar.
        const categoryOption = categories.find((option) => option.id === categoryDraft);
        if (!internal && categoryDraft && (!categoryOption || categoryDraft === effectiveProductionCategoryId)) {
            toast.error('Selecciona una categoría de recetas válida');
            return;
        }
        const categoryUpdate = internal
            ? { category: 'Producción', menu_category_id: effectiveProductionCategoryId }
            : {
                category: categoryOption?.dbName ?? categoryOption?.label ?? null,
                menu_category_id: categoryOption?.id ?? null,
            };
        const yieldSave = yieldFieldsForSave(yieldQuantityDraft, yieldUnitDraft, internal);
        if (!yieldSave.ok) {
            toast.error(yieldSave.message);
            return;
        }
        if (isTortilla) {
            if (!formatsLoaded) {
                toast.error('Los formatos todavía no están disponibles');
                return;
            }
            if (yieldSave.yield_quantity !== 1 || yieldSave.yield_unit !== 'ud') {
                toast.error('Una tortilla completa debe tener un rendimiento de 1 ud');
                return;
            }
            if (['entero', 'medio', 'pincho'].some(code => !/^[1-9]\d*$/.test(tortillaFormats[code] ?? '') || !Number.isSafeInteger(Number(tortillaFormats[code])))) {
                toast.error('Indica cuántos formatos enteros salen de una tortilla');
                return;
            }
        }

        setSaving(true);
        try {
            let photo_url: string | null = baselinePhotoUrl;

            if (selectedFile) {
                const fd = new FormData();
                fd.append('file', selectedFile);
                const up = await uploadNormalizedRecipePhoto(fd);
                if (!up.success) throw new Error(up.error);
                photo_url = up.publicUrl;
            }

            const { error } = await supabase
                .from('recipes')
                .update({
                    name: trimmed,
                    photo_url,
                    is_sellable: !internal,
                    ...categoryUpdate,
                    yield_quantity: yieldSave.yield_quantity,
                    yield_unit: yieldSave.yield_unit,
                })
                .eq('id', recipeId);

            if (error) {
                toast.error(`No se pudo guardar: ${error.message}`);
                return;
            }

            if (isTortilla) {
                const options = [
                    { code: 'entero', label: 'Bocadillo entero' },
                    { code: 'medio', label: 'Medio bocadillo' },
                    { code: 'pincho', label: 'Pincho' },
                ];
                const { error: formatError } = await supabase.from('recipe_consumption_formats').upsert(
                    options.map(({ code, label }) => ({
                        recipe_id: recipeId,
                        code,
                        label,
                        portions_per_batch: Number(tortillaFormats[code]),
                    })),
                    { onConflict: 'recipe_id,code' },
                );
                if (formatError) {
                    toast.error('No se pudieron guardar los formatos: ' + formatError.message);
                    return;
                }
            }
            toast.success('Receta actualizada');
            onSaved({
                name: trimmed,
                photo_url,
                is_sellable: !internal,
                ...categoryUpdate,
                yield_quantity: yieldSave.yield_quantity,
                yield_unit: yieldSave.yield_unit,
            });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al guardar';
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            variant="standard"
            layer="base"
            instance="recipe-name-photo"
            usageId="recipe-name-photo"
            usageLabel="Editar receta"
            title="Nombre e imagen"
            scrollContent
            footer={
                <>
                    {onDelete ? (
                        <Button
                            type="button"
                            variant="destructive"
                            instance="recipe-name-photo-delete"
                            onClick={onDelete}
                            disabled={saving}
                        >
                            Eliminar
                        </Button>
                    ) : null}
                    <Button
                        type="button"
                        variant="secondary"
                        instance="recipe-name-photo-cancel"
                        onClick={onClose}
                        disabled={saving}
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        variant="primary"
                        instance="recipe-name-photo-save"
                        onClick={() => void handleSave()}
                        disabled={saving}
                        loading={saving}
                        loadingLabel="Guardando…"
                    >
                        Guardar
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <Field instance="recipe-edit-name" label="Nombre" htmlFor="recipe-edit-name">
                    <input
                        id="recipe-edit-name"
                        type="text"
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        autoComplete="off"
                        placeholder="Nombre de la receta"
                    />
                </Field>

                <PetroleumSegmented
                    instance="recipe-edit-kind"
                    density="comfortable"
                    aria-label="Tipo de receta"
                    value={kindDraft}
                    onChange={(value) => {
                        const kind = value as RecipeKind;
                        setKindDraft(kind);
                        if (kind === 'internal') setCategoryDraft(effectiveProductionCategoryId ?? '');
                        else if (categoryDraft === effectiveProductionCategoryId) setCategoryDraft('');
                    }}
                    options={RECIPE_KIND_OPTIONS}
                />

                <Field
                    instance="recipe-edit-yield"
                    label={kindDraft === 'internal' ? 'Rendimiento del lote' : 'Rendimiento del lote (opcional)'}
                    htmlFor="recipe-edit-yield"
                >
                    <div className="grid w-full min-w-0 grid-cols-2 gap-2">
                        <input
                            id="recipe-edit-yield"
                            type="text"
                            inputMode="decimal"
                            value={yieldQuantityDraft}
                            onChange={(e) => setYieldQuantityDraft(e.target.value)}
                            autoComplete="off"
                            placeholder="1000"
                            className="min-w-0"
                        />
                        <select
                            aria-label="Unidad del rendimiento"
                            value={yieldUnitDraft}
                            onChange={(e) => setYieldUnitDraft(e.target.value)}
                            className="min-w-0"
                        >
                            <option value="">Unidad</option>
                            {RECIPE_UNIT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </Field>

                {isTortilla ? (
                    <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Formatos de consumo</span>
                        <p className="text-[11px] text-zinc-500">Unidades que salen de una tortilla completa. Sólo se configuran aquí.</p>
                        {([
                            ['entero', 'Bocadillo entero'],
                            ['medio', 'Medio bocadillo'],
                            ['pincho', 'Pincho'],
                        ] as const).map(([code, label]) => (
                            <div key={code} className="grid grid-cols-[1fr_84px] items-center gap-3">
                                <label htmlFor={'tortilla-format-' + code} className="text-sm font-semibold text-zinc-700">{label}</label>
                                <input
                                    id={'tortilla-format-' + code}
                                    type="number"
                                    min="1"
                                    step="1"
                                    disabled={saving || !formatsLoaded}
                                    value={tortillaFormats[code]}
                                    onChange={(e) => setTortillaFormats((prev) => ({ ...prev, [code]: e.target.value }))}
                                    className="text-center"
                                />
                            </div>
                        ))}
                    </div>
                ) : null}

                {categories.length > 0 || effectiveProductionCategoryId ? (
                    <Field instance="recipe-edit-category" label="Categoría" htmlFor="recipe-edit-category">
                        <select
                            id="recipe-edit-category"
                            value={categoryDraft}
                            disabled={saving}
                            onChange={(event) => {
                                const id = event.target.value;
                                setCategoryDraft(id);
                                if (id === effectiveProductionCategoryId) setKindDraft('internal');
                                else if (id && kindDraft === 'internal') setKindDraft('sellable');
                            }}
                        >
                            <option value="">Sin categoría</option>
                            <RecipeCategorySelectOptions
                                options={categories}
                                selectedId={categoryDraft}
                                productionCategoryId={effectiveProductionCategoryId}
                                showProductionOption
                            />
                        </select>
                        {categoryDraft === effectiveProductionCategoryId && initialIsSellable !== false ? (
                            <p className="mt-2 text-xs leading-relaxed text-amber-700">
                                Producción convierte la receta en elaboración interna y deja de clasificarla como vendible.
                            </p>
                        ) : null}
                    </Field>
                ) : null}

                <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Imagen</span>
                    <div
                        className={cn(
                            'flex h-40 w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-100 bg-zinc-50',
                            'shadow-inner',
                        )}
                    >
                        {displayPhotoSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element -- URL externa Supabase / blob
                            <img src={displayPhotoSrc} alt="" className="max-h-full max-w-full object-contain" />
                        ) : (
                            <Camera className="h-10 w-10 text-zinc-200" aria-hidden />
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={saving}
                        className={cn(
                            'min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-center text-xs font-bold text-[#36606F]',
                            'transition hover:bg-zinc-50 active:scale-[0.99] disabled:opacity-50',
                        )}
                    >
                        {baselinePhotoUrl || selectedFile ? 'Cambiar imagen' : 'Añadir imagen'}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handlePickFile}
                    />
                    <p className="text-[10px] font-semibold leading-snug text-zinc-500">
                        Se recorta blanco de bordes y se guarda entero en 4:5. Vuelve a subir si ves recortes viejos.
                    </p>
                </div>
            </div>
        </Modal>
    );
}
