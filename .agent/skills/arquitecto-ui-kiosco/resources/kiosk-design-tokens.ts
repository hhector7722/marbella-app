/**
 * KIOSK DESIGN TOKENS
 * 
 * Constantes de diseño para interfaces táctiles
 * Basado en estándares de iOS Human Interface Guidelines
 */

export const KIOSK_CONSTANTS = {
    // ==========================================
    // TOUCH TARGETS
    // ==========================================
    TOUCH: {
        MIN_SIZE: 44,              // Tamaño mínimo absoluto (px)
        RECOMMENDED_SIZE: 56,      // Tamaño recomendado (px)
        COMFORTABLE_SIZE: 64,      // Tamaño cómodo para uso frecuente (px)

        // Tailwind equivalents
        MIN_CLASS: 'h-11',         // 44px
        RECOMMENDED_CLASS: 'h-14', // 56px
        COMFORTABLE_CLASS: 'h-16', // 64px
    },

    // ==========================================
    // SPACING
    // ==========================================
    SPACING: {
        MIN_GAP: 8,                // gap-2 - Mínimo entre elementos
        COMFORTABLE_GAP: 16,       // gap-4 - Espacio cómodo
        SECTION_GAP: 24,           // gap-6 - Entre secciones
        PAGE_PADDING: 24,          // p-6 - Padding de página

        // Tailwind classes
        MIN_GAP_CLASS: 'gap-2',
        COMFORTABLE_GAP_CLASS: 'gap-4',
        SECTION_GAP_CLASS: 'gap-6',
        PAGE_PADDING_CLASS: 'p-6',
    },

    // ==========================================
    // TYPOGRAPHY
    // ==========================================
    TYPOGRAPHY: {
        HERO: 'text-4xl font-bold',        // 36px - Títulos principales
        TITLE: 'text-2xl font-bold',       // 24px - Títulos de sección
        BUTTON: 'text-lg font-bold',       // 18px - Texto de botones
        BODY: 'text-base',                 // 16px - Texto normal
        CAPTION: 'text-sm font-medium',    // 14px - Etiquetas
        MICRO: 'text-xs',                  // 12px - Metadatos (evitar en interactivos)
    },

    // ==========================================
    // COLORS
    // ==========================================
    COLORS: {
        // Action colors
        SUCCESS: 'bg-emerald-500 text-white',
        DANGER: 'bg-rose-500 text-white',
        PRIMARY: 'bg-primary text-primary-foreground',
        SECONDARY: 'bg-secondary text-secondary-foreground',

        // State colors
        ACTIVE: 'bg-blue-600 text-white',
        INACTIVE: 'bg-zinc-50 border border-zinc-100',
        DISABLED: 'opacity-50 pointer-events-none',

        // Feedback shadows
        SHADOW_SUCCESS: 'shadow-emerald-200',
        SHADOW_DANGER: 'shadow-rose-200',
        SHADOW_PRIMARY: 'shadow-primary/20',
        SHADOW_NEUTRAL: 'shadow-zinc-200',
    },

    // ==========================================
    // ANIMATIONS
    // ==========================================
    ANIMATIONS: {
        TRANSITION_FAST: 'duration-150',
        TRANSITION_NORMAL: 'duration-200',
        TRANSITION_SLOW: 'duration-300',

        // Feedback effects
        SCALE_PRESS: 'active:scale-95',
        SCALE_SUBTLE: 'active:scale-[0.98]',
        SHADOW_PRESS: 'active:shadow-md',

        // Combined touch feedback
        TOUCH_FEEDBACK: 'transition-all duration-150 active:scale-95',
    },

    // ==========================================
    // BORDER RADIUS
    // ==========================================
    RADIUS: {
        BUTTON: 'rounded-xl',      // Botones
        CARD: 'rounded-2xl',       // Cards y containers
        INPUT: 'rounded-xl',       // Inputs
        SMALL: 'rounded-lg',       // Elementos pequeños
    },

    // ==========================================
    // SHADOWS
    // ==========================================
    SHADOWS: {
        BUTTON: 'shadow-lg',
        CARD: 'shadow-sm',
        HOVER: 'hover:shadow-md',
        ACTIVE: 'active:shadow-md',
    },

    // ==========================================
    // ACCESSIBILITY
    // ==========================================
    ACCESSIBILITY: {
        // Contrast ratios (WCAG AA)
        MIN_CONTRAST: 4.5,         // Para texto normal
        MIN_CONTRAST_LARGE: 3.0,   // Para texto grande (18px+)

        // Focus indicators
        FOCUS_RING: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    },
} as const;

