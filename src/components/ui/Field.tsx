import type { ReactNode } from 'react';
import { FIELD_COMPONENT_ID } from '@/lib/design-system';

export type FieldProps = {
    instance: string;
    label: string;
    htmlFor?: string;
    error?: string;
    hint?: string;
    children: ReactNode;
};

/**
 * Campo de formulario: etiqueta + control + error/ayuda.
 * El aspecto del control lo fija CSS. El consumidor pasa el input/select.
 */
export function Field({ instance, label, htmlFor, error, hint, children }: FieldProps) {
    return (
        <div
            data-component={FIELD_COMPONENT_ID}
            data-instance={instance}
            data-invalid={error ? 'true' : undefined}
        >
            <label data-element="label" htmlFor={htmlFor}>
                {label}
            </label>
            <div data-element="control">{children}</div>
            {error ? (
                <p data-element="error">{error}</p>
            ) : hint ? (
                <p data-element="hint">{hint}</p>
            ) : null}
        </div>
    );
}
