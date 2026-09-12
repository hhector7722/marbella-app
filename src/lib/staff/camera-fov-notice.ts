/**
 * Aviso puntual del campo de visión de la cámara, embebido en el modal
 * de confirmar entrada. Solo se marca como leído al confirmar un fichaje
 * de entrada con éxito.
 */

export const CAMERA_FOV_NOTICE_ACKED_AT_COLUMN = 'camera_fov_notice_acked_at' as const;

export const CAMERA_FOV_NOTICE_IMAGE_SRC = '/docs/manuals/camara-seguridad.jpg';

export const CAMERA_FOV_NOTICE_IMAGE_WIDTH = 1008;
export const CAMERA_FOV_NOTICE_IMAGE_HEIGHT = 280;

export const CAMERA_FOV_NOTICE_TITLE =
    'Actualización del campo de visión de la cámara de seguridad';

export const CAMERA_FOV_NOTICE_BODY =
    'Se informa del nuevo campo de visión de la cámara, con el objetivo de que todos los trabajadores conozcan su alcance.';

export function isCameraFovNoticePending(ackedAt: string | null | undefined): boolean {
    return ackedAt == null || ackedAt === '';
}

export function shouldShowCameraFovNotice(
    modalAction: 'in' | 'out' | null,
    ackedAt: string | null | undefined,
): boolean {
    return modalAction === 'in' && isCameraFovNoticePending(ackedAt);
}
