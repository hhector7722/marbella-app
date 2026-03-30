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
    const [zoom, setZoom] = useState(0.4); // Zoom por defecto al 40% como pidió el usuario

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setIsLoaded(false);
            setZoom(0.4); // Reiniciar al 40% al abrir
            
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

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 5));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.1));
    const handleResetZoom = () => setZoom(0.4);

    return (
        <div 
            className="fixed inset-0 z-[205] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-300"
            onClick={onClose}
        >
            {/* Fondo difuminado coincidente con el resto de la app */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

            {/* Tarjeta del Modal - Más pequeña y centrada */}
            <div 
                className="relative bg-white w-full max-w-4xl h-[85vh] rounded-[2.5rem] shadow-2xl border border-zinc-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300"
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
                        {/* Controles de Zoom Integrados */}
                        <div className="hidden md:flex items-center bg-black/20 rounded-xl p-1 mr-2 scale-90">
                            <button onClick={handleZoomOut} className="p-2 hover:bg-white/10 rounded-lg transition-colors border-r border-white/10">
                                <ZoomOut size={16} />
                            </button>
                            <button onClick={handleResetZoom} className="px-3 text-[10px] font-black hover:bg-white/10 rounded-lg transition-colors min-w-[50px]">
                                {Math.round(zoom * 100)}%
                            </button>
                            <button onClick={handleZoomIn} className="p-2 hover:bg-white/10 rounded-lg transition-colors border-l border-white/10">
                                <ZoomIn size={16} />
                            </button>
                        </div>

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

                {/* Área de Visualización - Optimizada para pinch-to-zoom */}
                <div 
                    className="flex-1 overflow-auto bg-zinc-50 flex items-center justify-center custom-scrollbar relative p-4 md:p-8"
                    style={{ touchAction: 'pinch-zoom' }}
                >
                    {!isLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/80 backdrop-blur-xs">
                            <Loader2 className="w-10 h-10 text-[#36606F] animate-spin" />
                        </div>
                    )}

                    {/* El Documento propiamente dicho */}
                    <div 
                        className="bg-white shadow-[0_15px_60px_rgba(0,0,0,0.1)] transition-transform duration-200 ease-out origin-center flex items-center justify-center"
                        style={{ 
                            transform: `scale(${zoom})`,
                            width: isPDF ? '100%' : 'auto',
                            height: isPDF ? '100%' : 'auto',
                            minWidth: isPDF ? '900px' : 'none',
                            minHeight: isPDF ? '1200px' : 'none',
                            cursor: zoom > 1 ? 'grab' : 'default'
                        }}
                    >
                        {isPDF ? (
                            <iframe 
                                src={previewUrl}
                                className="w-full h-full border-none pointer-events-auto"
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

                {/* Controles móviles flotantes (Solo si es necesario para pinch fail) */}
                <div className="md:hidden flex justify-center items-center py-4 bg-white border-t border-zinc-100 gap-8">
                     <button onClick={handleZoomOut} className="p-3 bg-zinc-100 rounded-full text-[#36606F] active:scale-90 transition-transform"><ZoomOut size={20}/></button>
                     <span className="text-xs font-black text-zinc-500 min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
                     <button onClick={handleZoomIn} className="p-3 bg-zinc-100 rounded-full text-[#36606F] active:scale-90 transition-transform"><ZoomIn size={20}/></button>
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
