import Image from 'next/image';
import { PinchZoomViewport } from '@/components/ui/PinchZoomViewport';

/** El manual de lluvia se presenta tal como lo entrega el negocio. */
export function RainChangesManualContent() {
    return (
        <div className="mx-auto w-full max-w-5xl pb-ds-2">
            <div className="overflow-hidden rounded-ds-superficie">
                <PinchZoomViewport resetKey="cambios-lluvia" minScale={0.5} maxScale={6} trackpadGestures className="w-full">
                <Image
                    src="/docs/manuals/cambios-lluvia.png"
                    alt="Manual de cambios por lluvia: recoger altavoces, sillas y mesas, y proteger el bar en caso de tormenta fuerte"
                    width={1055}
                    height={1491}
                    sizes="(max-width: 640px) calc(100vw - 2rem), 1024px"
                    unoptimized
                    className="block h-auto w-full"
                    draggable={false}
                />
                </PinchZoomViewport>
            </div>
        </div>
    );
}
