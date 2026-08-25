import type { ReactNode } from 'react';
import { EMPTY_STATE_COMPONENT_ID, type EmptyStateVariant } from '@/lib/design-system';

export type EmptyStateProps = {
    instance: string;
    variant: EmptyStateVariant;
    title: string;
    description?: string;
    action?: ReactNode;
};

/**
 * Estado vacío distinguible: nada todavía / nada que coincida / no se pudo cargar.
 */
export function EmptyState({ instance, variant, title, description, action }: EmptyStateProps) {
    return (
        <div
            data-component={EMPTY_STATE_COMPONENT_ID}
            data-variant={variant}
            data-instance={instance}
            role={variant === 'error' ? 'alert' : 'status'}
        >
            <p data-element="title">{title}</p>
            {description ? <p data-element="description">{description}</p> : null}
            {action ? <div data-element="action">{action}</div> : null}
        </div>
    );
}
