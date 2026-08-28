'use client';

import { Modal } from '@/components/ui/modal';
import { AccessMenuGrid, CatalogTile } from '@/components/catalog/CatalogTile';
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
            variant="standard"
            layer="base"
            instance="documentos-menu"
            headerTone="petroleum"
            usageId="documentos-menu"
            usageLabel="Menú documentos"
        >
            <AccessMenuGrid>
                {OPTIONS.map(({ key, label, iconPath }) => (
                    <CatalogTile
                        key={key}
                        title={label}
                        imageSrc={iconPath}
                        onClick={() => {
                            trackNominasMenu(label);
                            onSelect(key);
                        }}
                    />
                ))}
            </AccessMenuGrid>
        </Modal>
    );
}
