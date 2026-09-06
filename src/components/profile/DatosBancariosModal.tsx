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

    const handleCopy = async () => {
        const value = iban?.trim();
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success('IBAN copiado al portapapeles');
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('No se pudo copiar el IBAN');
        }
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
            <div className="py-ds-8 pb-[max(var(--espacio-8),env(safe-area-inset-bottom))]">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">IBAN</p>
                <div className="flex items-center gap-2">
                    <p className="text-zinc-800 font-bold text-sm flex-1 min-w-0 break-all font-mono">{iban || '—'}</p>
                    {iban ? (
                        <button
                            type="button"
                            onClick={() => void handleCopy()}
                            aria-label="Copiar IBAN"
                            title="Copiar IBAN"
                            className="flex h-ds-tactil w-ds-tactil shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-600 transition-colors hover:bg-zinc-100 active:scale-95"
                        >
                            {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                        </button>
                    ) : null}
                </div>
            </div>
        </Modal>
    );
}