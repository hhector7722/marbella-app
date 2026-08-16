'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';

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

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Datos bancarios"
            variant="compact"
            layer="base"
            instance="profile-bank"
            headerTone="petroleum"
            usageId="profile-bank"
            usageLabel="Datos bancarios"
        >
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
        </Modal>
    );
}
