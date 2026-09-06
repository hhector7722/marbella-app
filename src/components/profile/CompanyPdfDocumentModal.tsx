'use client';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

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
    if (!documentKind) return null;

    const doc = DOCUMENTS[documentKind];
    const instance = `company-pdf-${documentKind}`;

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title={doc.title}
            variant="compact"
            layer="base"
            instance={instance}
            headerTone="petroleum"
            usageId={instance}
            usageLabel={doc.usageLabel}
        >
            <div className="flex flex-col items-center gap-4">
                <button
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
