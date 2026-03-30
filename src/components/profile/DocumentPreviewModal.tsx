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

    return (
        <div 
            className="fixed inset-0 z-[205] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-300"
            onClick={onClose}
        >
            {/* Fondo difuminado */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

            {/* Tarjeta del Modal - Ajustada al contenido */}
            <div 
                className="relative bg-white w-full max-w-[90%] sm:max-w-[60%] md:max-w-md lg:max-w-md h-fit max-h-[85vh] rounded-[2.5rem] shadow-2xl border border-zinc-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 mx-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Cabecera Petróleo Estándar */}
                <div className="shrink-0 flex items-center justify-between px-6 py-5 bg-[#36606F] text-white">
                    <div className="flex flex-col">
                        <span className="text-[9px] text-white/50 font-black uppercase tracking-[0.25em]">Previsualización</span>
                        <h2 className="text-sm font-black uppercase tracking-tight truncate max-w-[150px] sm:max-w-xs">
                            {fileName}
                        </h2>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
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

                {/* Área de Visualización */}
                <div className="flex-1 overflow-auto bg-zinc-50 flex flex-col p-4 md:p-6 custom-scrollbar relative">
                    {!isLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center z-20 bg-zinc-50/80 backdrop-blur-xs">
                            <Loader2 className="w-10 h-10 text-[#36606F] animate-spin" />
                        </div>
                    )}

                    {/* Contenedor responsivo con scroll nativo para habilitar Pinch-to-Zoom */}
                    <div className="w-full relative shadow-[0_4px_20px_rgba(0,0,0,0.1)] bg-white rounded-xl overflow-hidden border border-zinc-200 flex-1 min-h-[50vh] flex flex-col">
                        {isPDF ? (
                            <div 
                                className="flex-1 w-full"
                                style={{ 
                                    overflow: 'auto', 
                                    WebkitOverflowScrolling: 'touch'
                                }}
                            >
                                {/* HACK iOS PERFECTO: width: 1px con minWidth 100% obliga a Safari
                                    a constreñir físicamente el PDF al ancho de este contenedor. 
                                    Al no tener origin/scale mutado, el pinch-to-zoom nativo funciona perfecto. */}
                                <iframe 
                                    src={`${fileUrl}#view=FitH`}
                                    style={{
                                        width: '1px',
                                        minWidth: '100%',
                                        maxWidth: '100%',
                                        height: '100%',
                                        minHeight: '100%',
                                        border: 'none',
                                        backgroundColor: '#ffffff'
                                    }}
                                    onLoad={() => setIsLoaded(true)}
                                    title={fileName}
                                    // Eliminado scrolling="no" para devolverle el zoom natural al iframe
                                />
                            </div>
                        ) : (
                            <div className="flex-1 w-full flex items-center justify-center bg-white p-2">
                                <img 
                                    src={fileUrl}
                                    alt={fileName}
                                    className="max-w-full max-h-[70vh] object-contain"
                                    onLoad={() => setIsLoaded(true)}
                                />
                            </div>
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
