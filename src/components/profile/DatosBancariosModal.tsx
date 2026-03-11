'use client';

import { X, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DatosBancariosModalProps {
    isOpen: boolean;
    onClose: () => void;
    iban: string | null;
}

export default function DatosBancariosModal({ isOpen, onClose, iban }: DatosBancariosModalProps) {
    const [copied, setCopied] = useState(false);

    const copy = () => {
        if (!iban) return;
        navigator.clipboard.writeText(iban);
        setCopied(true);
        toast.success('IBAN copiado');
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className={cn(
                    'bg-white w-full max-w-sm rounded-3xl shadow-xl border border-zinc-100 overflow-hidden',
                    'animate-in zoom-in-95 duration-200'
                )}
                onClick={e => e.stopPropagation()}
            >
                <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-[#36606F] text-white">
                    <h2 className="text-base font-black uppercase tracking-wider">Datos bancarios</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-white/80 hover:bg-white/20 transition-colors active:scale-95"
                        aria-label="Cerrar"
                    >
                        <X size={22} strokeWidth={2.5} />
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">IBAN</p>
                    <div className="flex items-center gap-2">
                        <p className="text-zinc-800 font-bold text-sm flex-1 min-w-0 break-all font-mono">{iban || '—'}</p>
                        {iban && (
                            <button
                                onClick={copy}
                                className="shrink-0 min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl bg-zinc-100 text-zinc-500 hover:bg-[#36606F]/10 hover:text-[#36606F] transition-colors"
                            >
                                {copied ? <Check size={20} className="text-emerald-500" /> : <Copy size={18} />}
                                <span className="text-[10px] text-zinc-400 font-medium leading-tight">copiar</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
