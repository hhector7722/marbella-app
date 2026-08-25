'use client';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/Notice';
import type { PropertyDef, PropertyValues, TokenOption } from '@/lib/design-system/visual-studio/types';
import { findOption } from '@/lib/design-system/visual-studio/allowed-values';
import { humanColorName, humanOptionLabel, pxLabel } from '@/lib/design-system/visual-studio/ux-copy';
import type { ReactNode } from 'react';

function Chip({
    selected,
    disabled,
    onClick,
    children,
    ariaLabel,
}: {
    selected: boolean;
    disabled: boolean;
    onClick: () => void;
    children: ReactNode;
    ariaLabel?: string;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            aria-label={ariaLabel}
            onClick={onClick}
            className={`inline-flex min-h-ds-tactil min-w-ds-8 shrink-0 items-center justify-center px-ds-3 border text-[14px] font-bold ${
                selected
                    ? 'border-ds-marca bg-ds-marca text-ds-texto-invertido'
                    : 'border-ds-borde-marcado bg-ds-superficie text-ds-texto-fuerte'
            } disabled:opacity-50`}
        >
            {children}
        </button>
    );
}

function OptionNotes({ option }: { option?: TokenOption }) {
    if (!option) return null;
    return (
        <>
            {option.note && !option.note.includes('TOKENS.md') ? (
                <p className="m-0 text-[12px] text-ds-texto-tenue">{option.note.replace(/\b[a-z]+\.[a-z.]+/g, '').replace(/\s{2,}/g, ' ').trim()}</p>
            ) : null}
            {option.requiresNewToken ? (
                <Notice instance={`ds-opt-new-${option.id}`} variant="warning" title="Aún no existe">
                    Este valor no forma parte del sistema. Puedes probarlo en una propuesta, no hacerlo oficial.
                </Notice>
            ) : null}
            {option.blocksCanon && !option.requiresNewToken ? (
                <Notice instance={`ds-opt-block-${option.id}`} variant="warning" title="No puede ser oficial">
                    {option.note ?? 'Incumple una regla ya cerrada.'}
                </Notice>
            ) : null}
        </>
    );
}

function ChipRow({
    options,
    value,
    disabled,
    onChange,
}: {
    options: TokenOption[];
    value: string;
    disabled: boolean;
    onChange: (next: string) => void;
}) {
    return (
        <div className="flex flex-wrap gap-ds-2">
            {options.map((option) => (
                <Chip
                    key={option.id}
                    selected={option.id === value}
                    disabled={disabled}
                    onClick={() => onChange(option.id)}
                >
                    {humanOptionLabel(option)}
                </Chip>
            ))}
        </div>
    );
}

function AlignmentX({
    options,
    value,
    disabled,
    onChange,
}: {
    options: TokenOption[];
    value: string;
    disabled: boolean;
    onChange: (next: string) => void;
}) {
    const labels: Record<string, string> = {
        left: '← Izquierda',
        center: '↔ Centro',
        edges: '→ Extremos',
    };
    return (
        <div className="grid grid-cols-1 gap-ds-2">
            {options.map((option) => (
                <Chip
                    key={option.id}
                    selected={option.id === value}
                    disabled={disabled}
                    onClick={() => onChange(option.id)}
                    ariaLabel={humanOptionLabel(option)}
                >
                    {labels[option.id] ?? humanOptionLabel(option)}
                </Chip>
            ))}
        </div>
    );
}

function AlignmentY({
    options,
    value,
    disabled,
    onChange,
}: {
    options: TokenOption[];
    value: string;
    disabled: boolean;
    onChange: (next: string) => void;
}) {
    const labels: Record<string, string> = {
        top: '↑ Arriba',
        center: '↕ Centro',
        bottom: '↓ Abajo',
    };
    return (
        <div className="grid grid-cols-3 gap-ds-2">
            {options.map((option) => (
                <Chip
                    key={option.id}
                    selected={option.id === value}
                    disabled={disabled}
                    onClick={() => onChange(option.id)}
                    ariaLabel={humanOptionLabel(option)}
                >
                    {labels[option.id] ?? humanOptionLabel(option)}
                </Chip>
            ))}
        </div>
    );
}

