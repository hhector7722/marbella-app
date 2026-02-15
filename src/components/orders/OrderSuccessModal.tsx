'use client';

import { CheckCircle2, Download, Share2, ArrowRight, FileText } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn } from "@/lib/utils";

interface OrderSuccessModalProps {
    isOpen: boolean;
    pdfUrl: string | null;
    isUploading: boolean;
    onClose: () => void;
    onDownload: () => void;
}

export function OrderSuccessModal({ isOpen, pdfUrl, isUploading, onClose, onDownload }: OrderSuccessModalProps) {
    if (!isOpen) return null;

    const handleShare = async () => {
        if (!pdfUrl) return;
        try {
            if (navigator.share) {
                await navigator.share({
                    title: 'Pedido Bar La Marbella',
                    text: 'Aquí tienes el pedido generado.',
                    url: pdfUrl
                });
            } else {
                await navigator.clipboard.writeText(pdfUrl);
                alert('Enlace copiado al portapapeles');
            }
        } catch (error) {
            console.error('Error sharing:', error);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-300 flex flex-col">

                {/* Header */}
                <div className="bg-[#36606F] py-6 px-8 flex flex-col items-center justify-center text-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-[#36606F] opacity-50 z-0"></div>
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-3 backdrop-blur-sm animate-bounce">
                            <CheckCircle2 size={32} className="text-white" strokeWidth={3} />
                        </div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-wider leading-tight">Pedido Guardado</h2>
                        <p className="text-white/80 text-xs font-bold mt-1">El pedido se ha procesado correctamente</p>
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 flex flex-col gap-4">

                    {/* PDF Card */}
                    <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-100 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm border border-zinc-100 shrink-0">
                            {isUploading ? (
                                <LoadingSpinner size="sm" className="text-[#36606F]" />
                            ) : (
                                <FileText size={24} className="text-[#36606F]" />
                            )}
                        </div>
                        <div className="flex flex-col overflow-hidden">
                            <span className="font-bold text-gray-700 text-sm truncate">Pedido_Generado.pdf</span>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                {isUploading ? 'Generando archivo...' : 'Listo para descargar'}
                            </span>
                        </div>
                    </div>

                    {/* Actions Grid */}
                    <div className="grid grid-cols-2 gap-3 mt-2">
                        <button
                            onClick={onDownload}
                            disabled={isUploading || !pdfUrl}
                            className={cn(
                                "flex flex-col items-center justify-center gap-2 p-4 rounded-xl transition-all active:scale-95 disabled:opacity-50",
                                "bg-white border-2 border-zinc-100 hover:bg-zinc-50 shadow-sm"
                            )}
                        >
                            <Download size={24} className="text-gray-600" />
                            <span className="text-[10px] font-black text-gray-600 uppercase tracking-wider">Exportar</span>
                        </button>
                        <button
                            onClick={handleShare}
                            disabled={isUploading || !pdfUrl}
                            className={cn(
                                "flex flex-col items-center justify-center gap-2 p-4 rounded-xl transition-all active:scale-95 disabled:opacity-50",
                                "bg-white border-2 border-zinc-100 hover:bg-zinc-50 shadow-sm"
                            )}
                        >
                            <Share2 size={24} className="text-gray-600" />
                            <span className="text-[10px] font-black text-gray-600 uppercase tracking-wider">Enviar</span>
                        </button>
                    </div>

                    {/* Main Action */}
                    <button
                        onClick={onClose}
                        className="w-full h-14 bg-[#5E35B1] text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-purple-100 hover:bg-[#4d2c91] active:scale-95 transition-all flex items-center justify-center gap-2 mt-2"
                    >
                        <span>Volver al Inicio</span>
                        <ArrowRight size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
}
