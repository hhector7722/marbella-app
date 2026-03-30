'use client';

import { X, Download, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface DocumentPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    fileUrl: string | null;
    fileName: string;
    onDownload?: () => void;
}

export default function DocumentPreviewModal({
    isOpen,
    onClose,
    fileUrl,
    fileName,
    onDownload
}: DocumentPreviewModalProps) {
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setIsLoaded(false);
        } else {
            document.body.style.overflow = 'unset';
        }
    }, [isOpen]);

    if (!isOpen || !fileUrl) return null;

    const isPDF = fileUrl.toLowerCase().includes('.pdf') || fileUrl.includes('nomina_');
    const previewUrl = isPDF ? `${fileUrl}#view=Fit` : fileUrl;

    return (
        <div 
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center p-4 md:p-8 animate-in fade-in duration-300"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(10px)' }}
            onClick={onClose}
        >
            {/* Header flotante minimalista */}
            <div 
                className="absolute top-6 left-6 right-6 flex items-center justify-between z-10"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex flex-col">
                    <span className="text-[10px] text-white/50 font-black uppercase tracking-[0.2em] mb-1">Previsualización</span>
                    <h3 className="text-white font-black text-sm md:text-base uppercase tracking-wider truncate max-w-[200px] md:max-w-md">
                        {fileName}
                    </h3>
                </div>
                
                <div className="flex items-center gap-2">
                    {onDownload && (
                        <button 
                            onClick={onDownload}
                            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-2xl bg-white/10 text-white hover:bg-white/20 transition-all active:scale-95"
                            title="Descargar"
                        >
                            <Download size={20} />
                        </button>
                    )}
                    <button 
                        onClick={onClose}
                        className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-2xl bg-white/10 text-white hover:bg-white/20 transition-all active:scale-95"
                        aria-label="Cerrar"
                    >
                        <X size={24} strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            {/* Contenedor del documento "flotando" */}
            <div 
                className={cn(
                    "relative w-full h-full max-w-4xl flex items-center justify-center transition-all duration-500 transform",
                    isLoaded ? "opacity-100 scale-100" : "opacity-0 scale-95"
                )}
                onClick={e => e.stopPropagation()}
            >
                <div className="w-full h-full bg-white rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex items-center justify-center border border-white/10">
                    {isPDF ? (
                        <iframe 
                            src={previewUrl}
                            className="w-full h-full border-none"
                            onLoad={() => setIsLoaded(true)}
                            title={fileName}
                        />
                    ) : (
                        <img 
                            src={previewUrl}
                            alt={fileName}
                            className="max-w-full max-h-full object-contain p-4"
                            onLoad={() => setIsLoaded(true)}
                        />
                    )}
                </div>
            </div>

            {/* Hint de esquinas visibles */}
            <div className="absolute bottom-6 text-white/30 text-[8px] font-black uppercase tracking-widest pointer-events-none">
                Vista de impresión completa • 4 esquinas visibles
            </div>
        </div>
    );
}
