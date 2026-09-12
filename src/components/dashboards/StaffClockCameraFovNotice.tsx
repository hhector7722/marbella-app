'use client';

import { Surface } from '@/components/ui/Surface';
import {
    CAMERA_FOV_NOTICE_BODY,
    CAMERA_FOV_NOTICE_IMAGE_HEIGHT,
    CAMERA_FOV_NOTICE_IMAGE_SRC,
    CAMERA_FOV_NOTICE_IMAGE_WIDTH,
    CAMERA_FOV_NOTICE_TITLE,
} from '@/lib/staff/camera-fov-notice';

/**
 * Cuerpo del modal de confirmar entrada mientras el aviso de la cámara
 * está pendiente. No es una pieza de sistema ni un modal propio.
 *
 * La foto es un estático de `public/` detrás del guardián: se carga con
 * `<img>` para que el navegador envíe la sesión. `next/image` pide el
 * original sin cookies y el proxy lo redirige al login.
 */
export function StaffClockCameraFovNotice() {
    return (
        <div data-element="camera-fov-notice" className="flex min-h-0 w-full min-w-0 flex-col gap-ds-4">
            <div data-element="camera-fov-image" className="w-full shrink-0">
                <img
                    src={`${CAMERA_FOV_NOTICE_IMAGE_SRC}?v=2`}
                    alt="Campo de visión actual de la cámara de seguridad"
                    width={CAMERA_FOV_NOTICE_IMAGE_WIDTH}
                    height={CAMERA_FOV_NOTICE_IMAGE_HEIGHT}
                />
            </div>
            <p data-element="camera-fov-title">
                {CAMERA_FOV_NOTICE_TITLE}
            </p>
            <Surface
                variant="block"
                instance="staff-clock-camera-notice"
                className="w-full min-w-0 p-ds-4"
            >
                <p data-element="camera-fov-body">{CAMERA_FOV_NOTICE_BODY}</p>
            </Surface>
        </div>
    );
}
