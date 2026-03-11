'use client';

import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ContactoModalProps {
    isOpen: boolean;
    onClose: () => void;
    phone: string | null;
}

function normalizePhone(phone: string | null): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('34')) return digits;
    return '34' + digits;
}

export default function ContactoModal({ isOpen, onClose, phone }: ContactoModalProps) {
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;

    const telNumber = phone ? normalizePhone(phone) : '';
    const waNumber = telNumber;

    const handleCopy = () => {
        if (!phone) return;
        navigator.clipboard.writeText(phone);
        setCopied(true);
        toast.success('Número copiado');
        setTimeout(() => setCopied(false), 2000);
    };

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
                    <h2 className="text-base font-black uppercase tracking-wider">Contacto</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-white/80 hover:bg-white/20 transition-colors active:scale-95"
                        aria-label="Cerrar"
                    >
                        <X size={22} strokeWidth={2.5} />
                    </button>
                </div>
                <div className="p-6 space-y-5">
                    <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Teléfono</p>
                            <p className="text-black font-bold text-sm break-all">{phone || '—'}</p>
                        </div>
                        {phone && (
                            <button
                                type="button"
                                onClick={handleCopy}
                                className="shrink-0 min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl text-zinc-500 hover:text-black hover:bg-zinc-100 transition-colors"
                                title="Copiar número"
                            >
                                {copied ? <Check size={20} className="text-emerald-600" /> : <Copy size={18} />}
                                <span className="text-[10px] text-zinc-400 font-medium leading-tight">copiar</span>
                            </button>
                        )}
                    </div>
                    {phone && (
                        <div className="flex items-center gap-6 pt-2">
                            <a
                                href={`tel:+${telNumber}`}
                                className="min-h-[48px] flex items-center justify-center gap-2 text-black font-black text-[10px] uppercase tracking-widest hover:opacity-70 transition-opacity active:scale-[0.98]"
                            >
                                <img src="/icons/phone.png" alt="" className="w-6 h-6 object-contain" />
                                Llamar
                            </a>
                            <a
                                href={`https://wa.me/${waNumber}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-h-[48px] flex items-center justify-center gap-2 text-black font-black text-[10px] uppercase tracking-widest hover:opacity-70 transition-opacity active:scale-[0.98]"
                            >
                                <img src="/icons/whatsapp.png" alt="" className="w-6 h-6 object-contain" />
                                WhatsApp
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
