'use client';

import type { MouseEventHandler, ReactNode } from 'react';
import { DOCUMENT_LIST_ROW_COMPONENT_ID } from '@/lib/design-system';

export type DocumentListRowProps = {
    /**
     * Identidad estable de negocio (p. ej. `nominas-row-${id}`).
     * Independiente del título visible. Obligatoria.
     */
    instance: string;
    /** Línea principal (periodo, nombre de documento…). */
    title: ReactNode;
    /** Metadato secundario opcional (nombre de archivo…). */
    subtitle?: ReactNode;
    /** Abre el documento. Semántica de acción, no de navegación. */
    onOpen: MouseEventHandler<HTMLButtonElement> | (() => void);
    /**
     * Acciones secundarias de la fila (compartir, eliminar…).
     * El componente no conoce iconos ni lógica de negocio.
     */
    trailing?: ReactNode;
    disabled?: boolean;
    /** Nombre accesible del control de apertura si el título no basta. */
    'aria-label'?: string;
};

/**
 * Fila canónica de documento en listas de perfil.
 *
 * Anatomía:
 *   host (`<li>`)
 *   ├── open (`<button>` — abrir documento)
 *   │   └── body
 *   │       ├── title
 *   │       └── subtitle? 
 *   └── trailing? (slot)
 *
 * Identidad: data-component / data-instance / data-element.
 * No es Button. No es ListRow genérico.
 */
export function DocumentListRow({
    instance,
    title,
    subtitle,
    onOpen,
    trailing,
    disabled = false,
    'aria-label': ariaLabel,
}: DocumentListRowProps) {
    const hasSubtitle = subtitle != null && subtitle !== false && subtitle !== '';

    return (
        <li
            data-component={DOCUMENT_LIST_ROW_COMPONENT_ID}
            data-instance={instance}
        >
            <button
                type="button"
                data-element="open"
                disabled={disabled}
                aria-label={ariaLabel}
                onClick={onOpen}
            >
                <span data-element="body">
                    <span data-element="title">{title}</span>
                    {hasSubtitle ? <span data-element="subtitle">{subtitle}</span> : null}
                </span>
            </button>
            {trailing != null ? (
                <div data-element="trailing" className="shrink-0">
                    {trailing}
                </div>
            ) : null}
        </li>
    );
}
