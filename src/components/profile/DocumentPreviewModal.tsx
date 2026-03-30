'use client';

import { X, Download, Loader2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface DocumentPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    fileUrl: string | null;
    fileName: string;
    isPDF?: boolean;
    onDownload?: () => void;
}

export default function DocumentPreviewModal({
    isOpen,
    onClose,
    fileUrl,
    fileName,
    isPDF = true,
    onDownload
}: DocumentPreviewModalProps) {
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setIsLoaded(false);
            
            const timer = setTimeout(() => {
                setIsLoaded(true);
            }, 3000);
            
            return () => clearTimeout(timer);
        } else {
            document.body.style.overflow = 'unset';
        }
    }, [isOpen]);

    if (!isOpen || !fileUrl) return null;

    const previewUrl = isPDF ? `${fileUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit` : fileUrl;

    return (
        <div 
            className="fixed inset-0 z-[205] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-300"
            onClick={onClose}
        >
            {/* Fondo difuminado coincidente con el resto de la app */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

            {/* Tarjeta del Modal - Dinámica, ajustada al contenido sin huecos */}
            <div 
                className="relative bg-white w-full max-w-4xl h-fit max-h-[85vh] rounded-[2.5rem] shadow-2xl border border-zinc-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300"
                onClick={e => e.stopPropagation()}
            >
                {/* Cabecera Petróleo Estándar */}
                <div className="shrink-0 flex items-center justify-between px-6 py-5 bg-[#36606F] text-white">
                    <div className="flex flex-col">
                        <span className="text-[9px] text-white/50 font-black uppercase tracking-[0.25em]">Previsualización</span>
                        <h2 className="text-sm font-black uppercase tracking-tight truncate max-w-[180px] md:max-w-md">
                            {fileName}
                        </h2>
                    </div>

                    <div className="flex items-center gap-2">
                        {onDownload && (
                            <button 
                                onClick={onDownload}
                                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all"
                                title="Descargar"
                            >
                                <Download size={18} />
                            </button>
                        )}
                        <button 
                            onClick={onClose}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all"
                            aria-label="Cerrar"
                        >
                            <X size={20} strokeWidth={3} />
                        </button>
                    </div>
                </div>

                {/* Área de Visualización - Altura dinámica y pinch-zoom nativo */}
                <div 
                    className="flex-1 overflow-auto bg-zinc-50 flex flex-col items-center custom-scrollbar relative p-4 md:p-8"
                    style={{ touchAction: 'pan-x pan-y pinch-zoom' }}
                >
                    {!isLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center z-10 bg-zinc-50/80 backdrop-blur-xs">
                            <Loader2 className="w-10 h-10 text-[#36606F] animate-spin" />
                        </div>
                    )}

                    {/* Contenedor reducido drásticamente para simular el zoom del 30% solicitado en todas las pantallas */}
                    <div className="w-[45%] md:w-[25%] flex flex-col bg-white shadow-2xl origin-top my-8 transition-transform duration-500">
                        {isPDF ? (
                            <div className="relative w-full aspect-[1/1.414]">
                                <iframe 
                                    src={previewUrl}
                                    className="absolute inset-0 w-full h-full border-none"
                                    onLoad={() => setIsLoaded(true)}
                                    title={fileName}
                                />
                                {/* Overlay transparente para evitar interacciones accidentales con el iframe en modo miniatura */}
                                <div className="absolute inset-0 z-10" />
                            </div>
                        ) : (
                            <img 
                                src={previewUrl}
                                alt={fileName}
                                className="w-full h-auto object-contain"
                                onLoad={() => setIsLoaded(true)}
                            />
                        )}
                    </div>
                </div>
            </div>
            
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
            `}</style>
        </div>
    );
}
