'use client';

import { Modal } from '@/components/ui/modal';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';

export type NominasMenuAction = 'nominas' | 'comunicados' | 'contrato' | 'convenio' | 'conducta';

interface NominasMenuModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (action: NominasMenuAction) => void;
}

const OPTIONS: { key: NominasMenuAction; label: string; iconPath: string }[] = [
    { key: 'nominas', label: 'Nóminas', iconPath: '/icons/admin.png' },
    { key: 'contrato', label: 'Contrato', iconPath: '/icons/contract.png' },
    { key: 'comunicados', label: 'Comunicados', iconPath: '/icons/contrato.png' },
    { key: 'convenio', label: 'Convenio', iconPath: '/icons/convenio.png' },
    { key: 'conducta', label: 'Código de Conducta', iconPath: '/icons/ley.png' },
];

export default function NominasMenuModal({ isOpen, onClose, onSelect }: NominasMenuModalProps) {
    const trackNominasMenu = useTrackModalApply('documentos-menu', 'Menú documentos');

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Documentos"
            variant="compact"
            layer="base"
            instance="documentos-menu"
            headerTone="petroleum"
            usageId="documentos-menu"
            usageLabel="Menú documentos"
        >
            <div className="grid grid-cols-1 gap-6">
                {OPTIONS.map(({ key, label, iconPath }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => {
                            trackNominasMenu(label);
                            onSelect(key);
                        }}
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
