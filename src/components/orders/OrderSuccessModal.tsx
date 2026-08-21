'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { pdfFirstPageToPngBlob } from '@/utils/orders/pdf-to-image';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

interface OrderSuccessModalProps {
    isOpen: boolean;
    pdfUrl: string | null;
    generatedBlob: Blob | null;
    supplierPhone: string | null;
    isUploading: boolean;
    isGenerating?: boolean;
    onClose: () => void;
    onDownload: () => void;
}

export function OrderSuccessModal({
    isOpen,
    pdfUrl,
    generatedBlob,
    supplierPhone,
    onClose,
    onDownload
}: OrderSuccessModalProps) {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [cachedPngBlob, setCachedPngBlob] = useState<Blob | null>(null);
    const [showConfirmEnviar, setShowConfirmEnviar] = useState(false);

    const trackConfirmSend = useTrackModalApply('order-success-confirm-send', 'Confirmar envío pedido');

    useEffect(() => {
        if (generatedBlob) {
            const url = URL.createObjectURL(generatedBlob);
            setPreviewUrl(url);
            return () => URL.revokeObjectURL(url);
        } else {
            setPreviewUrl(null);
        }
    }, [generatedBlob]);

    // Pre-convertir PDF a imagen al abrir
    useEffect(() => {
        if (!isOpen || !generatedBlob) {
            setCachedPngBlob(null);
            return;
        }
        let cancelled = false;
        pdfFirstPageToPngBlob(generatedBlob).then((blob) => {
            if (!cancelled) setCachedPngBlob(blob);
        }).catch(() => {
            if (!cancelled) setCachedPngBlob(null);
        });
        return () => { cancelled = true; };
    }, [isOpen, generatedBlob]);

    useEffect(() => {
        if (!isOpen) setShowConfirmEnviar(false);
    }, [isOpen]);

    const mensaje = 'Adjunto pedido.\n\nRecordad enviar el albarán a marbellaremote@gmail.com.\n\nGracias.';

    /** Paso 1: Copia imagen al portapapeles y muestra confirmación para abrir WhatsApp */
    const handleProveedor = async () => {
        if (!supplierPhone || !generatedBlob) return;

        setIsCapturing(true);
        let blob = cachedPngBlob;
        if (!blob) {
            try {
                blob = await pdfFirstPageToPngBlob(generatedBlob);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error('pdfFirstPageToPngBlob error:', err);
                toast.error(`Error al crear imagen: ${msg.slice(0, 80)}`);
                setIsCapturing(false);
                return;
            }
        }
        if (!blob) {
            toast.warning('Espera a que se genere la imagen…');
            setIsCapturing(false);
            return;
        }

        let copied = false;
        if (navigator.clipboard?.write) {
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                copied = true;
            } catch {
                try {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': Promise.resolve(blob) })]);
                    copied = true;
                } catch {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'Pedido_Bar_La_Marbella.png';
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.info('Imagen descargada. Adjúntala en WhatsApp.');
                }
            }
        } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Pedido_Bar_La_Marbella.png';
            a.click();
            URL.revokeObjectURL(url);
            toast.info('Imagen descargada. Adjúntala en WhatsApp.');
        }
        if (copied) toast.success('Imagen copiada al portapapeles');

        setShowConfirmEnviar(true);
        setIsCapturing(false);
    };

    /** Paso 2: Abre WhatsApp con el contacto del proveedor (desde modal de confirmación) */
    const handleConfirmEnviar = () => {
        if (!supplierPhone) return;
        trackConfirmSend('Enviar por WhatsApp');
        const cleanPhone = supplierPhone.replace(/\D/g, '');
        const finalPhone = cleanPhone.startsWith('34') ? cleanPhone : `34${cleanPhone}`;
        const whatsappUrl = `https://wa.me/${finalPhone}?text=${encodeURIComponent(mensaje)}`;
        window.open(whatsappUrl, '_blank');
        setShowConfirmEnviar(false);
    };

    const handleShare = async () => {
        if (!generatedBlob) return;
        try {
            const file = new File([generatedBlob], 'Pedido_Bar_La_Marbella.pdf', { type: 'application/pdf' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Pedido Bar La Marbella',
                    text: 'Aquí tienes el pedido generado.'
                });
            } else if (pdfUrl) {
                if (navigator.share) {
                    await navigator.share({
                        title: 'Pedido Bar La Marbella',
                        text: 'Aquí tienes el enlace al pedido.',
                        url: pdfUrl
                    });
                } else {
                    await navigator.clipboard.writeText(pdfUrl);
                    toast.success('Enlace copiado al portapapeles');
                }
            }
        } catch (error) {
            console.error('Error sharing:', error);
        }
    };

    const iframeSrc = pdfUrl || previewUrl;
    const actionsDisabled = isCapturing || !generatedBlob;

    return (
        <>
            <Modal
                open={isOpen}
                onClose={onClose}
                title="Pedido Guardado"
                variant="compact"
                layer="base"
                instance="order-success"
                headerTone="petroleum"
                usageId="order-success"
                usageLabel="Pedido guardado"
                footer={
                    <Button
                        type="button"
                        variant="secondary"
                        instance="order-success-back"
                        onClick={onClose}
                    >
                        Atrás
                    </Button>
                }
            >
                <div className="flex flex-col gap-4">
                    <div className="w-full bg-zinc-50 rounded-xl border border-zinc-200 overflow-hidden relative">
                        {iframeSrc ? (
                            <iframe
                                src={iframeSrc}
                                className="w-full h-64 md:h-96"
                                title="Previsualización del Pedido"
                            />
                        ) : (
                            <div className="w-full h-64 flex items-center justify-center text-zinc-400 text-xs font-bold uppercase tracking-widest">
                                Generando documento...
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            instance="order-success-download"
                            layout="hug"
                            disabled={actionsDisabled}
                            onClick={onDownload}
                        >
                            Descargar
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            instance="order-success-share"
                            layout="hug"
                            disabled={actionsDisabled}
                            onClick={() => void handleShare()}
                        >
                            Enviar
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            instance="order-success-supplier"
                            layout="hug"
                            disabled={actionsDisabled || !supplierPhone}
                            onClick={() => void handleProveedor()}
                        >
                            Proveedor
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={isOpen && showConfirmEnviar}
                onClose={() => setShowConfirmEnviar(false)}
                title="Enviar pedido"
                variant="compact"
                layer="system"
                instance="order-success-confirm-send"
                usageId="order-success-confirm-send"
                usageLabel="Confirmar envío pedido"
                footer={
                    <>
                        <Button
                            type="button"
                            variant="secondary"
                            instance="order-success-confirm-cancel"
                            onClick={() => setShowConfirmEnviar(false)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            instance="order-success-confirm-submit"
                            onClick={handleConfirmEnviar}
                        >
                            Sí, enviar
                        </Button>
                    </>
                }
            >
                <p className="text-sm font-medium text-zinc-700">
                    ¿Estás seguro de que deseas enviar el pedido al proveedor?
                </p>
            </Modal>
        </>
    );
}
