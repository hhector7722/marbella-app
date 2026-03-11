'use client';

import { useState, useCallback } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { getCroppedImg, type CropAreaPixels } from '@/lib/crop-image';
import { cn } from '@/lib/utils';

interface AvatarCropModalProps {
  imageSrc: string;
  onSave: (blob: Blob) => void;
  onCancel: () => void;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;

export function AvatarCropModal({ imageSrc, onSave, onCancel }: AvatarCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropAreaPixels | null>(null);
  const [saving, setSaving] = useState(false);

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
    <div className="fixed inset-0 z-50 flex flex-col bg-[#36606F]">
      {/* Cabecera */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 text-white border-b border-white/20">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl hover:bg-white/10"
          aria-label="Cancelar"
        >
          Cancelar
        </button>
        <span className="text-sm font-bold uppercase tracking-widest">Encuadrar foto</span>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !croppedAreaPixels}
          className={cn(
            'min-h-[48px] px-4 rounded-xl font-bold uppercase text-[10px] tracking-widest',
            saving || !croppedAreaPixels
              ? 'bg-white/30 text-white/70 cursor-not-allowed'
              : 'bg-white text-[#36606F] hover:bg-white/90'
          )}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      {/* Área de recorte: marco circular visible (altura mínima para que Cropper calcule bien) */}
      <div className="flex-1 relative w-full min-h-[280px]">
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
            containerStyle: { backgroundColor: '#36606F' },
            cropAreaStyle: { border: '2px solid rgba(255,255,255,0.8)' },
          }}
        />
      </div>

      {/* Controles zoom */}
      <div className="shrink-0 px-4 py-4 bg-[#36606F] border-t border-white/20">
        <p className="text-white/80 text-[10px] uppercase tracking-widest mb-2">Zoom</p>
        <input
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={ZOOM_STEP}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full h-2 rounded-full appearance-none bg-white/30 accent-white min-h-[48px] touch-none"
          aria-label="Zoom"
        />
      </div>
    </div>
  );
}
