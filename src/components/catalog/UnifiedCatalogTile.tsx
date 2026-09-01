'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type CatalogNameTone = 'default' | 'invertido';

export function CatalogSquare({
  imageSrc,
  imageAlt = '',
  fallback,
  price,
  priceLocked = false,
  priceClassName,
  className,
}: {
  imageSrc?: string | null;
  imageAlt?: string;
  fallback?: ReactNode;
  price?: number | null;
  priceLocked?: boolean;
  priceClassName?: string;
  className?: string;
}) {
  const hasPrice = price != null && Number.isFinite(price);

  return (
    <div
      data-element="square"
      className={cn(
        'relative aspect-square w-full min-w-0 overflow-hidden rounded-2xl border border-zinc-100 shadow-sm',
        className,
      )}
    >
      <div data-element="square-fill" className="pointer-events-none absolute inset-0" aria-hidden />
      <div
        className={cn(
          'relative z-[1] flex h-full w-full items-center justify-center overflow-hidden px-2 pt-2 sm:px-3 sm:pt-3',
          hasPrice ? 'pb-6 sm:pb-7' : 'pb-2 sm:pb-3',
        )}
      >
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={imageAlt}
            className="max-h-full max-w-full object-contain"
          />
        ) : fallback ? (
          <span className="text-gray-200">{fallback}</span>
        ) : null}
      </div>

      {hasPrice ? (
        <div
          data-element="price"
          className="absolute inset-x-0 bottom-1.5 z-[1] flex items-center justify-center gap-1 px-1 sm:bottom-2"
        >
          <span
            className={cn(
              'text-[10px] font-black tabular-nums text-gray-700 sm:text-xs',
              priceClassName,
            )}
          >
            {price.toFixed(2)}€
          </span>
          {priceLocked ? (
            <span className="shrink-0 rounded bg-zinc-200 px-1 text-[8px] font-black uppercase text-zinc-600 sm:text-[9px]">
              Fijo
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CatalogTileUnificado({
  title,
  imageSrc,
  imageAlt = '',
  fallback,
  subtitle,
  price,
  priceLocked = false,
  priceClassName,
  nameTone = 'default',
  onClick,
}: {
  title: string;
  imageSrc?: string | null;
  imageAlt?: string;
  fallback?: ReactNode;
  subtitle?: ReactNode;
  price?: number | null;
  priceLocked?: boolean;
  priceClassName?: string;
  nameTone?: CatalogNameTone;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      data-catalog-tile
      className="w-full min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left shadow-none"
    >
      <div className="flex w-full min-w-0 flex-col gap-2">
        <CatalogSquare
          imageSrc={imageSrc}
          imageAlt={imageAlt}
          fallback={fallback}
          price={price}
          priceLocked={priceLocked}
          priceClassName={priceClassName}
        />

        <div
          data-element="name-slot"
          className="flex h-[2.5rem] w-full shrink-0 items-start justify-center overflow-hidden sm:h-[2.75rem]"
        >
          <span
            data-element="name"
            className={cn(
              'line-clamp-2 min-w-0 text-center text-[11px] font-bold leading-snug sm:text-xs md:text-sm',
              nameTone === 'invertido' ? 'text-ds-texto-invertido' : 'text-gray-700',
            )}
          >
            {title}
          </span>
        </div>

        {subtitle ? (
          <div className="flex h-5 w-full shrink-0 items-center justify-center overflow-hidden sm:h-6">
            {subtitle}
          </div>
        ) : null}
      </div>
    </button>
  );
}
