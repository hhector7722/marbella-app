'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Printer, Download, FileText } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

function DocumentViewerContent() {
    const searchParams = useSearchParams();
    const docUrl = searchParams.get('url');
    const title = searchParams.get('title') || 'Documento';
    const [loading, setLoading] = useState(true);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        if (docUrl) {
            setLoading(true);
        }
    }, [docUrl]);

    const handlePrint = () => {
        if (iframeRef.current && iframeRef.current.contentWindow) {
            try {
                iframeRef.current.contentWindow.focus();
                iframeRef.current.contentWindow.print();
            } catch (e) {
                console.error("Print error, falling back to window.print()", e);
                window.print();
            }
        } else {
            // Fallback
            window.print();
        }
    };

    if (!docUrl) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-zinc-100 p-4 text-center">
                <div className="flex flex-col items-center max-w-sm">
                    <FileText size={48} className="text-zinc-300 mb-4" />
                    <h2 className="text-lg font-bold text-zinc-700">No se ha especificado ningún documento</h2>
                    <p className="text-sm text-zinc-500 mt-2">Cierra esta pestaña y vuelve a abrir el documento desde la aplicación.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[100dvh] w-full bg-zinc-100 overflow-hidden">
            {/* Header (hidden when printing) */}
            <div className="print:hidden flex items-center justify-between h-16 bg-white px-4 md:px-6 shrink-0 shadow-sm border-b border-zinc-200 z-10">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl bg-blue-50 text-blue-500">
                        <FileText size={20} strokeWidth={2} />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold text-zinc-800 truncate">{title}</span>
                        <span className="text-xs font-medium text-zinc-400">Visor de PDF</span>
                    </div>
                </div>
                
                <div className="flex items-center gap-2 shrink-0 ml-4">
                    <a
                        href={docUrl}
                        download
                        className="h-10 px-4 flex items-center justify-center gap-2 rounded-xl text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors"
                        title="Descargar"
                    >
                        <Download size={18} />
                        <span className="text-sm font-bold hidden sm:inline">Descargar</span>
                    </a>
                    <button
                        onClick={handlePrint}
                        className="h-10 px-4 flex items-center justify-center gap-2 rounded-xl text-white bg-[#5B8FB9] hover:bg-[#4a7a9e] transition-colors shadow-sm"
                        title="Imprimir"
                    >
                        <Printer size={18} />
                        <span className="text-sm font-bold">Imprimir</span>
                    </button>
                </div>
            </div>

            {/* Viewer Area */}
            <div className="flex-1 relative bg-zinc-200/50 print:bg-white w-full h-full">
                {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-0">
                        <LoadingSpinner size="lg" className="text-[#5B8FB9]" />
                        <span className="mt-3 text-sm font-medium text-zinc-500 animate-pulse">Cargando documento...</span>
                    </div>
                )}
                <iframe
                    ref={iframeRef}
                    src={docUrl}
                    className="w-full h-full border-none print:!h-screen print:!w-screen"
                    title={title}
                    onLoad={() => setLoading(false)}
                />
            </div>

            {/* Print Styles */}
            <style jsx global>{`
                @media print {
                    @page { margin: 0; }
                    body { margin: 0; padding: 0; background: white; }
                    .print\\:hidden { display: none !important; }
                    /* Make the iframe fill the printed page */
                    iframe { position: absolute; left: 0; top: 0; width: 100vw !important; height: 100vh !important; }
                }
            `}</style>
        </div>
    );
}

export default function DocumentViewerPage() {
    return (
        <Suspense fallback={
            <div className="flex h-[100dvh] w-full items-center justify-center bg-zinc-100">
                <LoadingSpinner size="lg" className="text-[#5B8FB9]" />
            </div>
        }>
            <DocumentViewerContent />
        </Suspense>
    );
}
