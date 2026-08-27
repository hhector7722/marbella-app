'use client';

import { Search } from 'lucide-react';
import { SEARCH_FIELD_COMPONENT_ID } from '@/lib/design-system';

export type SearchFieldProps = {
    instance: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    ariaLabel?: string;
    autoFocus?: boolean;
};

/**
 * Buscador compacto. El aspecto lo fija CSS. No es Field.
 */
export function SearchField({
    instance,
    value,
    onChange,
    placeholder,
    ariaLabel,
    autoFocus,
}: SearchFieldProps) {
    return (
        <div data-component={SEARCH_FIELD_COMPONENT_ID} data-instance={instance}>
            <Search data-element="icon" size={16} strokeWidth={2.5} aria-hidden />
            <input
                type="search"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                aria-label={ariaLabel ?? placeholder ?? 'Buscar'}
                autoComplete="off"
                autoFocus={autoFocus}
            />
        </div>
    );
}
