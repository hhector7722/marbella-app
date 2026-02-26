'use client';

import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, Download, Share2, ArrowRight, FileText, Send, ImageIcon } from 'lucide-react';
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
                const numPages = pdf.numPages;

                // iOS Canvas Limit: ~4096px height max safely.
                // We aggressively scale down to keep the stitched image under the limit.
                let scale = 2.0;
                if (numPages > 1) scale = 1.0;
                if (numPages > 3) scale = 0.6;
                if (numPages > 5) scale = 0.4;

                let totalHeight = 0;
                let maxWidth = 0;
                const pagesData = [];

                for (let i = 1; i <= numPages; i++) {
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale });

                    totalHeight += viewport.height;
                    if (viewport.width > maxWidth) {
                        maxWidth = viewport.width;
                    }

                    pagesData.push({ page, viewport });
                }

                const mainCanvas = document.createElement('canvas');
                const mainContext = mainCanvas.getContext('2d');
                if (!mainContext) throw new Error("No 2d context for main canvas");

                mainCanvas.width = maxWidth;
                mainCanvas.height = totalHeight;

                mainContext.fillStyle = '#ffffff';
                mainContext.fillRect(0, 0, mainCanvas.width, mainCanvas.height);

                let currentYOffset = 0;
                const recycleCanvas = document.createElement('canvas');
                const recycleContext = recycleCanvas.getContext('2d');

                for (const { page, viewport } of pagesData) {
                    if (!recycleContext) continue;

                    recycleCanvas.width = viewport.width;
                    recycleCanvas.height = viewport.height;
                    recycleContext.clearRect(0, 0, viewport.width, viewport.height);

                    await page.render({
                        canvasContext: recycleContext,
                        viewport: viewport
                    }).promise;

                    mainContext.drawImage(recycleCanvas, 0, currentYOffset);
                    currentYOffset += viewport.height;
                }

                return new Promise((resolve, reject) => {
                    mainCanvas.toBlob((blob) => {
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
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