function RadiusRow({
    options,
    value,
    disabled,
    onChange,
}: {
    options: TokenOption[];
    value: string;
    disabled: boolean;
    onChange: (next: string) => void;
}) {
    return (
        <div className="flex flex-wrap gap-ds-2">
            {options.map((option) => (
                <button
                    key={option.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={option.id === value}
                    onClick={() => onChange(option.id)}
                    className={`flex min-h-ds-tactil min-w-ds-8 shrink-0 flex-col items-center justify-center gap-ds-1 px-ds-3 border ${
                        option.id === value
                            ? 'border-ds-marca bg-ds-marca/10'
                            : 'border-ds-borde-marcado bg-ds-superficie'
                    } disabled:opacity-50`}
                >
                    <span
                        className="block h-ds-4 w-ds-8 bg-ds-marca"
                        style={{ borderRadius: option.value }}
                    />
                    <span className="text-[12px] font-bold">{humanOptionLabel(option)}</span>
                </button>
            ))}
        </div>
    );
}

function ColorRow({
    options,
    value,
    disabled,
    onChange,
}: {
    options: TokenOption[];
    value: string;
    disabled: boolean;
    onChange: (next: string) => void;
}) {
    return (
        <div className="grid grid-cols-3 gap-ds-2">
            {options.map((option) => (
                <button
                    key={option.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={option.id === value}
                    onClick={() => onChange(option.id)}
                    className={`flex min-h-ds-tactil shrink-0 flex-col items-stretch gap-ds-1 border p-ds-2 ${
                        option.id === value ? 'border-ds-marca' : 'border-ds-borde'
                    } disabled:opacity-50`}
                >
                    <span
                        className="block h-ds-8 w-full border border-ds-borde"
                        style={{ background: option.value }}
                    />
                    <span className="text-[12px] font-bold text-ds-texto-fuerte truncate">
                        {humanColorName(option)}
                    </span>
                </button>
            ))}
        </div>
    );
}

function TypeRow({
    options,
    value,
    disabled,
    onChange,
}: {
    options: TokenOption[];
    value: string;
    disabled: boolean;
    onChange: (next: string) => void;
}) {
    return (
        <div className="grid grid-cols-1 gap-ds-2">
            {options.map((option) => (
                <button
                    key={option.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={option.id === value}
                    onClick={() => onChange(option.id)}
                    className={`flex min-h-ds-tactil items-center justify-between gap-ds-3 px-ds-4 border ${
                        option.id === value
                            ? 'border-ds-marca bg-ds-marca/10'
                            : 'border-ds-borde bg-ds-superficie'
                    } disabled:opacity-50`}
                >
                    <span className="font-black text-ds-texto-fuerte" style={{ fontSize: option.value }}>
                        Aa
                    </span>
                    <span className="text-[14px] font-bold text-ds-texto">{humanOptionLabel(option)}</span>
                </button>
            ))}
        </div>
    );
}

function SizeStepper({
    options,
    value,
    disabled,
    onChange,
}: {
    options: TokenOption[];
    value: string;
    disabled: boolean;
    onChange: (next: string) => void;
}) {
    const index = Math.max(0, options.findIndex((option) => option.id === value));
    const current = options[index] ?? options[0];
    return (
        <div className="flex items-center gap-ds-2">
            <Button
                variant="secondary"
                instance="ds-size-minus"
                aria-label="Reducir"
                disabled={disabled || index <= 0}
                onClick={() => {
                    const prev = options[index - 1];
                    if (prev) onChange(prev.id);
                }}
            >
                −
            </Button>
            <p className="m-0 flex-1 text-center text-[18px] font-black tabular-nums">
                {current ? humanOptionLabel(current) : '—'}
            </p>
            <Button
                variant="secondary"
                instance="ds-size-plus"
                aria-label="Aumentar"
                disabled={disabled || index >= options.length - 1}
                onClick={() => {
                    const next = options[index + 1];
                    if (next) onChange(next.id);
                }}
            >
                +
            </Button>
        </div>
    );
}

function looksLikeColor(options: TokenOption[]): boolean {
    return options.every((option) => option.value.startsWith('#') || option.id.startsWith('color.'));
}

function looksLikeType(property: PropertyDef): boolean {
    return property.id === 'title-size' || property.id.includes('type') || property.id.includes('title');
}

function looksLikeRadius(property: PropertyDef): boolean {
    return property.id === 'radius';
}

function looksLikeSize(options: TokenOption[]): boolean {
    return options.filter((option) => pxLabel(option.value)).length >= options.length - 1;
}

export function VisualPropertyControl({
    property,
    values,
    disabled,
    onChange,
}: {
    property: PropertyDef;
    values: PropertyValues;
    disabled: boolean;
    onChange: (propertyId: string, next: string) => void;
}) {
    const current = values[property.id] ?? property.actualId;
    const chosen = findOption(property.options, current);
    const set = (next: string) => onChange(property.id, next);

    let control: ReactNode;
    if (property.kind === 'alignment-x') {
        control = (
            <AlignmentX options={property.options} value={current} disabled={disabled} onChange={set} />
        );
    } else if (property.kind === 'alignment-y') {
        control = (
            <AlignmentY options={property.options} value={current} disabled={disabled} onChange={set} />
        );
    } else if (looksLikeColor(property.options)) {
        control = <ColorRow options={property.options} value={current} disabled={disabled} onChange={set} />;
    } else if (looksLikeType(property)) {
        control = <TypeRow options={property.options} value={current} disabled={disabled} onChange={set} />;
    } else if (looksLikeRadius(property)) {
        control = <RadiusRow options={property.options} value={current} disabled={disabled} onChange={set} />;
    } else if (looksLikeSize(property.options) && property.options.length > 5) {
        control = <SizeStepper options={property.options} value={current} disabled={disabled} onChange={set} />;
    } else {
        control = <ChipRow options={property.options} value={current} disabled={disabled} onChange={set} />;
    }

    return (
        <div className="space-y-ds-2">
            <p className="m-0 text-[11px] font-black uppercase tracking-widest text-ds-texto-tenue">
                {property.label}
            </p>
            {control}
            <OptionNotes option={chosen} />
        </div>
    );
}

export function VisualPropertyList({
    properties,
    values,
    disabled,
    onChange,
}: {
    properties: PropertyDef[];
    values: PropertyValues;
    disabled: boolean;
    onChange: (propertyId: string, next: string) => void;
}) {
    if (properties.length === 0) return null;
    return (
        <div className="space-y-ds-6">
            {properties.map((property) => (
                <VisualPropertyControl
                    key={property.id}
                    property={property}
                    values={values}
                    disabled={disabled}
                    onChange={onChange}
                />
            ))}
        </div>
    );
}
