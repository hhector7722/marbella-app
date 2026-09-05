'use client';

import { Modal } from '@/components/ui/modal';

interface DatosBancariosModalProps {
    isOpen: boolean;
    onClose: () => void;
    iban: string | null;
}

export default function DatosBancariosModal({ isOpen, onClose, iban }: DatosBancariosModalProps) {
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
            <div className="">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">IBAN</p>
                <div className="flex items-center gap-2">
                    <p className="text-zinc-800 font-bold text-sm flex-1 min-w-0 break-all font-mono">{iban || '—'}</p>
                </div>
            </div>
        </Modal>
    );
}