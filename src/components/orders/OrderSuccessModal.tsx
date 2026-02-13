'use client';

import { CheckCircle2, Download, Share2, LogOut, FileText, Loader2 } from 'lucide-react';
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
                // Fallback: copy to clipboard
                await navigator.clipboard.writeText(pdfUrl);
                alert('Enlace copiado al portapapeles');
            }
        } catch (error) {
            console.error('Error sharing:', error);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center z-[80] p-4 animate-in fade-in duration-500">
            <div className="bg-white rounded-[3rem] p-10 max-w-md w-full shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] text-center animate-in zoom-in duration-500">
                {/* Success Icon */}
                <div className="mb-6 flex justify-center">
                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center animate-bounce">
                        <CheckCircle2 size={40} className="text-emerald-500" strokeWidth={3} />
                    </div>
                </div>

                <h2 className="text-3xl font-black text-gray-800 mb-2 leading-tight">¡Pedido Guardado!</h2>
                <p className="text-gray-500 font-medium mb-8">El pedido ha sido procesado y guardado con éxito en la base de datos.</p>

                {/* PDF Preview Area */}
                <div className="bg-zinc-50 rounded-[2rem] p-8 mb-10 flex flex-col items-center border border-zinc-100">
                    {isUploading ? (
                        <div className="flex flex-col items-center gap-4">
                            <Loader2 className="w-10 h-10 text-[#5E35B1] animate-spin" />
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Subiendo PDF...</span>
                        </div>
                    ) : (
                        <>
                            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                                <FileText size={32} className="text-[#36606F]" />
                            </div>
                            <span className="font-bold text-gray-700 text-sm">Pedido_Generado.pdf</span>
                        </>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                    <button
                        onClick={onDownload}
                        disabled={isUploading}
                        className="flex flex-col items-center justify-center gap-2 p-4 bg-zinc-50 rounded-3xl hover:bg-zinc-100 transition-all active:scale-95 text-gray-600 disabled:opacity-50"
                    >
                        <Download size={24} />
                        <span className="text-[10px] font-black uppercase tracking-wider">Exportar</span>
                    </button>
                    <button
                        onClick={handleShare}
                        disabled={isUploading || !pdfUrl}
                        className="flex flex-col items-center justify-center gap-2 p-4 bg-zinc-50 rounded-3xl hover:bg-zinc-100 transition-all active:scale-95 text-gray-600 disabled:opacity-50"
                    >
                        <Share2 size={24} />
                        <span className="text-[10px] font-black uppercase tracking-wider">Enviar</span>
                    </button>
                </div>

                <button
                    onClick={onClose}
                    className="w-full py-5 bg-[#36606F] text-white rounded-3xl font-black text-sm uppercase tracking-widest shadow-xl shadow-blue-100 hover:scale-[1.02] active:scale-95 transition-all mt-4"
                >
                    Salir al Inicio
                </button>
            </div>
        </div>
    );
}
