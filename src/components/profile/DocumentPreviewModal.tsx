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
    const [zoom, setZoom] = useState(0.7); // Iniciamos un poco alejado

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setIsLoaded(false);
            setZoom(0.7); // Reset zoom on open
            
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

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 2));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.3));
    const handleResetZoom = () => setZoom(0.7);

    return (
        <div 
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300"
            onClick={onClose}
        >
            {/* Fondo difuminado estándar */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

            {/* Tarjeta del Modal - Estilo Marbella */}
            <div 
                className="relative bg-zinc-100 w-full max-w-5xl h-[90vh] rounded-[2rem] shadow-2xl border border-white/20 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300"
                onClick={e => e.stopPropagation()}
            >
                {/* Cabecera Petróleo */}
                <div className="shrink-0 flex items-center justify-between px-6 py-4 bg-[#36606F] text-white">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-white/60 font-black uppercase tracking-[0.2em]">Visor de Documentos</span>
                        <h2 className="text-sm font-black uppercase tracking-wider truncate max-w-[200px] md:max-w-md">
                            {fileName}
                        </h2>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Controles de Zoom */}
                        <div className="hidden md:flex items-center bg-black/20 rounded-xl p-1 mr-4">
                            <button onClick={handleZoomOut} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Alejar">
                                <ZoomOut size={18} />
                            </button>
                            <button onClick={handleResetZoom} className="px-3 text-[10px] font-black hover:bg-white/10 rounded-lg transition-colors">
                                {Math.round(zoom * 100)}%
                            </button>
                            <button onClick={handleZoomIn} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Acercar">
                                <ZoomIn size={18} />
                            </button>
                        </div>

                        {onDownload && (
                            <button 
                                onClick={onDownload}
                                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all active:scale-95"
                                title="Descargar"
                            >
                                <Download size={18} />
                            </button>
                        )}
                        <button 
                            onClick={onClose}
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all active:scale-95"
                            aria-label="Cerrar"
                        >
                            <X size={20} strokeWidth={3} />
                        </button>
                    </div>
                </div>

                {/* Área de Visualización */}
                <div className="flex-1 overflow-auto bg-zinc-200/50 flex items-center justify-center custom-scrollbar relative p-8 md:p-16">
                    {!isLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center z-10 bg-zinc-100/50 backdrop-blur-sm">
                            <Loader2 className="w-10 h-10 text-[#36606F] animate-spin" />
                        </div>
                    )}

                    {/* El Documento propiamente dicho */}
                    <div 
                        className="bg-white shadow-[0_20px_50px_rgba(0,0,0,0.15)] transition-all duration-300 origin-center flex items-center justify-center"
                        style={{ 
                            transform: `scale(${zoom})`,
                            width: isPDF ? '100%' : 'auto',
                            height: isPDF ? '100%' : 'auto',
                            minWidth: isPDF ? '800px' : 'none',
                            minHeight: isPDF ? '1100px' : 'none'
                        }}
                    >
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
                                className="max-w-full max-h-full object-contain"
                                onLoad={() => setIsLoaded(true)}
                            />
                        )}
                    </div>
                </div>

                {/* Footer del Modal (opcional, para ayuda zoom) */}
                <div className="p-3 bg-white/80 border-t border-zinc-200 flex justify-center items-center gap-6 text-[10px] font-bold text-zinc-400 uppercase tracking-widest md:hidden">
                   <button onClick={handleZoomOut} className="flex items-center gap-1"><ZoomOut size={14}/> Menor</button>
                   <button onClick={handleResetZoom} className="text-[#36606F]">{Math.round(zoom * 100)}%</button>
                   <button onClick={handleZoomIn} className="flex items-center gap-1"><ZoomIn size={14}/> Mayor</button>
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
