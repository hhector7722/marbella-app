'use client';

import { useState, useEffect } from 'react';
import { Download, Share2, Send } from 'lucide-react';
import { cn } from "@/lib/utils";
import { toast } from 'sonner';

interface OrderSuccessModalProps {
    isOpen: boolean;
    pdfUrl: string | null;
    generatedBlob: Blob | null;
    supplierPhone: string | null;
    isUploading: boolean;
    isGenerating?: boolean;
    onClose: () => void;
    onDownload: () => void;
}

export function OrderSuccessModal({
    isOpen,
    pdfUrl,
    generatedBlob,
    supplierPhone,
    isUploading,
    isGenerating = false,
    onClose,
    onDownload
}: OrderSuccessModalProps) {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isCapturing, setIsCapturing] = useState(false);

    useEffect(() => {
        if (generatedBlob) {
            const url = URL.createObjectURL(generatedBlob);
            setPreviewUrl(url);
            return () => URL.revokeObjectURL(url);
        } else {
            setPreviewUrl(null);
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
                if (navigator.share) {
                    await navigator.share({
                        title: 'Pedido Bar La Marbella',
                        text: 'Aquí tienes el enlace al pedido.',
                        url: pdfUrl
                    });
                } else {
                    await navigator.clipboard.writeText(pdfUrl);
                    toast.success('Enlace copiado al portapapeles');
                }
            }
        } catch (error) {
            console.error('Error sharing:', error);
        }
    };

    const handleWhatsApp = async () => {
        if (!supplierPhone || !generatedBlob) return;

        setIsCapturing(true);
        try {
            const file = new File([generatedBlob], 'Pedido_Bar_La_Marbella.pdf', { type: 'application/pdf' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Pedido Bar La Marbella',
                    text: 'Adjunto pedido. Gracias.'
                });
                setIsCapturing(false);
                return;
            }

            // Fallback: sin Web Share API o en PC — enviar URL del PDF en el texto
            const linkTexto = pdfUrl || 'Descarga el PDF desde el botón "Descargar" de la app.';
            const mensaje = `Hola, adjunto el nuevo pedido de Bar La Marbella. Puedes descargarlo o revisarlo aquí: ${linkTexto}`;
            const cleanPhone = supplierPhone.replace(/\D/g, '');
            const finalPhone = cleanPhone.startsWith('34') ? cleanPhone : `34${cleanPhone}`;
            const whatsappUrl = `https://wa.me/${finalPhone}?text=${encodeURIComponent(mensaje)}`;
            window.open(whatsappUrl, '_blank');
        } catch (error) {
            console.error('Error WhatsApp:', error);
            toast.error('Error al abrir WhatsApp.');
        } finally {
            setIsCapturing(false);
        }
    };

    const iframeSrc = pdfUrl || previewUrl;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4 lg:p-8 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.5rem] w-full max-w-[320px] overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-300 flex flex-col pointer-events-auto max-h-[92vh]">

                {/* Header */}
                <div className="bg-[#36606F] py-5 px-6 flex flex-col items-center justify-center text-center relative shrink-0">
                    <h2 className="text-xl font-black text-white uppercase tracking-wider leading-tight">Pedido Guardado</h2>
                </div>

                {/* Body */}
                <div className="p-5 flex flex-col gap-4 overflow-y-auto min-h-[300px] justify-center text-zinc-900">

                    {/* Visor nativo (Zero-Dependency): iframe con PDF o blob */}
                    <div className="w-full bg-zinc-50 rounded-xl border border-zinc-200 overflow-hidden relative">
                        {iframeSrc ? (
                            <iframe
                                src={iframeSrc}
                                className="w-full h-64 md:h-96"
                                title="Previsualización del Pedido"
                            />
                        ) : (
                            <div className="w-full h-64 flex items-center justify-center text-zinc-400 text-xs font-bold uppercase tracking-widest">
                                Generando documento...
                            </div>
                        )}
                    </div>

                    {/* Actions Row */}
                    <div className="grid grid-cols-3 gap-2 mt-1 shrink-0">
                        <button
                            onClick={onDownload}
                            disabled={isCapturing || !generatedBlob}
                            className={cn(
                                "flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl transition-all active:scale-95 disabled:opacity-50",
                                "bg-white border border-zinc-100 hover:bg-zinc-50 shadow-sm min-h-[48px]"
                            )}
                        >
                            <Download size={18} className="text-[#36606F]" />
                            <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Descargar</span>
                        </button>

                        <button
                            onClick={handleShare}
                            disabled={isCapturing || !generatedBlob}
                            className={cn(
                                "flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl transition-all active:scale-95 disabled:opacity-50",
                                "bg-white border border-zinc-100 hover:bg-zinc-50 shadow-sm min-h-[48px]"
                            )}
                        >
                            <Share2 size={18} className="text-[#36606F]" />
                            <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Enviar</span>
                        </button>

                        <button
                            onClick={handleWhatsApp}
                            disabled={isCapturing || !generatedBlob || !supplierPhone}
                            className={cn(
                                "flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl transition-all active:scale-95 disabled:opacity-50",
                                "bg-[#7C4DBC] hover:bg-[#6A3DAA] shadow-sm min-h-[48px]"
                            )}
                        >
                            <Send size={18} className="text-white" />
                            <span className="text-[8px] font-black text-white uppercase tracking-widest">Proveedor</span>
                        </button>
                    </div>

                    {/* Main Action */}
                    <button
                        onClick={onClose}
                        className="w-full h-11 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:bg-rose-700 active:scale-95 transition-all flex items-center justify-center shrink-0 min-h-[48px]"
                    >
                        Atrás
                    </button>
                </div>
            </div>
        </div>
    );
}
