'use client';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';

export type CompanyPdfDocumentKind = 'convenio' | 'conducta';

const DOCUMENTS: Record<CompanyPdfDocumentKind, { title: string; path: string; thumb: string; usageLabel: string }> = {
    convenio: {
        title: 'Convenio',
        path: '/docs/convenio.pdf',
        thumb: '/docs/convenio-thumb.png',
        usageLabel: 'Convenio',
    },
    conducta: {
        title: 'Código de Conducta',
        path: '/docs/codigo_conducta.pdf',
        thumb: '/docs/codigo_conducta-thumb.png',
        usageLabel: 'Código de Conducta',
    },
};

interface CompanyPdfDocumentModalProps {
    isOpen: boolean;
    onClose: () => void;
    documentKind: CompanyPdfDocumentKind | null;
}

export default function CompanyPdfDocumentModal({ isOpen, onClose, documentKind }: CompanyPdfDocumentModalProps) {
    const [sharing, setSharing] = useState(false);
    if (!documentKind) return null;

    const doc = DOCUMENTS[documentKind];
    const instance = `company-pdf-${documentKind}`;
    const handleShare = async () => {
        if (sharing) return;
        const url = new URL(doc.path, window.location.origin).href;

        setSharing(true);
        try {
            if (!navigator.share) {
                await navigator.clipboard.writeText(url);
                toast.success('Enlace al PDF copiado');
                return;
            }

            toast.loading('Preparando archivo...', { id: 'share-company-pdf' });
            const response = await fetch(doc.path);
            if (!response.ok) throw new Error('No se pudo cargar el PDF');

            const blob = await response.blob();
            const filename = doc.path.split('/').pop() || 'documento.pdf';
            const file = new File([blob], filename, { type: 'application/pdf' });
            toast.dismiss('share-company-pdf');

            if (navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: doc.title });
            } else {
                // El PDF es público: el enlace puede abrirse sin iniciar sesión.
                await navigator.share({ title: doc.title, url });
            }
        } catch (error: unknown) {
            toast.dismiss('share-company-pdf');
            if (!(error instanceof Error && error.name === 'AbortError')) {
                toast.error('No se pudo compartir el PDF');
                console.error('Error al compartir documento de empresa:', error);
            }
        } finally {
            setSharing(false);
        }
    };

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title={doc.title}
            variant="compact"
            layer="base"
            instance={instance}
            usageId={instance}
            usageLabel={doc.usageLabel}
        >
            <div className="flex flex-col items-center gap-4">
                <button
                    data-design-exception="native-business-button:document-preview-thumbnail"
                    type="button"
                    onClick={() => window.open(doc.path, '_blank', 'noopener,noreferrer')}
                    className="relative block w-full max-w-[220px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-opacity hover:opacity-90"
                    aria-label={`Abrir ${doc.title}`}
                >
                    <img src={doc.thumb} alt={`Primera página de ${doc.title}`} className="block w-full h-auto" />
                </button>
                <div className="text-center">
                    <p className="mb-1 text-base font-black text-gray-800">{doc.title}</p>
                    <p className="text-xs font-medium text-gray-400">Documento PDF</p>
                </div>
                <Button
                    type="button"
                    variant="primary"
                    layout="hug"
                    instance={`${instance}-open`}
                    onClick={() => window.open(doc.path, '_blank', 'noopener,noreferrer')}
                >
                    Abrir documento
                </Button>
                <Button
                    type="button"
                    variant="secondary"
                    layout="hug"
                    instance={`${instance}-share`}
                    loading={sharing}
                    loadingLabel="Preparando PDF"
                    onClick={() => void handleShare()}
                >
                    Compartir PDF
                </Button>
                <a
                    href={doc.path}
                    download
                    className="text-xs font-bold text-gray-400 underline transition-colors hover:text-gray-600"
                >
                    Descargar PDF
                </a>
            </div>
        </Modal>
    );
}
