'use client';

import { useState, useCallback, useEffect } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { getCroppedImg, type CropAreaPixels } from '@/lib/crop-image';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

interface AvatarCropModalProps {
  imageSrc: string;
  onSave: (blob: Blob) => void;
  onCancel: () => void;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;

/** Calcula un recorte cuadrado centrado en la imagen (coordenadas originales). */
function getDefaultCropArea(imgWidth: number, imgHeight: number): CropAreaPixels {
  const size = Math.min(imgWidth, imgHeight);
  const x = Math.max(0, (imgWidth - size) / 2);
  const y = Math.max(0, (imgHeight - size) / 2);
  return { x, y, width: size, height: size };
}

export function AvatarCropModal({ imageSrc, onSave, onCancel }: AvatarCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropAreaPixels | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setCroppedAreaPixels(getDefaultCropArea(img.naturalWidth, img.naturalHeight));
    };
    img.onerror = () => setCroppedAreaPixels(null);
    img.src = imageSrc;
  }, [imageSrc]);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels as CropAreaPixels);
  }, []);

  const handleSave = useCallback(async () => {
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels, true);
      onSave(blob);
    } catch (e) {
      console.error('Crop failed:', e);
    } finally {
      setSaving(false);
    }
  }, [imageSrc, croppedAreaPixels, onSave]);

  return (
    <Modal
      open
      onClose={onCancel}
      title="Ajusta el encuadre y guarda"
      variant="work"
      layer="base"
      instance="avatar-crop"
      usageId="avatar-crop"
      usageLabel="Recorte avatar"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            instance="avatar-crop-cancel"
            onClick={onCancel}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            instance="avatar-crop-save"
            onClick={handleSave}
            disabled={saving || !croppedAreaPixels}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-xl bg-zinc-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            style={{
              containerStyle: { backgroundColor: '#18181b' },
              cropAreaStyle: { border: '2px solid rgba(255,255,255,0.9)' },
            }}
          />
        </div>
        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-zinc-500">
            Zoom
          </span>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={ZOOM_STEP}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-2 min-h-[48px] w-full touch-none appearance-none rounded-full bg-zinc-200 accent-ds-marca"
            aria-label="Zoom"
          />
        </label>
      </div>
    </Modal>
  );
}
