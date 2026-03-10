'use client';

import { X } from 'lucide-react';
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
    if (!isOpen) return null;

    const telNumber = phone ? normalizePhone(phone) : '';
    const waNumber = telNumber;

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
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Teléfono</p>
                    <p className="text-zinc-800 font-bold text-sm break-all">{phone || '—'}</p>
                    {phone && (
                        <div className="flex items-center gap-4 pt-2">
                            <a
                                href={`tel:+${telNumber}`}
                                className="flex-1 min-h-[48px] flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-white font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-colors active:scale-[0.98]"
                            >
                                <img src="/icons/phone.png" alt="" className="w-6 h-6 object-contain" />
                                Llamar
                            </a>
                            <a
                                href={`https://wa.me/${waNumber}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 min-h-[48px] flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-white font-black text-[10px] uppercase tracking-widest hover:bg-[#20bd5a] transition-colors active:scale-[0.98]"
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
