'use client';

import { useRef, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { createClient } from "@/utils/supabase/client";
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

interface CashBoxEditModalProps {
    box: { id: string; name: string; image_url?: string };
    onClose: () => void;
    onSuccess: () => void;
}

export function CashBoxEditModal({ box, onClose, onSuccess }: CashBoxEditModalProps) {
    const [uploading, setUploading] = useState(false);
    const [imageUrl, setImageUrl] = useState(box.image_url || '');
    const fileRef = useRef<HTMLInputElement>(null);
    const supabase = createClient();

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${box.id}-${Date.now()}.${fileExt}`;
            const filePath = `boxes/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('box_images')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('box_images')
                .getPublicUrl(filePath);

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
        <Modal
            open
            onClose={onClose}
            variant="compact"
            layer="base"
            instance="cash-box-edit"
            title="Editar Caja"
            subtitle={box.name}
            headerTone="petroleum"
            usageId="cash-box-edit"
            usageLabel="Editar caja"
            footer={
                <Button
                    type="button"
                    variant="secondary"
                    instance="cash-box-edit-close"
                    onClick={onClose}
                >
                    Cerrar
                </Button>
            }
        >
            <div className="space-y-6">
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

                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <input
                            ref={fileRef}
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={handleUpload}
                            disabled={uploading}
                        />
                        <Button
                            type="button"
                            variant="primary"
                            instance="cash-box-upload"
                            disabled={uploading}
                            onClick={() => fileRef.current?.click()}
                        >
                            {imageUrl ? 'Cambiar imagen' : 'Subir imagen'}
                        </Button>
                        {imageUrl ? (
                            <Button
                                type="button"
                                variant="destructive"
                                instance="cash-box-remove"
                                disabled={uploading}
                                onClick={() => void handleRemove()}
                            >
                                Quitar imagen
                            </Button>
                        ) : null}
                    </div>
                </div>

                <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-100">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center leading-relaxed">
                        Sube una foto clara de la caja para que los empleados puedan identificarla rápidamente en el selector.
                    </p>
                </div>
            </div>
        </Modal>
    );
}
