'use client';

import { Modal } from '@/components/ui/modal';

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
    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Nóminas y documentos"
            headerVariant="petroleum"
            className="rounded-3xl"
            usageId="nominas-menu"
            usageLabel="Menú nóminas"
        >
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
        </Modal>
    );
}