/**
 * UTILITY FUNCTIONS
 */

/**
 * Genera clases de botón táctil combinando múltiples tokens
 */
export function getKioskButtonClasses(
    variant: 'success' | 'danger' | 'primary' | 'secondary' = 'primary',
    size: 'default' | 'large' = 'default'
): string {
    const variantClasses = {
        success: `${KIOSK_CONSTANTS.COLORS.SUCCESS} ${KIOSK_CONSTANTS.COLORS.SHADOW_SUCCESS}`,
        danger: `${KIOSK_CONSTANTS.COLORS.DANGER} ${KIOSK_CONSTANTS.COLORS.SHADOW_DANGER}`,
        primary: `${KIOSK_CONSTANTS.COLORS.PRIMARY} ${KIOSK_CONSTANTS.COLORS.SHADOW_PRIMARY}`,
        secondary: `${KIOSK_CONSTANTS.COLORS.SECONDARY} ${KIOSK_CONSTANTS.COLORS.SHADOW_NEUTRAL}`,
    };

    const sizeClasses = {
        default: `${KIOSK_CONSTANTS.TOUCH.RECOMMENDED_CLASS} px-6 ${KIOSK_CONSTANTS.TYPOGRAPHY.BUTTON}`,
        large: `${KIOSK_CONSTANTS.TOUCH.COMFORTABLE_CLASS} px-8 text-xl font-bold`,
    };

    return [
        // Base
        'w-full',
        KIOSK_CONSTANTS.RADIUS.BUTTON,
        KIOSK_CONSTANTS.SHADOWS.BUTTON,

        // Variant
        variantClasses[variant],

        // Size
        sizeClasses[size],

        // Interaction
        KIOSK_CONSTANTS.ANIMATIONS.TOUCH_FEEDBACK,
        KIOSK_CONSTANTS.SHADOWS.ACTIVE,

        // States
        KIOSK_CONSTANTS.COLORS.DISABLED,
    ].join(' ');
}

/**
 * Genera clases de card táctil
 */
export function getKioskCardClasses(interactive: boolean = false): string {
    return [
        'bg-white',
        KIOSK_CONSTANTS.RADIUS.CARD,
        'border border-zinc-100',
        KIOSK_CONSTANTS.SHADOWS.CARD,
        KIOSK_CONSTANTS.SPACING.PAGE_PADDING_CLASS,

        // Interactive states
        interactive && [
            'cursor-pointer',
            KIOSK_CONSTANTS.ANIMATIONS.TRANSITION_FAST,
            KIOSK_CONSTANTS.SHADOWS.HOVER,
            'active:scale-[0.98]',
        ].filter(Boolean).join(' '),
    ].filter(Boolean).join(' ');
}

/**
 * EJEMPLOS DE USO
 */

// Ejemplo 1: Botón de acción principal
// className={getKioskButtonClasses('success', 'large')}

// Ejemplo 2: Card interactiva
// className={getKioskCardClasses(true)}

// Ejemplo 3: Componente custom con tokens
/*
<button className={cn(
  KIOSK_CONSTANTS.TOUCH.COMFORTABLE_CLASS,
  KIOSK_CONSTANTS.TYPOGRAPHY.BUTTON,
  KIOSK_CONSTANTS.RADIUS.BUTTON,
  KIOSK_CONSTANTS.COLORS.SUCCESS,
  KIOSK_CONSTANTS.ANIMATIONS.TOUCH_FEEDBACK
)}>
  Confirmar
</button>
*/
