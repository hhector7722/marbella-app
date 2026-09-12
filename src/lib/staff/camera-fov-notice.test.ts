import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
    CAMERA_FOV_NOTICE_IMAGE_SRC,
    isCameraFovNoticePending,
    shouldShowCameraFovNotice,
} from './camera-fov-notice.ts';

describe('Aviso del campo de visión de la cámara', () => {
    it('está pendiente si nunca se confirmó y deja de estarlo con instante', () => {
        assert.equal(isCameraFovNoticePending(null), true);
        assert.equal(isCameraFovNoticePending(undefined), true);
        assert.equal(isCameraFovNoticePending(''), true);
        assert.equal(isCameraFovNoticePending('2026-09-12T08:00:00.000Z'), false);
    });

    it('solo se muestra en la confirmación de entrada mientras está pendiente', () => {
        assert.equal(shouldShowCameraFovNotice('in', null), true);
        assert.equal(shouldShowCameraFovNotice('out', null), false);
        assert.equal(shouldShowCameraFovNotice(null, null), false);
        assert.equal(shouldShowCameraFovNotice('in', '2026-09-12T08:00:00.000Z'), false);
        assert.equal(shouldShowCameraFovNotice('out', '2026-09-12T08:00:00.000Z'), false);
    });

    it('la imagen del aviso existe en public/', () => {
        const relative = CAMERA_FOV_NOTICE_IMAGE_SRC.replace(/^\//, '');
        assert.equal(existsSync(join(process.cwd(), 'public', relative)), true);
    });
});
