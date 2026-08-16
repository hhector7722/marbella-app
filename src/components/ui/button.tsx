'use client';

import type { MouseEventHandler, ReactNode } from 'react';
import {
    BUTTON_COMPONENT_ID,
    hasVisibleButtonLabel,
    pickButtonLayoutClassName,
    resolveButtonAccessibleName,
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
 * Anatomía: icon? (izquierda) + label?
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
    const naming = resolveButtonAccessibleName({
        hasLabel,
        hasIcon,
        ariaLabel,
    });

    if (!naming.ok && process.env.NODE_ENV !== 'production') {
        const hint =
            naming.reason === 'icon-only-requires-aria-label'
                ? 'Button icon-only exige aria-label.'
                : 'Button sin etiqueta exige aria-label.';
        console.error(`[Button] ${hint} instance="${instance}"`);
    }

    const iconOnly = naming.ok ? naming.iconOnly : !hasLabel && hasIcon;
    const busy = Boolean(loading);
    const isDisabled = disabled || busy;
    const label = busy && loadingLabel ? loadingLabel : children;
    const showSpinner = busy;
    const showIcon = hasIcon && !showSpinner;
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
                    {icon}
                </span>
            ) : null}
            {hasVisibleButtonLabel(label) ? <span data-element="label">{label}</span> : null}
        </button>
    );
}
