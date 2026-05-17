'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Camera, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
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
        <div
            className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            role="presentation"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="recipe-name-photo-edit-title"
                className={cn(
                    'w-full max-w-md overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-xl',
                    'flex max-h-[90vh] flex-col',
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="relative flex shrink-0 items-center justify-center border-b border-white/10 bg-[#36606F] px-4 py-3">
                    <h2
                        id="recipe-name-photo-edit-title"
                        className="text-center text-[11px] font-black uppercase tracking-[0.2em] text-white md:text-xs"
                    >
                        Nombre e imagen
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className={cn(
                            'absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center',
                            'text-white/70 transition hover:text-white',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#36606F]',
                        )}
                        aria-label="Cerrar"
                    >
                        <X className="h-5 w-5" strokeWidth={2.5} />
                    </button>
                </div>

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
                            Se unifica el tamaño en carta (misma altura visual, 4:5). Vuelve a subir cada foto.
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
            </div>
        </div>
    );
}
