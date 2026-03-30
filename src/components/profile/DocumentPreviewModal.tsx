'use client';

import { X, Download, Loader2 } from 'lucide-react';
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
            
            // Fallback para forzar carga si el evento onLoad no dispara (común en PDFs de iOS)
            const timer = setTimeout(() => {
                setIsLoaded(true);
            }, 3000);
            
            return () => clearTimeout(timer);
        } else {
            document.body.style.overflow = 'unset';
        }
    }, [isOpen]);

    if (!isOpen || !fileUrl) return null;

    const previewUrl = isPDF ? `${fileUrl}#view=Fit` : fileUrl;

    return (
        <div 
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center p-2 md:p-8 animate-in fade-in duration-300"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)', backdropFilter: 'blur(15px)' }}
            onClick={onClose}
        >
            {/* Header flotante */}
            <div 
                className="absolute top-4 left-4 right-4 flex items-center justify-between z-10"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex flex-col bg-black/20 backdrop-blur-md p-3 rounded-2xl border border-white/5">
                    <span className="text-[10px] text-white/50 font-black uppercase tracking-[0.2em] mb-1">Previsualización</span>
                    <h3 className="text-white font-black text-xs md:text-sm uppercase tracking-wider truncate max-w-[150px] md:max-w-md">
                        {fileName}
                    </h3>
                </div>
                
                <div className="flex items-center gap-2">
                    {onDownload && (
                        <button 
                            onClick={onDownload}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all active:scale-95"
                        >
                            <Download size={18} />
                        </button>
                    )}
                    <button 
                        onClick={onClose}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all active:scale-95"
                        aria-label="Cerrar"
                    >
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>
            </div>

            {/* Contenedor del documento */}
            <div 
                className="relative w-full h-full max-w-5xl flex items-center justify-center transition-all duration-300 transform"
                onClick={e => e.stopPropagation()}
            >
                {!isLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center z-[11] bg-white/5 backdrop-blur-sm rounded-xl">
                        <Loader2 className="w-10 h-10 text-white animate-spin opacity-50" />
                    </div>
                )}
                
                <div className="w-full h-full bg-white rounded-xl shadow-2xl overflow-hidden flex items-center justify-center border border-white/10 relative">
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
                            className="max-w-full max-h-full object-contain p-2"
                            onLoad={() => setIsLoaded(true)}
                        />
                    )}
                </div>
            </div>

            {/* Footer flotante */}
            <div className="mt-4 text-white/40 text-[8px] font-black uppercase tracking-widest pointer-events-none text-center">
                Vista de impresión completa • Ajustado al alto
            </div>
        </div>
    );
}
