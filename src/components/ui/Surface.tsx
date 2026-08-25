import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
    SURFACE_COMPONENT_ID,
    pickSurfaceLayoutClassName,
    type SurfaceVariant,
} from '@/lib/design-system';

export type SurfaceProps = {
    variant: SurfaceVariant;
    instance: string;
    children: ReactNode;
    /** Solo composición / layout. Color, radio y sombra los fija CSS. */
    className?: string;
};

/**
 * Superficie de trabajo. page = sobre el envolvente; block = agrupación interior.
 */
export function Surface({ variant, instance, children, className }: SurfaceProps) {
    return (
        <div
            data-component={SURFACE_COMPONENT_ID}
            data-variant={variant}
            data-instance={instance}
            className={cn(pickSurfaceLayoutClassName(className))}
        >
            {children}
        </div>
    );
}
