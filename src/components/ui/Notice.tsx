import type { ReactNode } from 'react';
import { NOTICE_COMPONENT_ID, type NoticeVariant } from '@/lib/design-system';

export type NoticeProps = {
    instance: string;
    variant: NoticeVariant;
    title?: string;
    children: ReactNode;
};

/**
 * Aviso embebido. El toast flotante (sonner) no es esta pieza.
 */
export function Notice({ instance, variant, title, children }: NoticeProps) {
    return (
        <div
            data-component={NOTICE_COMPONENT_ID}
            data-variant={variant}
            data-instance={instance}
            role={variant === 'negative' || variant === 'critical' ? 'alert' : 'status'}
        >
            {title ? <p data-element="title">{title}</p> : null}
            <div data-element="body">{children}</div>
        </div>
    );
}
