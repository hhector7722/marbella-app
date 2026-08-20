'use client';

import {
    useId,
    useRef,
    type KeyboardEvent,
    type ReactNode,
} from 'react';
import {
    PETROLEUM_SEGMENTED_COMPONENT_ID,
    type PetroleumSegmentedDensity,
} from '@/lib/design-system';

export type PetroleumSegmentedOption = {
    value: string;
    label: ReactNode;
};

export type PetroleumSegmentedProps = {
    /** Identidad estable de negocio (p. ej. `waste-mode`). */
    instance: string;
    /** Densidad contractual. Obligatoria: no hay default implícito. */
    density: PetroleumSegmentedDensity;
    /** Valor seleccionado (exclusivo). */
    value: string;
    /** Cambia la selección. La navegación (si aplica) la resuelve el consumidor. */
    onChange: (value: string) => void;
    options: PetroleumSegmentedOption[];
    /** Nombre del grupo para lectores de pantalla. */
    'aria-label': string;
};

/**
 * Segmented de borde petróleo.
 *
 * Anatomía:
 *   host (radiogroup)
 *   └── option* (radio button)
 *
 * No es Button (permite label compuesto). No es Tab. No es Chip.
 * Semántica: selección exclusiva; el consumidor decide si eso muta estado local o navega.
 */
export function PetroleumSegmented({
    instance,
    density,
    value,
    onChange,
    options,
    'aria-label': ariaLabel,
}: PetroleumSegmentedProps) {
    const baseId = useId();
    const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const focusOption = (index: number) => {
        const el = optionRefs.current[index];
        el?.focus();
    };

    const selectIndex = (index: number) => {
        const opt = options[index];
        if (!opt) return;
        onChange(opt.value);
        focusOption(index);
    };

    const onOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (options.length === 0) return;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            event.preventDefault();
            selectIndex((index + 1) % options.length);
            return;
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            event.preventDefault();
            selectIndex((index - 1 + options.length) % options.length);
            return;
        }
        if (event.key === 'Home') {
            event.preventDefault();
            selectIndex(0);
            return;
        }
        if (event.key === 'End') {
            event.preventDefault();
            selectIndex(options.length - 1);
        }
    };

    return (
        <div
            data-component={PETROLEUM_SEGMENTED_COMPONENT_ID}
            data-instance={instance}
            data-density={density}
            role="radiogroup"
            aria-label={ariaLabel}
        >
            {options.map((option, index) => {
                const selected = option.value === value;
                const hasMatch = options.some((o) => o.value === value);
                return (
                    <button
                        key={option.value}
                        ref={(node) => {
                            optionRefs.current[index] = node;
                        }}
                        id={`${baseId}-${option.value}`}
                        type="button"
                        role="radio"
                        data-element="option"
                        aria-checked={selected}
                        tabIndex={selected || (!hasMatch && index === 0) ? 0 : -1}
                        onClick={() => onChange(option.value)}
                        onKeyDown={(e) => onOptionKeyDown(e, index)}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
