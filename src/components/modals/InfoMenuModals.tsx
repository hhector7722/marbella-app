'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { AccessMenuGrid, CatalogTile } from '@/components/catalog/CatalogTile';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import {
    STAFF_HORNO_MANUAL_ITEMS,
    STAFF_MANUAL_ASSETS,
    STAFF_MANUAL_MENU,
    STAFF_TPV_MANUAL_ICONS,
    STAFF_TPV_MANUAL_ITEMS,
    STAFF_TPV_MANUAL_VIDEOS,
    type StaffManualMenuId,
} from '@/lib/staff-manuals';

const CONTACTS_DATA = [
    { name: 'Hielo Fenix', phone: '(3461) 028-8888' },
    { name: 'Servei Tècnic Cafetera', phone: '(3493) 293-6749' },
    { name: "Recollida d'Oli", phone: '(3493) 673-1722' },
    { name: 'Recepció Cem Marbella', phone: '(3493) 221-0676' },
    { name: 'Ramón', phone: '(3466) 023-1748' },
    { name: 'Héctor', phone: '(3464) 722-9309' },
];

const INFO_MENU = [
    { title: 'Contactos de Interés', imageSrc: '/icons/whatsapp.png', kind: 'contactos' as const },
    { title: 'Manuales', imageSrc: '/icons/guide.png', kind: 'manuales' as const },
];

type ManualMediaViewerState = { type: 'video' | 'image'; src: string; title: string } | null;

function cleanPhone(phone: string) {
    return phone.replace(/[^\d+]/g, '');
}

type InfoMenuModalsProps = {
    open: boolean;
    onClose: () => void;
    usagePrefix?: 'staff' | 'admin';
};

