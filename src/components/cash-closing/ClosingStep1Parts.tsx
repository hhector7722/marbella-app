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

/** Mitad del ancho de caja + separación hasta el botón foto (el «+» no entra en el centrado) */
const CLOSING_PHOTO_OFFSET =
  'left-[calc(50%+4.375rem+0.25rem)] sm:left-[calc(50%+4.75rem+0.25rem)]';

export function ClosingStepRow({
  title,
  children,
  trailing,
}: {
  title: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-[40px] grid-cols-[4.5rem_1fr] items-center gap-x-2 sm:grid-cols-[5.25rem_1fr] sm:gap-x-3">
      <span className={CLOSING_ROW_TITLE}>{title}</span>
      <div className="relative flex min-w-0 items-center justify-center">
        <div className={CLOSING_FIELD_COL}>{children}</div>
        {trailing ? (
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2 shrink-0',
              CLOSING_PHOTO_OFFSET,
            )}
          >
            {trailing}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Paso 3: misma fila que paso 1, valor centrado y solo lectura */
export function ClosingSummaryRow({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-[40px] grid-cols-[4.5rem_1fr] items-center gap-x-2 sm:grid-cols-[5.25rem_1fr] sm:gap-x-3">
      <span className={CLOSING_ROW_TITLE}>{title}</span>
      <div className="flex min-w-0 justify-center">
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

  return (
    <div
      className={cn(
        CLOSING_INPUT_HEIGHT,
        'flex w-full items-center justify-center px-2',
      )}
    >
      <div className="inline-flex max-w-full items-center justify-center gap-0.5">
        <span
          className={cn(
            'text-center text-sm font-black tabular-nums',
            variant === 'difference' && hasValue
              ? value > 0
                ? 'text-emerald-500'
                : 'text-rose-500'
              : 'text-zinc-800',
            valueClassName,
          )}
        >
          {text}
        </span>
        {showEuro && hasValue && variant === 'money' ? (
          <span className="shrink-0 text-sm font-black text-zinc-600">€</span>
        ) : null}
        {variant === 'difference' && hasValue ? (
          <span className="shrink-0 text-sm font-black text-zinc-600">€</span>
        ) : null}
      </div>
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
        'flex w-full items-center justify-center rounded-xl border-2 border-[#36606F] bg-white px-2 transition-colors focus-within:bg-[#36606F]/5',
        className,
      )}
    >
      <div className="inline-flex max-w-full items-center justify-center gap-0.5">
        <input
          type="number"
          step={step ?? '0.01'}
          className={cn(
            'min-w-[2.5ch] max-w-full bg-transparent text-center text-sm font-black tabular-nums text-zinc-800 outline-none',
            inputClassName,
          )}
          value={value || ''}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
        {showEuro && hasValue ? (
          <span className="shrink-0 text-sm font-black text-zinc-600">€</span>
        ) : null}
      </div>
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
      <div className="relative h-6 w-6 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={ariaLabel}
          className="h-6 w-6 rounded-md object-cover"
        />
        <button
          type="button"
          onClick={onClear}
          className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-white transition-all hover:bg-rose-600 active:scale-95"
          aria-label={`Eliminar ${ariaLabel}`}
        >
          <X size={8} strokeWidth={3} />
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
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition-all hover:bg-emerald-600 active:scale-95"
        aria-label={ariaLabel}
      >
        <Plus size={12} strokeWidth={3} />
      </button>
    </>
  );
}
