import type { ReactNode } from 'react';
import type { CanonStatus } from '@/lib/design-system/visual-studio/types';
import { type UxStatus, uxStatusLabel } from '@/lib/design-system/visual-studio/ux-copy';

const STATUS_CLASS: Record<CanonStatus, string> = {
    'CANON CERRADO': 'bg-ds-positivo-fondo text-ds-positivo border-ds-positivo/40',
    'BORRADOR / PROPUESTA': 'bg-ds-aviso-fondo text-ds-aviso border-ds-aviso/40',
    'SIN CANON': 'bg-ds-superficie-inactiva text-ds-texto-fuerte border-ds-borde-marcado',
    HEREDADO: 'bg-ds-superficie-inactiva text-ds-texto-fuerte border-ds-borde-marcado',
    ESPECIALIZADO: 'bg-ds-informativo-fondo text-ds-informativo border-ds-informativo/40',
    DEPRECADO: 'bg-ds-superficie-inactiva text-ds-texto-fuerte border-ds-borde-marcado',
};

const STATUS_MARK: Record<CanonStatus, string> = {
    'CANON CERRADO': '🔒 CANON CERRADO',
    'BORRADOR / PROPUESTA': '🟡 BORRADOR / PROPUESTA',
    'SIN CANON': '⚪ SIN CANON',
    HEREDADO: '↳ HEREDADO',
    ESPECIALIZADO: '🟣 ESPECIALIZADO',
    DEPRECADO: '⚫ DEPRECADO',
};

const UX_STATUS_CLASS: Record<UxStatus, string> = {
    oficial: 'bg-ds-positivo-fondo text-ds-positivo border-ds-positivo/40',
    propuesta: 'bg-ds-aviso-fondo text-ds-aviso border-ds-aviso/40',
    'sin-oficial': 'bg-ds-superficie-inactiva text-ds-texto-fuerte border-ds-borde-marcado',
    hereda: 'bg-ds-superficie-inactiva text-ds-texto-fuerte border-ds-borde-marcado',
    especial: 'bg-ds-informativo-fondo text-ds-informativo border-ds-informativo/40',
    retirado: 'bg-ds-superficie-inactiva text-ds-texto-fuerte border-ds-borde-marcado',
};

const UX_STATUS_MARK: Record<UxStatus, string> = {
    oficial: '✓ Oficial',
    propuesta: 'Propuesta',
    'sin-oficial': 'Sin oficial',
    hereda: 'Hereda',
    especial: 'De una pantalla',
    retirado: 'Retirado',
};

/** Marca interna. Solo en Información técnica. */
export function CanonMark({ status }: { status: CanonStatus }) {
    return (
        <span
            className={`inline-flex items-center px-ds-2 py-ds-1 text-[11px] font-black uppercase tracking-widest border shrink-0 ${STATUS_CLASS[status]}`}
        >
            {STATUS_MARK[status]}
        </span>
    );
}

export function UxStatusMark({ status }: { status: UxStatus }) {
    return (
        <span
            className={`inline-flex items-center px-ds-2 py-ds-1 text-[11px] font-black uppercase tracking-widest border shrink-0 ${UX_STATUS_CLASS[status]}`}
        >
            {UX_STATUS_MARK[status] ?? uxStatusLabel(status)}
        </span>
    );
}

export function SampleLabel({ children }: { children: ReactNode }) {
    return (
        <p className="m-0 mb-ds-2 text-[11px] font-black uppercase tracking-widest text-ds-texto-tenue">
            {children}
        </p>
    );
}
