'use client';

import type { MouseEventHandler, ReactNode } from 'react';
import {
    BUTTON_COMPONENT_ID,
    assertButtonAnatomy,
    hasVisibleButtonLabel,
    pickButtonLayoutClassName,
    type ButtonLayout,
    type ButtonVariant,
} from '@/lib/design-system';

export type { ButtonLayout, ButtonVariant };

export type ButtonProps = {
    variant: ButtonVariant;
    instance: string;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
    loadingLabel?: string;
    icon?: ReactNode;
    layout?: ButtonLayout;
    'aria-label'?: string;
    onClick?: MouseEventHandler<HTMLButtonElement>;
    children?: ReactNode;
    /**
     * Solo composición externa (flex-1, shrink-0, self-*, posicionamiento).
     * Altura, radio, color, tipo y estados se ignoran.
     */
    className?: string;
    name?: string;
    form?: string;
};

/**
 * Botón de sistema. Un único `<button>`.
 *
 * Anatomía: texto XOR icono. Un Button con texto visible no lleva `icon`.
 * Un Button icon-only no lleva texto y exige `aria-label`.
 * Combinaciones inválidas: fallan en desarrollo/test; en producción el
 * render aplica fallback seguro (prioriza texto; vacío no pinta icono huérfano).
 * Identidad: data-component / data-variant / data-instance
 */
export function Button({
    variant,
    instance,
    type = 'button',
    disabled = false,
    loading = false,
    loadingLabel,
    icon,
    layout = 'hug',
    'aria-label': ariaLabel,
    onClick,
    children,
    className,
    name,
    form,
}: ButtonProps) {
    const hasLabel = hasVisibleButtonLabel(children);
    const hasIcon = icon != null && icon !== false;
    const naming = assertButtonAnatomy({
        hasLabel,
        hasIcon,
        ariaLabel,
        instance,
    });

    // Producción: fallback seguro si la anatomía es inválida (dev/test ya lanzó).
    let renderLabel: ReactNode = children;
    let renderIcon: ReactNode = hasIcon ? icon : null;
    let iconOnly = false;

    if (naming.ok) {
        iconOnly = naming.iconOnly;
    } else if (naming.reason === 'label-and-icon-forbidden') {
        renderIcon = null;
        iconOnly = false;
    } else if (naming.reason === 'icon-only-requires-aria-label') {
        // Mismo aspecto que antes; sin nombre accesible (solo prod).
        iconOnly = true;
        renderIcon = hasIcon ? icon : null;
    } else {
        return null;
    }

    const busy = Boolean(loading);
    const isDisabled = disabled || busy;
    const label = busy && loadingLabel ? loadingLabel : renderLabel;
    const showSpinner = busy;
    const showIcon = renderIcon != null && !showSpinner;
    const layoutClassName = pickButtonLayoutClassName(className);

    return (
        <button
            type={type}
            name={name}
            form={form}
            disabled={isDisabled}
            aria-busy={busy || undefined}
            aria-label={ariaLabel}
            onClick={isDisabled ? undefined : onClick}
            data-component={BUTTON_COMPONENT_ID}
            data-variant={variant}
            data-instance={instance}
            data-layout={layout}
            data-icon-only={iconOnly ? 'true' : undefined}
            className={layoutClassName || undefined}
        >
            {showSpinner ? <span data-element="spinner" aria-hidden /> : null}
            {showIcon ? (
                <span data-element="icon" aria-hidden>
                    {renderIcon}
                </span>
            ) : null}
            {hasVisibleButtonLabel(label) ? <span data-element="label">{label}</span> : null}
        </button>
    );
}
