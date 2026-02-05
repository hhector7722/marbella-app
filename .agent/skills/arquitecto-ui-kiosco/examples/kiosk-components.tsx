import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

/**
 * KIOSK BUTTON - Botón optimizado para interfaces táctiles
 * 
 * Características:
 * - Touch target mínimo de 56px (h-14)
 * - Feedback táctil con scale animation
 * - Variants para diferentes contextos
 * - Estados de carga integrados
 */

interface KioskButtonProps {
    variant: 'success' | 'danger' | 'primary' | 'secondary';
    size?: 'default' | 'large';
    isLoading?: boolean;
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
}

export function KioskButton({
    variant,
    size = 'default',
    isLoading,
    children,
    onClick,
    disabled,
    className
}: KioskButtonProps) {
    const variants = {
        success: 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200',
        danger: 'bg-rose-500 hover:bg-rose-600 shadow-rose-200',
        primary: 'bg-primary hover:bg-primary/90 shadow-primary/20',
        secondary: 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 shadow-zinc-200',
    };

    const sizes = {
        default: 'h-14 px-6 text-lg',
        large: 'h-16 px-8 text-xl',
    };

    return (
        <button
            onClick={onClick}
            disabled={isLoading || disabled}
            className={cn(
                // Base - Touch optimized
                'w-full rounded-xl font-bold tracking-wide',
                'transition-all duration-150',
                'shadow-lg',

                // Variant styles
                variants[variant],

                // Size
                sizes[size],

                // Interaction states
                'active:scale-95 active:shadow-md',
                'disabled:opacity-50 disabled:pointer-events-none',

                // Text color (white by default except secondary)
                variant !== 'secondary' && 'text-white',

                // Custom overrides
                className
            )}
        >
            {isLoading ? '...' : children}
        </button>
    );
}

/**
 * KIOSK CARD - Card táctil con padding generoso
 */

interface KioskCardProps {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
}

export function KioskCard({
    children,
    className,
    onClick
}: KioskCardProps) {
    const isInteractive = !!onClick;

    return (
        <div
            onClick={onClick}
            className={cn(
                // Base structure
                'bg-white rounded-2xl',
                'border border-zinc-100',
                'shadow-sm',

                // Generous padding for touch
                'p-6',

                // Interactive states
                isInteractive && [
                    'cursor-pointer',
                    'transition-all',
                    'hover:shadow-md',
                    'active:scale-[0.98]'
                ],

                // Custom
                className
            )}
        >
            {children}
        </div>
    );
}

/**
 * KIOSK ICON BUTTON - Botón de icono táctil
 * 
 * Touch target: 48x48px mínimo
 */

interface KioskIconButtonProps {
    icon: LucideIcon;
    label: string;
    href?: string;
    onClick?: () => void;
    variant?: 'default' | 'primary';
    className?: string;
}

export function KioskIconButton({
    icon: Icon,
    label,
    href,
    onClick,
    variant = 'default',
    className
}: KioskIconButtonProps) {
    const Component = href ? 'a' : 'button';
    const props = href ? { href } : { onClick };

    const variants = {
        default: 'bg-zinc-50 hover:bg-zinc-100 border-zinc-100',
        primary: 'bg-primary/10 hover:bg-primary/20 border-primary/20',
    };

    return (
        <Component
            {...props}
            className={cn(
                // Structure
                'flex flex-col items-center gap-3',
                'p-4 rounded-xl',

                // Touch target - minimum 88px height for comfort
                'min-h-[88px] justify-center',

                // Style
                'border',
                variants[variant],

                // Interaction
                'hover:shadow-md transition-all',
                'active:scale-95',

                // Custom
                className
            )}
        >
            <Icon className={cn(
                'w-6 h-6',
                variant === 'default' ? 'text-zinc-600' : 'text-primary'
            )} />
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                {label}
            </span>
        </Component>
    );
}

/**
 * KIOSK NUMPAD - Teclado numérico táctil
 */

interface KioskNumPadProps {
    onNumberClick: (num: string) => void;
    onBackspace: () => void;
    onEnter: () => void;
}

export function KioskNumPad({
    onNumberClick,
    onBackspace,
    onEnter
}: KioskNumPadProps) {
    const numbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '✓'];

    return (
        <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
            {numbers.map((num) => {
                const isSpecial = num === 'C' || num === '✓';

                return (
                    <button
                        key={num}
                        onClick={() => {
                            if (num === 'C') onBackspace();
                            else if (num === '✓') onEnter();
                            else onNumberClick(num);
                        }}
                        className={cn(
                            // Large touch target
                            "h-16 rounded-xl",

                            // Typography
                            "text-2xl font-bold",

                            // Base style
                            "bg-white border-2 border-zinc-200",
                            "text-zinc-800",

                            // Special styling for C and ✓
                            isSpecial && "bg-primary text-white border-primary",

                            // Interaction
                            "transition-all active:scale-95",
                            "hover:bg-zinc-50",
                            isSpecial && "hover:bg-primary/90",

                            // Shadow
                            "shadow-md hover:shadow-lg"
                        )}
                    >
                        {num}
                    </button>
                );
            })}
        </div>
    );
}
