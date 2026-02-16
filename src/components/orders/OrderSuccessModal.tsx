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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-300 flex flex-col pointer-events-auto">

                {/* Header */}
                <div className="bg-[#36606F] py-8 px-8 flex flex-col items-center justify-center text-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-[#36606F] opacity-50 z-0"></div>
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-3 backdrop-blur-sm animate-bounce">
                            <CheckCircle2 size={32} className="text-white" strokeWidth={3} />
                        </div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-wider leading-tight">Pedido Guardado</h2>
                        <p className="text-white/80 text-[10px] font-black uppercase tracking-widest mt-1">Operación finalizada</p>
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 flex flex-col gap-5">

                    {/* PDF PREVIEW MINIATURE */}
                    <div className="relative bg-zinc-100 rounded-3xl overflow-hidden aspect-[3/4] shadow-inner border border-zinc-200 group">
                        {previewUrl ? (
                            <iframe
                                src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                                className="w-full h-full pointer-events-none scale-100 origin-top"
                                title="PREVIEW"
                            />
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                <LoadingSpinner size="md" className="text-[#36606F]" />
                                <span className="text-[8px] font-black text-gray-400 uppercase">Cargando Vista Previa</span>
                            </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none"></div>

                        {/* Overlay Label */}
                        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full border border-zinc-200 shadow-sm flex items-center gap-1.5">
                            <FileText size={10} className="text-[#36606F]" />
                            <span className="text-[8px] font-black text-[#36606F] uppercase">VISTA PREVIA REAL</span>
                        </div>
                    </div>

                    {/* Actions Grid */}
                    <div className="grid grid-cols-2 gap-3 mt-1">
                        <button
                            onClick={onDownload}
                            disabled={isUploading || !generatedBlob}
                            className={cn(
                                "flex flex-col items-center justify-center gap-2 p-4 rounded-3xl transition-all active:scale-95 disabled:opacity-50",
                                "bg-white border-2 border-zinc-100 hover:bg-zinc-50 shadow-sm"
                            )}
                        >
                            <Download size={22} className="text-gray-600" />
                            <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Descargar</span>
                        </button>
                        <button
                            onClick={handleShare}
                            disabled={isUploading || !generatedBlob}
                            className={cn(
                                "flex flex-col items-center justify-center gap-2 p-4 rounded-3xl transition-all active:scale-95 disabled:opacity-50",
                                "bg-white border-2 border-zinc-100 hover:bg-zinc-50 shadow-sm"
                            )}
                        >
                            <Share2 size={22} className="text-gray-600" />
                            <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Enviar</span>
                        </button>
                    </div>

                    {/* WhatsApp Action (If provider has phone) */}
                    {supplierPhone && (
                        <button
                            onClick={handleWhatsApp}
                            disabled={isUploading || !pdfUrl}
                            className="w-full h-14 bg-[#25D366] text-white rounded-3xl font-black text-[11px] uppercase tracking-widest shadow-xl shadow-green-100 hover:bg-[#20bd5a] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-30"
                        >
                            <Image src="/icons/whatsapp.png" alt="WA" width={22} height={22} className="object-contain" />
                            <span>Enviar al Proveedor</span>
                        </button>
                    )}

                    {/* Main Action */}
                    <button
                        onClick={onClose}
                        className="w-full h-14 bg-[#5E35B1] text-white rounded-3xl font-black text-[11px] uppercase tracking-widest shadow-xl shadow-purple-100 hover:bg-[#4d2c91] active:scale-95 transition-all flex items-center justify-center gap-3 mt-1"
                    >
                        <span>Volver al Inicio</span>
                        <ArrowRight size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
}
