'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { X, Camera, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CLOSING_WEATHER_OPTIONS,
  type ClosingWeatherId,
} from '@/lib/cash-closing-weather';

export type ClosingPhotoModalKind = 'bdp-ticket' | 'dataphone';

const PHOTO_MODAL_COPY: Record<
  ClosingPhotoModalKind,
  { title: string; help: string }
> = {
  'bdp-ticket': {
    title: 'Informe TPV',
    help: 'Añade imagen del informe obtenido de la tpv. Si hay más de uno, juntalos de manera que se vean todos en la misma imagen.',
  },
  dataphone: {
    title: 'Totales datáfono',
    help: 'Añade imagen de los totales obtenidos del datáfono. Si hay más de uno, juntalos de manera que se vean todos en la misma imagen.',
  },
};

export function ClosingStepRow({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[48px] items-center gap-3">
      <span className="w-[5.5rem] shrink-0 text-[10px] font-black uppercase leading-tight text-[#36606F] sm:w-28 sm:text-xs">
        {title}
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {children}
      </div>
    </div>
  );
}

export function ClosingPetrolInput({
  value,
  onChange,
  step,
  className,
  inputClassName,
}: {
  value: number;
  onChange: (next: number) => void;
  step?: string;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <input
      type="number"
      step={step ?? '0.01'}
      className={cn(
        'h-12 min-w-0 flex-1 max-w-[10rem] rounded-xl border-2 border-[#36606F] bg-white px-3 text-right text-sm font-black tabular-nums text-zinc-800 outline-none transition-colors focus:bg-[#36606F]/5 sm:max-w-[12rem]',
        className,
        inputClassName,
      )}
      value={value || ''}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
    />
  );
}

export function ClosingPetrolInputWithAdjust({
  value,
  onChange,
  onAdjust,
  parseValue,
}: {
  value: number;
  onChange: (next: number) => void;
  onAdjust: (delta: number) => void;
  parseValue?: (raw: string) => number;
}) {
  const parse = parseValue ?? ((raw: string) => parseInt(raw, 10) || 0);

  return (
    <div className="flex h-12 min-w-0 max-w-[14rem] flex-1 items-center justify-between overflow-hidden rounded-xl border-2 border-[#36606F] bg-white">
      <button
        type="button"
        onClick={() => onAdjust(-1)}
        className="flex h-full w-10 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100"
      >
        <Minus size={16} strokeWidth={3} />
      </button>
      <input
        type="number"
        className="h-full w-0 flex-1 bg-transparent p-0 text-center text-sm font-black tabular-nums text-zinc-800 outline-none"
        value={value || ''}
        onChange={(e) => onChange(parse(e.target.value))}
      />
      <button
        type="button"
        onClick={() => onAdjust(1)}
        className="flex h-full w-10 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100"
      >
        <Plus size={16} strokeWidth={3} />
      </button>
    </div>
  );
}

export function ClosingWeatherPicker({
  selectedId,
  onSelect,
}: {
  selectedId: ClosingWeatherId | null;
  onSelect: (id: ClosingWeatherId) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 justify-end overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex items-center gap-2">
        {CLOSING_WEATHER_OPTIONS.map((option) => {
          const selected = selectedId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              aria-label={option.label}
              aria-pressed={selected}
              className={cn(
                'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all active:scale-95 min-h-[48px] min-w-[48px]',
                selected
                  ? 'ring-2 ring-[#36606F] ring-offset-2'
                  : 'shadow-md shadow-zinc-300/60 hover:shadow-lg',
              )}
            >
              <Image
                src={option.icon}
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ClosingPhotoAttach({
  buttonLabel,
  previewUrl,
  onOpenModal,
  onClear,
  ariaLabel,
}: {
  buttonLabel: string;
  previewUrl: string | null;
  onOpenModal: () => void;
  onClear: () => void;
  ariaLabel: string;
}) {
  if (previewUrl) {
    return (
      <div className="relative h-12 w-12 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={ariaLabel}
          className="h-12 w-12 rounded-xl object-cover"
        />
        <button
          type="button"
          onClick={onClear}
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 min-h-[20px] min-w-[20px] items-center justify-center rounded-full bg-rose-500 text-white shadow-sm transition-all hover:bg-rose-600 active:scale-95"
          aria-label={`Eliminar ${ariaLabel}`}
        >
          <X size={12} strokeWidth={3} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenModal}
      className="shrink-0 rounded-xl bg-emerald-500 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm transition-all hover:bg-emerald-600 active:scale-95 min-h-[48px]"
    >
      {buttonLabel}
    </button>
  );
}

export function ClosingPhotoCaptureModal({
  kind,
  onClose,
  onConfirm,
}: {
  kind: ClosingPhotoModalKind;
  onClose: () => void;
  onConfirm: (file: File) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const copy = PHOTO_MODAL_COPY[kind];

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setPendingFile(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const handleClose = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    onClose();
  };

  const handleConfirm = () => {
    if (!pendingFile) return;
    onConfirm(pendingFile);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    onClose();
  };

  return (
    <div data-marbella-modal-root
      className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-sm font-black uppercase tracking-wide text-[#36606F]">
            {copy.title}
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-100 min-h-[48px] min-w-[48px]"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={3} />
          </button>
        </div>

        <p className="mb-4 text-xs font-medium leading-relaxed text-zinc-600">
          {copy.help}
        </p>

        {previewUrl ? (
          <div className="mb-4 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Vista previa"
              className="max-h-48 w-full rounded-xl object-contain"
            />
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {!previewUrl ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mb-3 flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-black uppercase tracking-wide text-white shadow-sm transition-all hover:bg-emerald-600 active:scale-[0.98]"
          >
            <Camera size={20} />
            Abrir cámara
          </button>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mb-3 flex w-full min-h-[48px] items-center justify-center rounded-xl border-2 border-[#36606F] text-xs font-black uppercase tracking-wide text-[#36606F] transition-all hover:bg-[#36606F]/5 active:scale-[0.98]"
          >
            Cambiar imagen
          </button>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 min-h-[48px] rounded-xl font-black text-xs uppercase tracking-widest text-zinc-400 transition-colors hover:bg-zinc-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!pendingFile}
            className="flex-1 min-h-[48px] rounded-xl bg-emerald-500 font-black text-xs uppercase tracking-widest text-white shadow-sm transition-all hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-40"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
