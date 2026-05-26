'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { X, Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CLOSING_WEATHER_OPTIONS,
  type ClosingWeatherId,
} from '@/lib/cash-closing-weather';

/** Ancho fijo de cajas numéricas */
export const CLOSING_FIELD_COL =
  'w-[8.75rem] sm:w-[9.5rem]';

const CLOSING_INPUT_HEIGHT = 'h-9';

const CLOSING_ROW_TITLE =
  'text-[10px] font-black uppercase leading-tight text-[#36606F] sm:text-xs';

function formatMoneyAmount(value: number): string {
  if (Math.abs(value) < 0.005) return ' ';
  return value.toFixed(2);
}

export function ClosingStepRow({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-[40px] grid-cols-[4.5rem_1fr] items-center gap-x-2 sm:grid-cols-[5.25rem_1fr] sm:gap-x-3">
      <span className={CLOSING_ROW_TITLE}>{title}</span>
      <div className="flex min-w-0 items-center justify-center">
        <div className={CLOSING_FIELD_COL}>{children}</div>
      </div>
    </div>
  );
}

/** Paso 3: título flotante a la izquierda; valor centrado en todo el ancho del modal */
export function ClosingSummaryRow({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-[40px] w-full">
      <span
        className={cn(
          CLOSING_ROW_TITLE,
          'absolute left-0 top-1/2 z-[1] max-w-[5.25rem] -translate-y-1/2 leading-tight',
        )}
      >
        {title}
      </span>
      <div className="flex w-full items-center justify-center">
        <div className={CLOSING_FIELD_COL}>{children}</div>
      </div>
    </div>
  );
}

export function ClosingReadonlyValue({
  value,
  showEuro = false,
  variant = 'money',
  valueClassName,
}: {
  value: number;
  showEuro?: boolean;
  variant?: 'money' | 'difference';
  valueClassName?: string;
}) {
  const hasValue = Math.abs(value) >= 0.005;
  let text = ' ';
  if (variant === 'difference' && hasValue) {
    text = `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
  } else if (variant === 'money' && hasValue) {
    text = formatMoneyAmount(value);
  }

  const showEuroSuffix =
    hasValue && (variant === 'difference' || (showEuro && variant === 'money'));

  const differenceTone =
    variant === 'difference' && hasValue
      ? value > 0
        ? 'text-emerald-500'
        : 'text-rose-500'
      : null;

  return (
    <div
      className={cn(
        CLOSING_INPUT_HEIGHT,
        'relative flex w-full items-center justify-center px-2',
      )}
    >
      <span
        className={cn(
          'w-full text-center text-sm font-black tabular-nums',
          differenceTone ?? 'text-zinc-800',
          valueClassName,
        )}
      >
        {text}
      </span>
      {showEuroSuffix ? (
        <span
          className={cn(
            'pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm font-black',
            differenceTone ?? 'text-zinc-600',
          )}
        >
          €
        </span>
      ) : null}
    </div>
  );
}

export function ClosingPetrolInput({
  value,
  onChange,
  step,
  showEuro = false,
  className,
  inputClassName,
}: {
  value: number;
  onChange: (next: number) => void;
  step?: string;
  /** Muestra «€» a la derecha del valor cuando hay cantidad (ventas, tarjeta, cobros, pendiente) */
  showEuro?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  const hasValue = value !== 0 && !Number.isNaN(value);

  return (
    <div
      className={cn(
        CLOSING_INPUT_HEIGHT,
        'relative w-full rounded-xl border-2 border-[#36606F] bg-white transition-colors focus-within:bg-[#36606F]/5',
        className,
      )}
    >
      <input
        type="number"
        step={step ?? '0.01'}
        className={cn(
          'h-full w-full bg-transparent px-2 text-center text-sm font-black tabular-nums text-zinc-800 outline-none',
          inputClassName,
        )}
        value={value || ''}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
      {showEuro && hasValue ? (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm font-black text-zinc-600">
          €
        </span>
      ) : null}
    </div>
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
        CLOSING_INPUT_HEIGHT,
        'flex w-full items-center justify-between overflow-hidden rounded-xl border-2 border-[#36606F] bg-white',
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
    <div className="flex w-full items-center justify-between gap-0 px-0">
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
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-0 transition-transform active:scale-95 sm:h-11 sm:w-11',
              selected && 'ring-2 ring-[#36606F] ring-offset-1',
            )}
          >
            <Image
              src={option.icon}
              alt=""
              width={36}
              height={36}
              className="h-8 w-8 object-contain sm:h-9 sm:w-9"
            />
          </button>
        );
      })}
    </div>
  );
}

/** Caja estilo petróleo: «Añadir» abre cámara; con foto, miniatura y borrar */
export function ClosingPhotoField({
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
      <div
        className={cn(
          CLOSING_INPUT_HEIGHT,
          'relative w-full overflow-hidden rounded-xl border-2 border-[#36606F] bg-white',
        )}
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-full w-full items-center justify-center transition-colors hover:bg-[#36606F]/5 active:bg-[#36606F]/10"
          aria-label={ariaLabel}
        >
          {previewUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={previewUrl}
              alt={ariaLabel}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-sm font-black text-[#36606F]">Añadir</span>
          )}
        </button>
        {previewUrl ? (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-rose-500 text-white transition-all hover:bg-rose-600 active:scale-95"
            aria-label={`Eliminar ${ariaLabel}`}
          >
            <X size={10} strokeWidth={3} />
          </button>
        ) : null}
      </div>
    </>
  );
}
