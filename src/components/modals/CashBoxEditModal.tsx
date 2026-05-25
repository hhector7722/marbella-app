'use client';

import { useState } from 'react';
import { X, Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { createClient } from "@/utils/supabase/client";
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface CashBoxEditModalProps {
    box: { id: string; name: string; image_url?: string };
    onClose: () => void;
    onSuccess: () => void;
}

export function CashBoxEditModal({ box, onClose, onSuccess }: CashBoxEditModalProps) {
    const [uploading, setUploading] = useState(false);
    const [imageUrl, setImageUrl] = useState(box.image_url || '');
    const supabase = createClient();

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${box.id}-${Date.now()}.${fileExt}`;
            const filePath = `boxes/${fileName}`;

            // 1. Upload to Storage
            const { error: uploadError } = await supabase.storage
                .from('box_images')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 2. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('box_images')
                .getPublicUrl(filePath);

            // 3. Update Database
            const { error: updateError } = await supabase
                .from('cash_boxes')
                .update({ image_url: publicUrl })
                .eq('id', box.id);

            if (updateError) throw updateError;

            setImageUrl(publicUrl);
            toast.success('Imagen actualizada');
            onSuccess();
        } catch (error: any) {
            console.error('Error uploading image:', error);
            toast.error(error.message || 'Error al subir la imagen');
        } finally {
            setUploading(false);
        }
    };

    const handleRemove = async () => {
        if (!confirm('¿Seguro que quieres quitar la imagen?')) return;
        
        setUploading(true);
        try {
            const { error } = await supabase
                .from('cash_boxes')
                .update({ image_url: null })
                .eq('id', box.id);

            if (error) throw error;

            setImageUrl('');
            toast.success('Imagen quitada');
            onSuccess();
        } catch (error: any) {
            toast.error(error.message || 'Error al quitar la imagen');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[220] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="bg-[#36606F] px-6 py-4 flex justify-between items-center text-white">
                    <div>
                        <h3 className="text-base font-black uppercase tracking-wider leading-none">Editar Caja</h3>
                        <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">{box.name}</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all active:scale-90">
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative w-32 h-32 rounded-3xl overflow-hidden border-4 border-zinc-50 shadow-inner bg-zinc-100 flex items-center justify-center group">
                            {imageUrl ? (
                                <Image src={imageUrl} alt={box.name} fill className="object-cover" />
                            ) : (
                                <ImageIcon size={48} className="text-zinc-200" />
                            )}
                            {uploading && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[2px]">
                                    <LoadingSpinner size="sm" className="text-white" />
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col w-full gap-2">
                            <label className="relative flex items-center justify-center gap-2 w-full h-12 bg-[#5B8FB9] text-white rounded-2xl font-black text-xs uppercase tracking-widest cursor-pointer hover:bg-[#4a7a9e] active:scale-[0.98] transition-all shadow-lg shadow-blue-100 disabled:opacity-50">
                                <Upload size={18} strokeWidth={2.5} />
                                {imageUrl ? 'Cambiar Imagen' : 'Subir Imagen'}
                                <input type="file" className="hidden" accept="image/*" onChange={handleUpload} disabled={uploading} />
                            </label>

                            {imageUrl && (
                                <button
                                    onClick={handleRemove}
                                    disabled={uploading}
                                    className="flex items-center justify-center gap-2 w-full h-12 bg-white text-rose-500 border-2 border-rose-50 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-50 active:scale-[0.98] transition-all"
                                >
                                    <Trash2 size={18} strokeWidth={2.5} />
                                    Quitar Imagen
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-100">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center leading-relaxed">
                            Sube una foto clara de la caja para que los empleados puedan identificarla rápidamente en el selector.
                        </p>
                    </div>
                </div>

                <div className="p-4 bg-zinc-50 border-t border-zinc-100">
                    <button
                        onClick={onClose}
                        className="w-full h-12 bg-zinc-200 text-zinc-600 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-zinc-300 transition-all active:scale-95"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
