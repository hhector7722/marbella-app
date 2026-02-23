'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, Download, Share2, ArrowRight, FileText, Send } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn } from "@/lib/utils";
import Image from 'next/image';

interface OrderSuccessModalProps {
    isOpen: boolean;
    pdfUrl: string | null;
    generatedBlob: Blob | null;
    supplierPhone: string | null;
    isUploading: boolean;
    onClose: () => void;
    onDownload: () => void;
}

export function OrderSuccessModal({
    isOpen,
    pdfUrl,
    generatedBlob,
    supplierPhone,
    isUploading,
    onClose,
    onDownload
}: OrderSuccessModalProps) {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (generatedBlob) {
            const url = URL.createObjectURL(generatedBlob);
            setPreviewUrl(url);
            return () => URL.revokeObjectURL(url);
        }
    }, [generatedBlob]);

    if (!isOpen) return null;

    const handleShare = async () => {
        if (!generatedBlob) return;
        try {
            const file = new File([generatedBlob], 'Pedido_Bar_La_Marbella.pdf', { type: 'application/pdf' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Pedido Bar La Marbella',
                    text: 'Aquí tienes el pedido generado.'
                });
            } else if (pdfUrl) {
                // Fallback to URL if file sharing not supported
                if (navigator.share) {
                    await navigator.share({
                        title: 'Pedido Bar La Marbella',
                        text: 'Aquí tienes el enlace al pedido.',
                        url: pdfUrl
                    });
                } else {
                    await navigator.clipboard.writeText(pdfUrl);
                    alert('Enlace copiado al portapapeles');
                }
            }
        } catch (error) {
            console.error('Error sharing:', error);
        }
    };

    const handleWhatsApp = () => {
        if (!supplierPhone || !pdfUrl) return;

        // Normalize phone: strip non-digits, add country code if missing
        const cleanPhone = supplierPhone.replace(/\D/g, '');
        const finalPhone = cleanPhone.startsWith('34') ? cleanPhone : `34${cleanPhone}`;

        const message = encodeURIComponent(`Hola, te adjunto el nuevo pedido de Bar La Marbella: ${pdfUrl}`);
        window.open(`https://wa.me/${finalPhone}?text=${message}`, '_blank');
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4 lg:p-8 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.5rem] w-full max-w-[320px] overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-300 flex flex-col pointer-events-auto max-h-[92vh]">

                {/* Header */}
                <div className="bg-[#36606F] py-5 px-6 flex flex-col items-center justify-center text-center relative shrink-0">
                    <h2 className="text-xl font-black text-white uppercase tracking-wider leading-tight">Pedido Guardado</h2>
                </div>

                {/* Body */}
                <div className="p-5 flex flex-col gap-4 overflow-y-auto">

                    {/* PDF PREVIEW MINIATURE (A4 Aspect Ratio: 1 / 1.414) */}
                    <div className="relative bg-white rounded-2xl overflow-hidden aspect-[1/1.414] group mx-1 shadow-sm border border-zinc-100">
                        {previewUrl ? (
                            <iframe
                                src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                                className="w-full h-full pointer-events-none origin-top"
                                title="PREVIEW"
                            />
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                <LoadingSpinner size="md" className="text-[#36606F]" />
                                <span className="text-[10px] font-black text-gray-400 uppercase">Cargando...</span>
                            </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none"></div>
                    </div>

                    {/* Actions Row */}
                    <div className="grid grid-cols-3 gap-2 mt-1">
                        <button
                            onClick={onDownload}
                            disabled={isUploading || !generatedBlob}
                            className={cn(
                                "flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl transition-all active:scale-95 disabled:opacity-50",
                                "bg-white border border-zinc-100 hover:bg-zinc-50 shadow-sm"
                            )}
                        >
                            <Download size={18} className="text-[#36606F]" />
                            <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Descargar</span>
                        </button>

                        <button
                            onClick={handleShare}
                            disabled={isUploading || !generatedBlob}
                            className={cn(
                                "flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl transition-all active:scale-95 disabled:opacity-50",
                                "bg-white border border-zinc-100 hover:bg-zinc-50 shadow-sm"
                            )}
                        >
                            <Share2 size={18} className="text-[#36606F]" />
                            <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Enviar</span>
                        </button>

                        <button
                            onClick={handleWhatsApp}
                            disabled={isUploading || !pdfUrl || !supplierPhone}
                            className={cn(
                                "flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl transition-all active:scale-95 disabled:opacity-50",
                                "bg-[#25D366]/10 border border-[#25D366]/20 hover:bg-[#25D366]/20 shadow-sm"
                            )}
                        >
                            <Send size={18} className="text-[#25D366]" />
                            <span className="text-[8px] font-black text-[#1C9B4C] uppercase tracking-widest">Proveedor</span>
                        </button>
                    </div>

                    {/* Main Action */}
                    <button
                        onClick={onClose}
                        className="w-full h-11 bg-[#5E35B1] text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-purple-100 hover:bg-[#4d2c91] active:scale-95 transition-all flex items-center justify-center gap-3 shrink-0"
                    >
                        <span>Volver al Inicio</span>
                        <ArrowRight size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
