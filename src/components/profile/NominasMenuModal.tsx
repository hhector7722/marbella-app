'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NominasMenuAction = 'nominas' | 'comunicados' | 'contrato';

interface NominasMenuModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (action: NominasMenuAction) => void;
}

const OPTIONS: { key: NominasMenuAction; label: string; iconPath: string }[] = [
    { key: 'nominas', label: 'Nóminas', iconPath: '/icons/admin.png' },
    { key: 'contrato', label: 'Contrato', iconPath: '/icons/contract.png' },
    { key: 'comunicados', label: 'Comunicados', iconPath: '/icons/contrato.png' },
];

export default function NominasMenuModal({ isOpen, onClose, onSelect }: NominasMenuModalProps) {
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
                    <h2 className="text-base font-black uppercase tracking-wider">Nóminas y documentos</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-white/80 hover:bg-white/20 transition-colors active:scale-95"
                        aria-label="Cerrar"
                    >
                        <X size={22} strokeWidth={2.5} />
                    </button>
                </div>
                <div className="p-6 grid grid-cols-1 gap-6">
                    {OPTIONS.map(({ key, label, iconPath }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => { onSelect(key); onClose(); }}
                            className="min-h-[56px] flex items-center justify-center gap-3 p-3 transition-all active:scale-[0.98] hover:opacity-80"
                        >
                            <img src={iconPath} alt="" className="w-10 h-10 object-contain shrink-0" />
                            <span className="font-black text-zinc-800 text-sm uppercase tracking-wide">{label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