export function InfoMenuModals({ open, onClose, usagePrefix = 'admin' }: InfoMenuModalsProps) {
    const [infoSubMenu, setInfoSubMenu] = useState<'contactos' | null>(null);
    const [isManualsModalOpen, setIsManualsModalOpen] = useState(false);
    const [isTpvManualModalOpen, setIsTpvManualModalOpen] = useState(false);
    const [isHornoManualModalOpen, setIsHornoManualModalOpen] = useState(false);
    const [manualMediaViewer, setManualMediaViewer] = useState<ManualMediaViewerState>(null);

    const trackInfoMenu = useTrackModalApply(`${usagePrefix}-info-menu`, 'Menú información');

    useEffect(() => {
        if (open) return;
        setInfoSubMenu(null);
        setIsManualsModalOpen(false);
        setIsTpvManualModalOpen(false);
        setIsHornoManualModalOpen(false);
        setManualMediaViewer(null);
    }, [open]);

    useModalUsageTracking({
        open,
        usageId: `${usagePrefix}-info-menu-${infoSubMenu ?? 'root'}`,
        usageLabel: infoSubMenu === 'contactos' ? 'Contactos' : 'Información',
    });

    useModalUsageTracking({
        open: isManualsModalOpen,
        usageId: `${usagePrefix}-manuales`,
        usageLabel: 'Manuales',
    });

    const closeAll = () => {
        setInfoSubMenu(null);
        setIsManualsModalOpen(false);
        setIsTpvManualModalOpen(false);
        setIsHornoManualModalOpen(false);
        setManualMediaViewer(null);
        onClose();
    };

    const closeManualsModal = () => {
        setIsManualsModalOpen(false);
        setIsTpvManualModalOpen(false);
        setIsHornoManualModalOpen(false);
    };

    const backToInfoFromManuals = () => {
        closeManualsModal();
        setInfoSubMenu(null);
    };

    const openStaffPdf = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleStaffManualItem = (id: StaffManualMenuId) => {
        switch (id) {
            case 'check-list':
                openStaffPdf(STAFF_MANUAL_ASSETS.checkListPdf);
                break;
            case 'horno':
                setIsTpvManualModalOpen(false);
                setIsHornoManualModalOpen(true);
                break;
            case 'tpv':
                setIsHornoManualModalOpen(false);
                setIsTpvManualModalOpen(true);
                break;
            case 'altavoces':
                setIsTpvManualModalOpen(false);
                setIsHornoManualModalOpen(false);
                setManualMediaViewer({ type: 'video', src: STAFF_MANUAL_ASSETS.altavocesVideo, title: 'Altavoces' });
                break;
            case 'bebidas':
                setIsTpvManualModalOpen(false);
                setIsHornoManualModalOpen(false);
                setManualMediaViewer({ type: 'image', src: STAFF_MANUAL_ASSETS.bebidasImage, title: 'Bebidas' });
                break;
            case 'cambios-lluvia':
                setIsTpvManualModalOpen(false);
                setIsHornoManualModalOpen(false);
                setManualMediaViewer({ type: 'image', src: STAFF_MANUAL_ASSETS.cambiosLluviaImage, title: 'Cambios por Lluvia' });
                break;
            case 'cuadro-electrico':
                setIsTpvManualModalOpen(false);
                setIsHornoManualModalOpen(false);
                setManualMediaViewer({ type: 'image', src: STAFF_MANUAL_ASSETS.cuadroElectricoImage, title: 'Acceso Cuadro Eléctrico' });
                break;
            default:
                break;
        }
    };

    return (
        <>
            <Modal
                open={open && !isManualsModalOpen}
                onClose={closeAll}
                variant="standard"
                layer="base"
                instance={`${usagePrefix}-info`}
                title={infoSubMenu === 'contactos' ? 'Contactos' : 'Información'}
                headerTone="petroleum"
                scheme="dark"
                onBack={infoSubMenu ? () => setInfoSubMenu(null) : undefined}
            >
                <div className="space-y-2">
                    {!infoSubMenu && (
                        <AccessMenuGrid>
                            {INFO_MENU.map((item) => (
                                <CatalogTile
                                    key={item.title}
                                    title={item.title}
                                    imageSrc={item.imageSrc}
                                    onClick={() => {
                                        trackInfoMenu(item.title);
                                        if (item.kind === 'contactos') {
                                            setInfoSubMenu('contactos');
                                            return;
                                        }
                                        setInfoSubMenu(null);
                                        setIsManualsModalOpen(true);
                                    }}
                                />
                            ))}
                        </AccessMenuGrid>
                    )}
                    {infoSubMenu === 'contactos' && (
                        <div className="max-h-[60vh] overflow-y-auto pr-1 divide-y divide-gray-100">
                            {CONTACTS_DATA.map((c) => (
                                <div key={c.name} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-gray-800 truncate">{c.name}</p>
                                    </div>
                                    <div className="flex gap-4 items-center">
                                        <a href={`tel:${cleanPhone(c.phone)}`} className="text-emerald-500 hover:text-emerald-600 transition-colors p-1 active:scale-95"><Phone size={22} /></a>
                                        <a href={`https://wa.me/${cleanPhone(c.phone).replace('+', '')}`} target="_blank" rel="noopener noreferrer" className="transition-all hover:scale-110 active:scale-95">
                                            <Image src="/icons/whatsapp.png" alt="WhatsApp" width={28} height={28} className="object-contain" />
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>

            <Modal
                open={isManualsModalOpen}
                onClose={closeManualsModal}
                variant="standard"
                layer="base"
                instance={`${usagePrefix}-manuales`}
                title="Manuales"
                headerTone="petroleum"
                scheme="dark"
                onBack={backToInfoFromManuals}
            >
                <AccessMenuGrid>
                    {STAFF_MANUAL_MENU.map((item) => (
                        <CatalogTile
                            key={item.id}
                            title={item.label}
                            imageSrc={item.icon}
                            onClick={() => handleStaffManualItem(item.id)}
                        />
                    ))}
                </AccessMenuGrid>
            </Modal>

            <Modal
                open={isManualsModalOpen && isTpvManualModalOpen}
                onClose={() => setIsTpvManualModalOpen(false)}
                variant="standard"
                layer="derived"
                instance={`${usagePrefix}-manual-tpv`}
                parentInstance={`${usagePrefix}-manuales`}
                title="TPV"
                headerTone="petroleum"
                scheme="dark"
            >
                <AccessMenuGrid>
                    {STAFF_TPV_MANUAL_ITEMS.map((label) => (
                        <CatalogTile
                            key={label}
                            title={label}
                            imageSrc={STAFF_TPV_MANUAL_ICONS[label]}
                            onClick={() => {
                                const v = STAFF_TPV_MANUAL_VIDEOS[label];
                                if (!v) {
                                    toast.info('Destino pendiente de configurar', { description: label });
                                    return;
                                }
                                setIsTpvManualModalOpen(false);
                                setIsHornoManualModalOpen(false);
                                setManualMediaViewer({ type: 'video', src: v.src, title: v.title });
                            }}
                        />
                    ))}
                </AccessMenuGrid>
            </Modal>

            <Modal
                open={isManualsModalOpen && isHornoManualModalOpen}
                onClose={() => setIsHornoManualModalOpen(false)}
                variant="standard"
                layer="derived"
                instance={`${usagePrefix}-manual-horno`}
                parentInstance={`${usagePrefix}-manuales`}
                title="Horno"
                headerTone="petroleum"
                scheme="dark"
            >
                <AccessMenuGrid>
                    {STAFF_HORNO_MANUAL_ITEMS.map((item) => (
                        <CatalogTile
                            key={item.id}
                            title={item.label}
                            imageSrc={item.icon}
                            onClick={() => {
                                if (item.id === 'limpieza') {
                                    openStaffPdf(STAFF_MANUAL_ASSETS.hornoLimpiezaPdf);
                                    return;
                                }
                                setIsHornoManualModalOpen(false);
                                setIsTpvManualModalOpen(false);
                                setManualMediaViewer({
                                    type: 'video',
                                    src: STAFF_MANUAL_ASSETS.hornoFuncionamientoVideo,
                                    title: 'Funcionamiento Horno',
                                });
                            }}
                        />
                    ))}
                </AccessMenuGrid>
            </Modal>

            <Modal
                open={!!manualMediaViewer}
                onClose={() => setManualMediaViewer(null)}
                variant="amplify"
                layer="derived"
                instance={`${usagePrefix}-manual-media`}
                parentInstance={`${usagePrefix}-manuales`}
                title={manualMediaViewer?.title ?? ''}
                headerTone="petroleum"
                wrapperClassName="max-w-3xl"
            >
                <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50">
                    {manualMediaViewer?.type === 'video' ? (
                        <video
                            src={manualMediaViewer.src}
                            controls
                            playsInline
                            className="mx-auto w-full max-h-[75vh] rounded-xl bg-black"
                        >
                            Tu navegador no reproduce vídeo embebido.
                        </video>
                    ) : manualMediaViewer ? (
                        <div className="flex justify-center">
                            <Image
                                src={manualMediaViewer.src}
                                alt={manualMediaViewer.title}
                                width={1200}
                                height={1600}
                                className="h-auto max-h-[75vh] w-auto max-w-full object-contain"
                            />
                        </div>
                    ) : null}
                </div>
            </Modal>
        </>
    );
}
