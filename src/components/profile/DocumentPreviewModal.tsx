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
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center p-6 md:p-16 lg:p-24 animate-in fade-in duration-300"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)', backdropFilter: 'blur(15px)' }}
            onClick={onClose}
        >
            {/* Header flotante */}
            <div 
                className="absolute top-6 left-6 right-6 flex items-center justify-between z-10"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex flex-col bg-black/40 backdrop-blur-xl p-4 rounded-2xl border border-white/10 shadow-2xl">
                    <span className="text-[10px] text-white/50 font-black uppercase tracking-[0.2em] mb-1">Previsualización</span>
                    <h3 className="text-white font-black text-xs md:text-sm uppercase tracking-wider truncate max-w-[150px] md:max-w-md">
                        {fileName}
                    </h3>
                </div>
                
                <div className="flex items-center gap-3">
                    {onDownload && (
                        <button 
                            onClick={onDownload}
                            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-2xl bg-white/10 text-white hover:bg-white/20 border border-white/10 transition-all active:scale-95 shadow-xl"
                        >
                            <Download size={20} />
                        </button>
                    )}
                    <button 
                        onClick={onClose}
                        className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-2xl bg-white/10 text-white hover:bg-white/20 border border-white/10 transition-all active:scale-95 shadow-xl"
                        aria-label="Cerrar"
                    >
                        <X size={22} strokeWidth={3} />
                    </button>
                </div>
            </div>

            {/* Contenedor del documento "alejado" */}
            <div 
                className="relative w-full h-full max-w-4xl flex items-center justify-center transition-all duration-300 transform"
                onClick={e => e.stopPropagation()}
            >
                {!isLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center z-[11] bg-white/5 backdrop-blur-sm rounded-3xl">
                        <Loader2 className="w-10 h-10 text-white animate-spin opacity-50" />
                    </div>
                )}
                
                <div className="w-[85%] h-[85%] md:w-[80%] md:h-[90%] bg-white rounded-3xl shadow-[0_0_80px_rgba(0,0,0,0.8)] overflow-hidden flex items-center justify-center border border-white/20 relative animate-in zoom-in-90 duration-500">
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
                            className="max-w-full max-h-full object-contain p-6"
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
