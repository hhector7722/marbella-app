import type { ReactNode } from 'react';

export type CanonStatus =
    | 'CERRADO'
    | 'INCOMPLETO'
    | 'SIN CANON'
    | 'ESPECIALIZADO'
    | 'PROPUESTA / A DECIDIR';

const STATUS_CLASS: Record<CanonStatus, string> = {
    CERRADO: 'bg-ds-positivo-fondo text-ds-positivo border-ds-positivo/40',
    INCOMPLETO: 'bg-ds-aviso-fondo text-ds-aviso border-ds-aviso/40',
    'SIN CANON': 'bg-ds-negativo-fondo text-ds-negativo border-ds-negativo/40',
    ESPECIALIZADO: 'bg-ds-informativo-fondo text-ds-informativo border-ds-informativo/40',
    'PROPUESTA / A DECIDIR': 'bg-ds-superficie-inactiva text-ds-texto-fuerte border-ds-borde-marcado',
};

export function CanonMark({ status }: { status: CanonStatus }) {
    return (
        <span
            className={`inline-flex items-center px-ds-2 py-ds-1 text-[11px] font-black uppercase tracking-widest border shrink-0 ${STATUS_CLASS[status]}`}
        >
            {status}
        </span>
    );
}

export function CatalogSection({
    id,
    title,
    status,
    note,
    children,
}: {
    id: string;
    title: string;
    status: CanonStatus | CanonStatus[];
    note?: string;
    children: ReactNode;
}) {
    const statuses = Array.isArray(status) ? status : [status];
    return (
        <section id={id} className="scroll-mt-28 space-y-ds-4">
            <header className="space-y-ds-2">
                <div className="flex flex-wrap items-center gap-ds-2">
                    <h2 className="text-[20px] font-black tracking-tight text-ds-texto-fuerte m-0">
                        {title}
                    </h2>
                    {statuses.map((item) => (
                        <CanonMark key={item} status={item} />
                    ))}
                </div>
                {note ? (
                    <p className="m-0 text-[14px] text-ds-texto-tenue leading-snug">{note}</p>
                ) : null}
            </header>
            {children}
        </section>
    );
}

export function SampleLabel({ children }: { children: ReactNode }) {
    return (
        <p className="m-0 mb-ds-2 text-[11px] font-black uppercase tracking-widest text-ds-texto-tenue">
            {children}
        </p>
    );
}
