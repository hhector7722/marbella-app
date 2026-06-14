'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/modal';
import { uploadNormalizedRecipePhoto } from '@/app/dashboard/carta/photo-actions';

export type RecipeNamePhotoSaved = { name: string; photo_url: string | null };

type Props = {
    open: boolean;
    onClose: () => void;
    recipeId: string;
    initialName: string;
    initialPhotoUrl: string | null;
    onSaved: (payload: RecipeNamePhotoSaved) => void;
};

export function RecipeNamePhotoEditModal({
    open,
    onClose,
    recipeId,
    initialName,
    initialPhotoUrl,
    onSaved,
}: Props) {
    const supabase = createClient();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const stagedBlobRef = useRef<string | null>(null);

    const [nameDraft, setNameDraft] = useState('');
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

    useEffect(() => {
        if (!open) {
            revokeStagedBlob();
            setPreviewBlobUrl(null);
            setSelectedFile(null);
            return;
        }
        setNameDraft(initialName);
        setBaselinePhotoUrl(initialPhotoUrl);
        setSelectedFile(null);
        revokeStagedBlob();
        setPreviewBlobUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, [open, initialName, initialPhotoUrl]);

    useEffect(() => {
        return () => revokeStagedBlob();
    }, []);

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

            const { error } = await supabase.from('recipes').update({ name: trimmed, photo_url }).eq('id', recipeId);

            if (error) {
                toast.error(`No se pudo guardar: ${error.message}`);
                return;
            }

            toast.success('Receta actualizada');
            onSaved({ name: trimmed, photo_url });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al guardar';
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Nombre e imagen"
            headerVariant="petroleum"
            className="max-w-md"
            usageId="recipe-name-photo"
            usageLabel="Editar receta"
        >
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
                    <label className="block">
                        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-zinc-400">Nombre</span>
                        <input
                            type="text"
                            value={nameDraft}
                            onChange={(e) => setNameDraft(e.target.value)}
                            className={cn(
                                'min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm font-semibold text-zinc-800',
                                'outline-none focus:border-[#36606F] focus:ring-2 focus:ring-[#36606F]/20',
                            )}
                            autoComplete="off"
                            placeholder="Nombre de la receta"
                        />
                    </label>

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

                <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-zinc-100 p-4 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="min-h-12 w-full rounded-xl border border-zinc-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-zinc-600 transition hover:bg-zinc-50 sm:w-auto sm:min-w-[120px]"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={saving}
                        className={cn(
                            'min-h-12 w-full rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white',
                            'shadow-sm transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-60',
                            'sm:w-auto sm:min-w-[120px]',
                        )}
                    >
                        {saving ? (
                            <span className="inline-flex items-center justify-center gap-2">
                                <LoadingSpinner size="sm" className="text-white" />
                                Guardando…
                            </span>
                        ) : (
                            'Guardar'
                        )}
                    </button>
                </div>
        </Modal>
    );
}
