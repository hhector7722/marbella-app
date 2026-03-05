'use client';

import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, Download, Share2, FileText, Send, ImageIcon } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn } from "@/lib/utils";
import { toast } from 'sonner';
import * as pdfjsLib from 'pdfjs-dist';

// Configurar el worker explícitamente usando CDNJS para evitar problemas de empaquetado Next.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface OrderSuccessModalProps {
    isOpen: boolean;
    pdfUrl: string | null;
    generatedBlob: Blob | null;
    supplierPhone: string | null;
    isUploading: boolean;
    isGenerating?: boolean; // New prop
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

    const handleWhatsApp = async () => {
        if (!supplierPhone || !generatedBlob) return;

        setIsCapturing(true);

        try {
            const getSingleBlob = async (): Promise<Blob> => {
                const arrayBuffer = await generatedBlob.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                const pdf = await loadingTask.promise;

                // El PDF ahora es de 1 sola página infinita (Ticket)
                const page = await pdf.getPage(1);

                // Obtain base viewport to calculate physical height
                const baseViewport = page.getViewport({ scale: 1.0 });

                // iOS Canvas Limit: ~4000px height max safely.
                // We aggressively scale down ONLY IF the ticket is extremely long
                const MAX_HEIGHT_PX = 4000;
                const calculatedScale = Math.min(2.0, MAX_HEIGHT_PX / baseViewport.height);

                const viewport = page.getViewport({ scale: calculatedScale });

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                if (!context) throw new Error("No 2d context for canvas");

                canvas.width = viewport.width;
                canvas.height = viewport.height;

                context.fillStyle = '#ffffff';
                context.fillRect(0, 0, canvas.width, canvas.height);

                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;

                return new Promise((resolve, reject) => {
                    canvas.toBlob((blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error("Canvas to Blob falló"));
                    }, 'image/png');
                });
            };

            let isCopied = false;

            if (navigator.clipboard && window.ClipboardItem) {
                try {
                    // Safari iOS strict requirement: ClipboardItem must be instantiated synchronously 
                    // with a Promise passed to it, rather than awaiting the blob first.
                    const promise = getSingleBlob();
                    const item = new ClipboardItem({
                        'image/png': promise
                    });
                    await navigator.clipboard.write([item]);
                    isCopied = true;
                } catch (err1) {
                    try {
                        // Fallback for Chrome/Android
                        const blob = await getSingleBlob();
                        const item = new ClipboardItem({ 'image/png': blob });
                        await navigator.clipboard.write([item]);
                        isCopied = true;
                    } catch (err2) {
                        console.error('Clipboard write failed on both modes:', err2);
                    }
                }
            }

            if (isCopied) {
                toast.success('¡LISTO! Ahora pega la imagen en el chat.', { duration: 4000 });
            } else {
                // Descarga de emergencia si falla portapapeles
                const blob = await getSingleBlob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = 'Pedido_Bar_La_Marbella.png';
                link.href = url;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                toast.info('Tu móvil bloquea el portapapeles. Se ha guardado en la galería.', { duration: 5000 });
            }

            // Normalizar teléfono
            const cleanPhone = supplierPhone.replace(/\D/g, '');
            const finalPhone = cleanPhone.startsWith('34') ? cleanPhone : `34${cleanPhone}`;

            // Abrir WhatsApp con el texto tras una pequeña pausa para asegurar que el toast se lea
            const message = encodeURIComponent(`Adjunto pedido. Gracias.`);

            setTimeout(() => {
                window.open(`https://wa.me/${finalPhone}?text=${message}`, '_blank');
            }, 1000);

        } catch (error) {
            console.error('Error sharing image:', error);
            toast.error('Error al generar la captura. Inténtalo de nuevo.');
        } finally {
            setIsCapturing(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4 lg:p-8 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.5rem] w-full max-w-[320px] overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-300 flex flex-col pointer-events-auto max-h-[92vh]">

                {/* Header */}
                <div className="bg-[#36606F] py-5 px-6 flex flex-col items-center justify-center text-center relative shrink-0">
                    <h2 className="text-xl font-black text-white uppercase tracking-wider leading-tight">Pedido Guardado</h2>
                </div>

                {/* Body */}
                <div className="p-5 flex flex-col gap-4 overflow-y-auto min-h-[300px] justify-center text-zinc-900">

                    {isGenerating || isCapturing || !generatedBlob ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-4 animate-in fade-in duration-500">
                            <div className="relative">
                                <LoadingSpinner size="xl" className="text-[#36606F]" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    {isCapturing ? (
                                        <ImageIcon size={24} className="text-[#36606F] animate-pulse" />
                                    ) : (
                                        <FileText size={24} className="text-[#36606F] animate-pulse" />
                                    )}
                                </div>
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-black text-gray-800 uppercase tracking-tighter">
                                    {isCapturing ? "Generando Captura" : "Generando PDF"}
                                </h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                                    {isCapturing ? "Copiando al portapapeles..." : "Espera un momento..."}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>
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
                                    disabled={isCapturing || !generatedBlob}
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
                                    disabled={isCapturing || !generatedBlob}
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
                                    disabled={isCapturing || !generatedBlob || !supplierPhone}
                                    className={cn(
                                        "flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl transition-all active:scale-95 disabled:opacity-50",
                                        "bg-[#7C4DBC] hover:bg-[#6A3DAA] shadow-sm"
                                    )}
                                >
                                    <Send size={18} className="text-white" />
                                    <span className="text-[8px] font-black text-white uppercase tracking-widest">Proveedor</span>
                                </button>
                            </div>

                            {/* Main Action */}
                            <button
                                onClick={onClose}
                                className="w-full h-11 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:bg-rose-700 active:scale-95 transition-all flex items-center justify-center shrink-0"
                            >
                                Atrás
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
