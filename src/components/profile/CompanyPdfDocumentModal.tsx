'use client';

import { ExternalLink, FileText } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

export type CompanyPdfDocumentKind = 'convenio' | 'conducta';

const DOCUMENTS: Record<CompanyPdfDocumentKind, { title: string; path: string; usageLabel: string }> = {
    convenio: {
        title: 'Convenio',
        path: '/docs/convenio.pdf',
        usageLabel: 'Convenio',
    },
    conducta: {
        title: 'Código de Conducta',
        path: '/docs/codigo_conducta.pdf',
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
            <div className="flex flex-col items-center gap-6 p-8 py-6">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-50">
                    <FileText size={40} className="text-blue-400" strokeWidth={1.5} />
                </div>
                <div className="text-center">
                    <p className="mb-1 text-base font-black text-gray-800">{doc.title}</p>
                    <p className="text-xs font-medium text-gray-400">Documento PDF</p>
                </div>
                <Button
                    type="button"
                    variant="primary"
                    layout="fill"
                    instance={`${instance}-open`}
                    icon={<ExternalLink size={20} />}
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
