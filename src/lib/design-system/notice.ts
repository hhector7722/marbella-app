/**
 * Contrato Notice — aviso embebido (no toast flotante).
 */

export const NOTICE_COMPONENT_ID = 'Notice' as const;

export const NOTICE_VARIANTS = [
    'positive',
    'negative',
    'warning',
    'info',
    'critical',
] as const;

export type NoticeVariant = (typeof NOTICE_VARIANTS)[number];

export function isNoticeVariant(value: string): value is NoticeVariant {
    return (NOTICE_VARIANTS as readonly string[]).includes(value);
}
