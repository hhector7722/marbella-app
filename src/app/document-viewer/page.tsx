'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Printer, Download, FileText } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

import printJS from 'print-js';
import * as pdfjsLib from 'pdfjs-dist';

// Use a reliable CDN for the worker matching the installed version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

function PdfPage({ pdf, pageNum, scale = 1.5 }: { pdf: pdfjsLib.PDFDocumentProxy, pageNum: number, scale?: number }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    useEffect(() => {
        let renderTask: pdfjsLib.RenderTask;
        pdf.getPage(pageNum).then(page => {
            const viewport = page.getViewport({ scale });
            const canvas = canvasRef.current;
            if (!canvas) return;
            const context = canvas.getContext('2d');
            if (!context) return;
            
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            const renderContext = {
                canvasContext: context,
                viewport: viewport,
                canvas: canvas
            };
            renderTask = page.render(renderContext as any);
        }).catch(err => {
            console.error(`Error rendering page ${pageNum}:`, err);
        });
        
        return () => {
            if (renderTask) renderTask.cancel();
        };
    }, [pdf, pageNum, scale]);

    return (
        <div className="relative mb-4 last:mb-0 w-full flex justify-center">
            <canvas ref={canvasRef} className="max-w-full h-auto bg-white shadow-md rounded-sm" />
        </div>
    );
}

function DocumentViewerContent() {
    const searchParams = useSearchParams();
    const docUrl = searchParams.get('url');
    const title = searchParams.get('title') || 'Documento';
    
    const [loading, setLoading] = useState(true);
    const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [loadError, setLoadError] = useState(false);

    useEffect(() => {
        if (!docUrl) return;
        setLoading(true);
        setLoadError(false);
        
        const loadingTask = pdfjsLib.getDocument(docUrl);
        loadingTask.promise.then(loadedPdf => {
            setPdf(loadedPdf);
            setLoading(false);
        }).catch(err => {
            console.error('Error loading PDF:', err);
            setLoadError(true);
            setLoading(false);
        });
    }, [docUrl]);

    const handlePrint = () => {
        if (!docUrl) return;
        try {
            printJS({
                printable: docUrl,
                type: 'pdf',
                showModal: true,
                modalMessage: 'Preparando documento...'
            });
        } catch (e) {
            console.error("Print error, falling back to window.print()", e);
            window.print();
        }
    };

    if (!docUrl) {
        return (
            <div className="flex h-[100dvh] w-full items-center justify-center bg-zinc-100 p-4 text-center">
                <div className="flex flex-col items-center max-w-sm">
                    <FileText size={48} className="text-zinc-300 mb-4" />
                    <h2 className="text-lg font-bold text-zinc-700">No se ha especificado ningún documento</h2>
                </div>
            </div>
        );
    }

    const pages = pdf ? Array.from({ length: pdf.numPages }, (_, i) => i + 1) : [];

    return (
        <div className="flex flex-col h-[100dvh] w-full bg-zinc-200/80 overflow-hidden">
            {/* Header */}
            <div className="print:hidden flex items-center justify-between h-16 bg-white px-4 md:px-6 shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl bg-blue-50 text-blue-500">
                        <FileText size={20} strokeWidth={2} />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold text-zinc-800 truncate">{title}</span>
                        <span className="text-xs font-medium text-zinc-500">
                            {pdf ? `${pdf.numPages} ${pdf.numPages === 1 ? 'página' : 'páginas'}` : 'Visor de PDF'}
                        </span>
                    </div>
                </div>
                
                <div className="flex items-center gap-2 shrink-0 ml-4">
                    <button
                        onClick={handlePrint}
                        className="h-10 px-4 flex items-center justify-center gap-2 rounded-xl text-white bg-[#5B8FB9] hover:bg-[#4a7a9e] transition-colors shadow-sm"
                        title="Imprimir todo el documento"
                    >
                        <Printer size={18} />
                        <span className="text-sm font-bold">Imprimir</span>
                    </button>
                </div>
            </div>

            {/* Viewer Area */}
            <div className="flex-1 overflow-y-auto w-full p-4 md:p-8 flex flex-col items-center">
                {loading && (
                    <div className="flex flex-col items-center justify-center h-full">
                        <LoadingSpinner size="lg" className="text-[#5B8FB9]" />
                        <span className="mt-3 text-sm font-medium text-zinc-500 animate-pulse">Cargando páginas...</span>
                    </div>
                )}
                
                {loadError && (
                    <div className="flex flex-col items-center justify-center h-full">
                        <span className="text-sm font-medium text-red-500">Error al cargar el PDF. Puede que el archivo no sea válido.</span>
                        <a href={docUrl} download className="mt-4 px-4 py-2 bg-white text-zinc-700 rounded-lg shadow-sm text-sm font-bold">Descargar archivo original</a>
                    </div>
                )}
                
                {!loading && !loadError && pdf && (
                    <div className="w-full max-w-4xl mx-auto flex flex-col pb-12 relative">
                        {/* Indicador estilo iOS */}
                        <div className="sticky top-4 left-4 z-20 self-start bg-zinc-900/40 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold tracking-wide shadow-sm mb-4">
                            PDF de {pdf.numPages} pág.
                        </div>
                        {pages.map(pageNum => (
                            <PdfPage key={pageNum} pdf={pdf} pageNum={pageNum} />
                        ))}
                    </div>
                )}
            </div>
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
