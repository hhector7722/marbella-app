'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { X, Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CLOSING_WEATHER_OPTIONS,
  type ClosingWeatherId,
} from '@/lib/cash-closing-weather';

/** Ancho fijo de columna de campos para alinear el borde izquierdo de todas las cajas */
export const CLOSING_FIELD_COL =
  'w-[8.75rem] sm:w-[9.5rem]';

const CLOSING_ROW_GRID =
  'grid grid-cols-[4.5rem_8.75rem_2.75rem] items-center gap-x-2 sm:grid-cols-[5.25rem_9.5rem_3rem] sm:gap-x-3';

export function ClosingStepRow({
  title,
  children,
  trailing,
  fullWidthField = false,
}: {
  title: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
  /** Fila sin caja numérica (p. ej. clima): el contenido ocupa el resto */
  fullWidthField?: boolean;
}) {
  if (fullWidthField) {
    return (
      <div className="grid min-h-[40px] grid-cols-[4.5rem_1fr] items-center gap-x-2 sm:grid-cols-[5.25rem_1fr] sm:gap-x-3">
        <span className="text-[10px] font-black uppercase leading-tight text-[#36606F] sm:text-xs">
          {title}
        </span>
        <div className="min-w-0">{children}</div>
      </div>
    );
  }

  return (
    <div className={cn(CLOSING_ROW_GRID, 'min-h-[48px]')}>
      <span className="text-[10px] font-black uppercase leading-tight text-[#36606F] sm:text-xs">
        {title}
      </span>
      <div className={cn('justify-self-start', CLOSING_FIELD_COL)}>{children}</div>
      <div className="justify-self-start">{trailing ?? null}</div>
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
        'h-12 w-full rounded-xl border-2 border-[#36606F] bg-white px-3 text-right text-sm font-black tabular-nums text-zinc-800 outline-none transition-colors focus:bg-[#36606F]/5',
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
    <div
      className={cn(
        'flex h-12 w-full items-center justify-between overflow-hidden rounded-xl border-2 border-[#36606F] bg-white',
      )}
    >
      <button
        type="button"
        onClick={() => onAdjust(-1)}
        className="flex h-full w-9 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100"
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
        className="flex h-full w-9 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100"
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
    <div className="flex w-full items-center justify-between gap-0.5">
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
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-0 transition-transform active:scale-95 sm:h-9 sm:w-9',
              selected && 'ring-2 ring-[#36606F] ring-offset-1',
            )}
          >
            <Image
              src={option.icon}
              alt=""
              width={28}
              height={28}
              className="h-6 w-6 object-contain sm:h-7 sm:w-7"
            />
          </button>
        );
      })}
    </div>
  );
}

export function ClosingPhotoAttach({
  previewUrl,
  onSelect,
  onClear,
  ariaLabel,
  inputId,
}: {
  previewUrl: string | null;
  onSelect: (file: File) => void;
  onClear: () => void;
  ariaLabel: string;
  inputId: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (previewUrl) {
    return (
      <div className="relative h-11 w-11 shrink-0 sm:h-12 sm:w-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={ariaLabel}
          className="h-11 w-11 rounded-xl object-cover sm:h-12 sm:w-12"
        />
        <button
          type="button"
          onClick={onClear}
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 min-h-[20px] min-w-[20px] items-center justify-center rounded-full bg-rose-500 text-white transition-all hover:bg-rose-600 active:scale-95"
          aria-label={`Eliminar ${ariaLabel}`}
        >
          <X size={12} strokeWidth={3} />
        </button>
      </div>
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition-all hover:bg-emerald-600 active:scale-95 min-h-[44px] min-w-[44px] sm:h-12 sm:w-12 sm:min-h-[48px] sm:min-w-[48px]"
        aria-label={ariaLabel}
      >
        <Plus size={22} strokeWidth={3} />
      </button>
    </>
  );
}
