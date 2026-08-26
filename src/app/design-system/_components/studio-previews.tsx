'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, Minus, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { KpiStat } from '@/components/ui/KpiStat';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/modal';
import { Notice } from '@/components/ui/Notice';
import { PetroleumSegmented } from '@/components/ui/PetroleumSegmented';
import { Surface } from '@/components/ui/Surface';
import DashboardShortcut from '@/components/dashboards/DashboardShortcut';
import { DocumentListRow } from '@/components/ui/DocumentListRow';
import { COLOR_OPTIONS, SPACE_OPTIONS, TYPE_SIZE_OPTIONS, PAGE_HEADER_HEIGHT_OPTIONS, findOption } from '@/lib/design-system/visual-studio/allowed-values';
import type { PropertyValues, StudioElement } from '@/lib/design-system/visual-studio/types';
import { humanSummary } from '@/lib/design-system/visual-studio/ux-copy';
import { SampleLabel } from './catalog-kit';

export function previewStyle(element: StudioElement, values: PropertyValues): CSSProperties {
    const style: Record<string, string> = {};
    for (const property of element.properties) {
        const option = findOption(property.options, values[property.id] ?? property.actualId);
        if (!option) continue;
        const css = option.cssVar ? `var(${option.cssVar})` : option.value;
        if (property.id === 'height' || property.id === 'row-height' || property.id === 'size') {
            style['--studio-height'] = css;
        }
        if (property.id === 'radius') style['--studio-radius'] = css;
        if (property.id === 'px') style['--studio-px'] = css;
        if (property.id === 'label-gap') style['--studio-label-gap'] = css;
        if (property.id === 'focus') style['--studio-focus'] = css;
        if (property.id === 'pad-y' || property.id === 'py') style['--studio-pad-y'] = css;
        if (property.id === 'gap') style['--studio-gap'] = css;
        if (property.id === 'align-x') {
            style['--studio-text-align'] = option.id === 'center' ? 'center' : 'left';
        }
    }
    return style as CSSProperties;
}

export function StudioHeaderFrame({
    title,
    action,
    values,
    petroleum = true,
    showBack = true,
}: {
    title: string;
    action?: string;
    values: PropertyValues;
    petroleum?: boolean;
    showBack?: boolean;
}) {
    const alignX = values['align-x'] ?? 'edges';
    const alignY = values['align-y'] ?? 'center';
    const padX = findOption(SPACE_OPTIONS, values.px ?? 'espacio.4');
    const padY = findOption(SPACE_OPTIONS, values.py ?? 'espacio.4');
    const titleSize = findOption(TYPE_SIZE_OPTIONS, values['title-size'] ?? 'tipo.titulo-pantalla');
    const height = findOption(PAGE_HEADER_HEIGHT_OPTIONS, values.height ?? 'auto');
    const fixedHeight = Boolean(height && height.id !== 'auto');
    const heightCss = height?.cssVar ? `var(${height.cssVar})` : height?.value;
    return (
        <div
            data-studio-preview="header"
            data-element="header"
            data-align-x={alignX}
            data-align-y={alignY}
            data-fixed-height={fixedHeight ? 'true' : undefined}
            className={`flex gap-ds-2 ${fixedHeight ? '' : 'min-h-ds-tactil '} ${petroleum ? 'bg-ds-marca text-ds-texto-invertido' : 'bg-ds-superficie border-b border-ds-borde'}`}
            style={{
                paddingInline: padX?.cssVar ? `var(${padX.cssVar})` : padX?.value,
                paddingBlock: fixedHeight ? 0 : padY?.cssVar ? `var(${padY.cssVar})` : padY?.value,
                ...(fixedHeight && heightCss
                    ? {
                          ['--page-header-height' as string]: heightCss,
                          ['--page-header-scale' as string]:
                              'calc(var(--page-header-height) / var(--tactil-minimo))',
                          ['--studio-height' as string]: heightCss,
                          height: heightCss,
                          minHeight: heightCss,
                          maxHeight: heightCss,
                          boxSizing: 'border-box',
                      }
                    : { ['--page-header-scale' as string]: '1' }),
            }}
        >
            <div className="flex items-center gap-ds-2 min-w-0">
                {showBack ? (
                    <Button
                        variant="secondary"
                        instance="ds-header-back"
                        aria-label="Volver"
                        icon={<ArrowLeft size={20} strokeWidth={2.5} />}
                    />
                ) : null}
                <p
                    data-element="title"
                    className="m-0 font-black uppercase tracking-wider truncate"
                    style={{ fontSize: `calc(${titleSize?.value ?? '18px'} * var(--page-header-scale, 1))` }}
                >
                    {title}
                </p>
            </div>
            {action ? (
                <div className="shrink-0">
                    <Button variant="primary" instance="ds-header-action">
                        {action}
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

function HeaderFrame(props: Parameters<typeof StudioHeaderFrame>[0]) {
    return <StudioHeaderFrame {...props} />;
}

export function ElementPreview({
    element,
    values,
}: {
    element: StudioElement;
    values: PropertyValues;
}) {
    const style = previewStyle(element, values);
    const alignX = values['align-x'] ?? 'edges';

    if (element.group === 'fundamentos' && element.id === 'color') {
        return (
            <div className="grid grid-cols-3 gap-ds-3">
                {COLOR_OPTIONS.map((swatch) => (
                    <div key={swatch.id} className="min-w-0 space-y-ds-1">
                        <div
                            className="h-ds-8 w-full border border-ds-borde"
                            style={{ background: swatch.value }}
                        />
                        <p className="m-0 text-[11px] font-bold truncate">{swatch.label}</p>
                    </div>
                ))}
            </div>
        );
    }

    if (element.id === 'page-header' || element.id === 'block-header') {
        if (element.id === 'block-header') {
            return (
                <div className="space-y-ds-3">
                    <Surface variant="block" instance="ds-block-radar">
                        <HeaderFrame title="Mesas abiertas" showBack={false} values={{ ...values, 'title-size': 'tipo.minimo', px: 'espacio.3', py: 'espacio.2' }} petroleum />
                        <p className="m-0 px-ds-3 py-ds-2 text-[12px] text-ds-texto-tenue">Título + meta. RadarSala.</p>
                    </Surface>
                    <Surface variant="block" instance="ds-block-export">
                        <HeaderFrame title="Resumen" action="CSV" showBack={false} values={{ ...values, 'title-size': 'tipo.minimo', px: 'espacio.3', py: 'espacio.2' }} petroleum />
                        <p className="m-0 px-ds-3 py-ds-2 text-[12px] text-ds-texto-tenue">Título + acción. Pedidos evento.</p>
                    </Surface>
                    <Surface variant="block" instance="ds-block-title">
                        <HeaderFrame title="Cambio caja" showBack={false} values={{ ...values, 'title-size': 'tipo.minimo', px: 'espacio.3', py: 'espacio.2' }} petroleum />
                        <p className="m-0 px-ds-3 py-ds-2 text-[12px] text-ds-texto-tenue">Título solo. Cards de tesorería.</p>
                    </Surface>
                </div>
            );
        }
        return (
            <Surface variant="page" instance="ds-header-preview">
                <HeaderFrame
                    title="Fichajes"
                    action="Nuevo"
                    values={values}
                    petroleum
                />
                <div className="p-ds-4 text-[14px] text-ds-texto">Contenido de la superficie.</div>
            </Surface>
        );
    }

    if (element.id === 'modal-header' || element.id === 'derived-modal-header') {
        return (
            <div className="border border-ds-borde rounded-ds-superficie overflow-hidden bg-ds-superficie">
                <div
                    className="flex h-ds-modal-header items-center px-ds-4 bg-ds-marca text-ds-texto-invertido"
                    data-studio-preview="header"
                    data-align-x={values['align-x'] ?? 'left'}
                >
                    <p className="m-0 text-[14px] font-black uppercase tracking-wider">Detalle</p>
                </div>
                <p className="m-0 p-ds-4 text-[14px] text-ds-texto">
                    {element.id === 'derived-modal-header'
                        ? 'Las ventanas internas usan esta misma cabecera.'
                        : 'Cabecera de ventana. 36 px.'}
                </p>
            </div>
        );
    }

    if (element.status === 'ESPECIALIZADO' && element.group === 'cabeceras') {
        return (
            <p className="m-0 text-[14px] text-ds-texto">
                Esta cabecera solo existe en una pantalla. No se cambia desde aquí el diseño general.
            </p>
        );
    }

    if (element.id === 'layout-alignment') {
        return (
            <div className="space-y-ds-3">
                <SampleLabel>Título y acción</SampleLabel>
                <HeaderFrame title="Nóminas" action="Exportar" values={values} />
                <SampleLabel>Título solo</SampleLabel>
                <HeaderFrame title="Nóminas" values={{ ...values, 'align-x': alignX }} />
            </div>
        );
    }

    if (element.id === 'field' || element.id === 'select') {
        return (
            <div data-studio-preview="field" style={style} className="space-y-ds-4">
                <Field instance="ds-field-preview" label="Nombre" htmlFor="ds-field-preview">
                    {element.id === 'select' ? (
                        <select id="ds-field-preview" defaultValue="uno">
                            <option value="uno">Primera opción</option>
                            <option value="dos">Segunda opción</option>
                        </select>
                    ) : (
                        <input id="ds-field-preview" defaultValue="Ana" />
                    )}
                </Field>
                <Field instance="ds-field-error" label="Importe" htmlFor="ds-field-error" error="Falta el importe">
                    <input id="ds-field-error" placeholder="0,00" />
                </Field>
                <Field instance="ds-field-disabled" label="Deshabilitado" htmlFor="ds-field-disabled">
                    <input id="ds-field-disabled" defaultValue="Solo lectura" disabled />
                </Field>
            </div>
        );
    }

    if (element.id === 'search') {
        return (
            <div style={style} className="relative">
                <Search
                    size={18}
                    strokeWidth={1.5}
                    className="absolute left-ds-3 top-1/2 -translate-y-1/2 text-ds-texto-tenue"
                />
                <input
                    data-studio-search=""
                    aria-label="Buscar"
                    placeholder="Buscar albaranes"
                    className="pl-ds-8"
                    style={style}
                />
            </div>
        );
    }

    if (element.id === 'quantity-stepper') {
        return (
            <div data-studio-stepper="" data-align-x={alignX} style={style}>
                <Button
                    variant="secondary"
                    instance="ds-step-minus"
                    aria-label="Quitar una unidad"
                    icon={<Minus size={18} strokeWidth={2} />}
                />
                <span className="text-[16px] font-bold tabular-nums min-w-ds-8 text-center">12</span>
                <Button
                    variant="secondary"
                    instance="ds-step-plus"
                    aria-label="Añadir una unidad"
                    icon={<Plus size={18} strokeWidth={2} />}
                />
            </div>
        );
    }

    if (element.id === 'table') {
        return (
            <div className="overflow-x-auto">
                <table className="w-full text-[14px]">
                    <thead className="bg-ds-marca text-ds-texto-invertido">
                        <tr>
                            <th className="text-left font-black uppercase text-[11px] tracking-widest px-ds-3 py-ds-2">
                                Concepto
                            </th>
                            <th className="text-right font-black uppercase text-[11px] tracking-widest px-ds-3 py-ds-2">
                                Importe
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-b border-ds-borde">
                            <td className="px-ds-3 py-ds-3">Turno mañana</td>
                            <td className="px-ds-3 py-ds-3 text-right tabular-nums">128,40 €</td>
                        </tr>
                        <tr>
                            <td className="px-ds-3 py-ds-3">Turno tarde</td>
                            <td className="px-ds-3 py-ds-3 text-right tabular-nums">96,00 €</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    }

    if (element.id === 'empty-state') {
        return (
            <div data-studio-preview="empty" style={style} className="space-y-ds-4">
                <EmptyState
                    instance="ds-empty-none"
                    variant="none"
                    title="Aún no hay albaranes"
                    description="Cuando llegue el primero, aparecerá aquí."
                />
                <EmptyState
                    instance="ds-empty-mismatch"
                    variant="mismatch"
                    title="Nada coincide"
                    description="Prueba otro periodo o limpia el filtro."
                />
            </div>
        );
    }

    if (element.id === 'notice') {
        return (
            <div className="space-y-ds-3">
                <Notice instance="ds-notice-info" variant="info" title="Información">
                    Aviso persistente. No es un toast.
                </Notice>
                <Notice instance="ds-notice-critical" variant="critical" title="Crítico">
                    Fallo del sistema. Debe usar color.critico.
                </Notice>
            </div>
        );
    }

    if (element.id === 'loading-spinner') {
        return (
            <div className="flex min-h-ds-tactil items-center justify-center text-ds-marca">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (element.id === 'radio-segmented' || element.id === 'petroleum-segmented') {
        return (
            <PetroleumSegmented
                instance="ds-seg-preview"
                density={values.density === 'compact' ? 'compact' : 'comfortable'}
                value="turno"
                onChange={() => undefined}
                aria-label="Periodo"
                options={[
                    { value: 'turno', label: 'Turno' },
                    { value: 'semana', label: 'Semana' },
                    { value: 'mes', label: 'Mes' },
                ]}
            />
        );
    }

    if (element.id === 'checkbox') {
        return (
            <label className="flex min-h-ds-tactil items-center gap-ds-2 text-[14px] font-semibold">
                <input type="checkbox" defaultChecked className="h-ds-4 w-ds-4 shrink-0" />
                Incluir extras
            </label>
        );
    }

    if (element.id === 'button') {
        return (
            <div data-studio-preview="button" style={style} className="flex flex-wrap gap-ds-3">
                <Button variant="primary" instance="ds-btn-primary">
                    Guardar
                </Button>
                <Button variant="secondary" instance="ds-btn-secondary">
                    Cancelar
                </Button>
                <Button variant="tertiary" instance="ds-btn-tertiary">
                    Ver
                </Button>
                <Button variant="destructive" instance="ds-btn-destructive">
                    Eliminar
                </Button>
            </div>
        );
    }

    if (element.id === 'calendar') {
        return (
            <div className="grid grid-cols-7 gap-ds-1 text-center text-[12px]">
                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
                    <span key={d} className="font-black text-ds-texto-tenue">
                        {d}
                    </span>
                ))}
                {Array.from({ length: 28 }, (_, i) => (
                    <span
                        key={i}
                        className={`min-h-ds-tactil flex items-center justify-center ${i === 10 ? 'bg-ds-marca text-ds-texto-invertido' : 'bg-ds-superficie'}`}
                    >
                        {i + 1}
                    </span>
                ))}
            </div>
        );
    }

    return (
        <p className="m-0 text-[14px] text-ds-texto">{humanSummary(element)}</p>
    );
}

function PageFrame({
    title,
    action,
    values,
    children,
}: {
    title: string;
    action?: string;
    values: PropertyValues;
    children: ReactNode;
}) {
    return (
        <Surface variant="page" instance="ds-ctx-page">
            <HeaderFrame title={title} action={action} values={values} petroleum />
            <div data-element="body" className="p-ds-4 space-y-ds-4">
                {children}
            </div>
        </Surface>
    );
}

function ModalContextDemo({
    triggerLabel,
    title,
    children,
    footer,
}: {
    triggerLabel: string;
    title: string;
    children: ReactNode;
    footer?: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button variant="secondary" instance="ds-ctx-open-modal" onClick={() => setOpen(true)}>
                {triggerLabel}
            </Button>
            <Modal
                open={open}
                onClose={() => setOpen(false)}
                title={title}
                instance="ds-ctx-modal"
                variant="compact"
                layer="base"
                disableUsageTracking
                footer={footer}
            >
                {children}
            </Modal>
        </>
    );
}

export function ElementContextPreview({
    element,
    values,
    scene,
}: {
    element: StudioElement;
    values: PropertyValues;
    scene: string;
}) {
    const style = previewStyle(element, values);

    if (element.id === 'page-header' || element.id === 'pagescreen' || element.id === 'block-header') {
        const headerValues = element.id === 'block-header' ? values : values;
        if (scene === 'list') {
            return (
                <PageFrame title="Albaranes" action="Nuevo" values={headerValues}>
                    <EmptyState
                        instance="ds-ctx-empty"
                        variant="none"
                        title="Aún no hay albaranes"
                        description="Cuando llegue el primero, aparecerá aquí."
                    />
                </PageFrame>
            );
        }
        if (scene === 'detail') {
            return (
                <PageFrame title="Trabajador" values={headerValues}>
                    <Surface variant="block" instance="ds-ctx-block">
                        <HeaderFrame
                            title="Contrato"
                            showBack={false}
                            petroleum={false}
                            values={{ ...values, 'title-size': 'tipo.minimo', px: 'espacio.3', py: 'espacio.2' }}
                        />
                        <p className="m-0 p-ds-3 text-[14px] text-ds-texto">Datos del contrato.</p>
                    </Surface>
                </PageFrame>
            );
        }
        if (scene === 'form') {
            return (
                <PageFrame title="Fichaje" values={headerValues}>
                    <Field instance="ds-ctx-notas" label="Notas" htmlFor="ds-ctx-notas">
                        <input id="ds-ctx-notas" />
                    </Field>
                    <div className="shrink-0">
                        <Button variant="primary" instance="ds-ctx-guardar" layout="fill">
                            Guardar
                        </Button>
                    </div>
                </PageFrame>
            );
        }
        return (
            <PageFrame title="Ventas" action="+" values={headerValues}>
                <div className="grid grid-cols-2 gap-ds-3">
                    <KpiStat instance="ds-ctx-kpi-1" label="Hoy" tone="positive">
                        1.280 €
                    </KpiStat>
                    <KpiStat instance="ds-ctx-kpi-2" label="Tickets" tone="neutral">
                        42
                    </KpiStat>
                </div>
            </PageFrame>
        );
    }

    if (element.id === 'button') {
        if (scene === 'modal') {
            return (
                <ModalContextDemo
                    triggerLabel="Ver en ventana"
                    title="Pedido"
                    footer={
                        <div className="flex flex-wrap gap-ds-2 justify-end" data-studio-preview="button" style={style}>
                            <Button variant="secondary" instance="ds-ctx-btn-cancel">
                                Cancelar
                            </Button>
                            <Button variant="primary" instance="ds-ctx-btn-ok">
                                Guardar
                            </Button>
                        </div>
                    }
                >
                    <p className="m-0 text-[14px] text-ds-texto">Cuerpo de la ventana.</p>
                </ModalContextDemo>
            );
        }
        if (scene === 'form') {
            return (
                <div className="space-y-ds-4">
                    <Field instance="ds-ctx-btn-field" label="Nombre" htmlFor="ds-ctx-btn-field">
                        <input id="ds-ctx-btn-field" defaultValue="Ana" />
                    </Field>
                    <div className="shrink-0" data-studio-preview="button" style={style}>
                        <Button variant="primary" instance="ds-ctx-btn-form" layout="fill">
                            Guardar
                        </Button>
                    </div>
                </div>
            );
        }
        if (scene === 'list') {
            return (
                <ul className="m-0 p-0 space-y-ds-2">
                    <DocumentListRow
                        instance="ds-ctx-row"
                        title="Nómina agosto"
                        subtitle="PDF"
                        onOpen={() => undefined}
                        trailing={
                            <span data-studio-preview="button" style={style}>
                                <Button variant="tertiary" instance="ds-ctx-row-ver">
                                    Ver
                                </Button>
                            </span>
                        }
                    />
                </ul>
            );
        }
        return (
            <div className="overflow-x-auto">
                <table className="w-full text-[14px]">
                    <thead className="bg-ds-marca text-ds-texto-invertido">
                        <tr>
                            <th className="text-left font-black uppercase text-[11px] tracking-widest px-ds-3 py-ds-2">
                                Persona
                            </th>
                            <th className="text-right font-black uppercase text-[11px] tracking-widest px-ds-3 py-ds-2">
                                Acción
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-b border-ds-borde">
                            <td className="px-ds-3 py-ds-3">Ana</td>
                            <td className="px-ds-3 py-ds-3 text-right">
                                <span data-studio-preview="button" style={style}>
                                    <Button variant="tertiary" instance="ds-ctx-table-ver">
                                        Ver
                                    </Button>
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    }

    if (element.id === 'field' || element.id === 'select' || element.id === 'search') {
        if (scene === 'modal') {
            return (
                <ModalContextDemo triggerLabel="Ver en ventana" title="Nuevo registro">
                    <ElementPreview element={element} values={values} />
                </ModalContextDemo>
            );
        }
        return (
            <PageFrame title="Fichaje" values={values}>
                <ElementPreview element={element} values={values} />
                <div className="shrink-0">
                    <Button variant="primary" instance="ds-ctx-field-save" layout="fill">
                        Guardar
                    </Button>
                </div>
            </PageFrame>
        );
    }

    if (element.id === 'modal' || element.id === 'modal-header' || element.id === 'derived-modal-header') {
        if (scene === 'form') {
            return (
                <ModalContextDemo
                    triggerLabel="Abrir ventana"
                    title="Fichaje"
                    footer={
                        <Button variant="primary" instance="ds-ctx-modal-save">
                            Guardar
                        </Button>
                    }
                >
                    <Field instance="ds-ctx-modal-notas" label="Notas" htmlFor="ds-ctx-modal-notas">
                        <input id="ds-ctx-modal-notas" />
                    </Field>
                </ModalContextDemo>
            );
        }
        return (
            <ModalContextDemo triggerLabel="Abrir ventana" title="Detalle">
                <p className="m-0 text-[14px] text-ds-texto">Contenido de la ventana.</p>
            </ModalContextDemo>
        );
    }

    if (element.id === 'empty-state' || scene === 'list') {
        return (
            <PageFrame title="Albaranes" action="Nuevo" values={values}>
                {element.id === 'document-list-row' ? (
                    <ul className="m-0 p-0">
                        <DocumentListRow
                            instance="ds-ctx-doc"
                            title="Albarán 1042"
                            subtitle="Hoy"
                            onOpen={() => undefined}
                        />
                    </ul>
                ) : (
                    <ElementPreview element={element} values={values} />
                )}
            </PageFrame>
        );
    }

    if (scene === 'table' || element.id === 'table') {
        return (
            <PageFrame title="Nóminas" values={values}>
                <ElementPreview element={getTableElement(element)} values={values} />
            </PageFrame>
        );
    }

    return <ElementPreview element={element} values={values} />;
}

function getTableElement(element: StudioElement): StudioElement {
    if (element.id === 'table') return element;
    return { ...element, id: 'table' };
}

export function CanonicalCompositions() {
    return (
        <div className="space-y-ds-8">
            <section className="space-y-ds-3">
                <SampleLabel>T1 Dashboard</SampleLabel>
                <Surface variant="page" instance="ds-t1">
                    <div data-element="header" className="flex items-center justify-between">
                        <p data-element="title" className="m-0">
                            Ventas
                        </p>
                    </div>
                    <div className="p-ds-4 space-y-ds-4">
                        <div className="grid grid-cols-2 gap-ds-3">
                            <KpiStat instance="ds-kpi-1" label="Hoy" tone="positive">
                                1.280 €
                            </KpiStat>
                            <KpiStat instance="ds-kpi-2" label="Tickets" tone="neutral">
                                42
                            </KpiStat>
                        </div>
                        <div className="flex gap-ds-3">
                            <DashboardShortcut instance="ds-atajo-1" label="Caja" onClick={() => undefined} />
                            <DashboardShortcut instance="ds-atajo-2" label="Sala" onClick={() => undefined} />
                        </div>
                    </div>
                </Surface>
            </section>
            <section className="space-y-ds-3">
                <SampleLabel>T2 Listado</SampleLabel>
                <Surface variant="page" instance="ds-t2">
                    <div data-element="header" className="flex items-center justify-between">
                        <p data-element="title" className="m-0">
                            Albaranes
                        </p>
                    </div>
                    <div className="p-ds-4 space-y-ds-4">
                        <EmptyState
                            instance="ds-t2-empty"
                            variant="none"
                            title="Aún no hay albaranes"
                            description="Cuando llegue el primero, aparecerá aquí."
                        />
                    </div>
                </Surface>
            </section>
            <section className="space-y-ds-3">
                <SampleLabel>T3 Detalle</SampleLabel>
                <Surface variant="page" instance="ds-t3">
                    <div data-element="header" className="flex items-center justify-between">
                        <p data-element="title" className="m-0">
                            Trabajador
                        </p>
                    </div>
                    <div className="p-ds-4 space-y-ds-4">
                        <Surface variant="block" instance="ds-t3-block">
                            <div data-element="header" className="flex items-center justify-between">
                                <p data-element="title" className="m-0">
                                    Contrato
                                </p>
                            </div>
                            <p className="m-0 p-ds-3 text-[14px] text-ds-texto">Sección interior. Surface block.</p>
                        </Surface>
                    </div>
                </Surface>
            </section>
            <section className="space-y-ds-3">
                <SampleLabel>T4 Formulario</SampleLabel>
                <Surface variant="page" instance="ds-t4">
                    <div data-element="header" className="flex items-center justify-between">
                        <p data-element="title" className="m-0">
                            Fichaje
                        </p>
                    </div>
                    <div className="p-ds-4 space-y-ds-4">
                        <Field instance="ds-t4-campo" label="Notas" htmlFor="ds-t4-campo">
                            <input id="ds-t4-campo" />
                        </Field>
                        <Button variant="primary" instance="ds-t4-guardar" layout="fill">
                            Guardar
                        </Button>
                    </div>
                </Surface>
            </section>
            <T5T6Composition />
            <section className="space-y-ds-3">
                <SampleLabel>T8 Tabla</SampleLabel>
                <Surface variant="page" instance="ds-t8">
                    <div data-element="header" className="flex items-center justify-between">
                        <p data-element="title" className="m-0">
                            Nóminas
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[14px]">
                            <thead className="bg-ds-marca text-ds-texto-invertido">
                                <tr>
                                    <th className="text-left font-black uppercase text-[11px] tracking-widest px-ds-3 py-ds-2">
                                        Persona
                                    </th>
                                    <th className="text-right font-black uppercase text-[11px] tracking-widest px-ds-3 py-ds-2">
                                        Neto
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-ds-borde">
                                    <td className="px-ds-3 min-h-ds-tactil">Ana</td>
                                    <td className="px-ds-3 text-right tabular-nums">1.842,10 €</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </Surface>
            </section>
        </div>
    );
}

function T5T6Composition() {
    const [baseOpen, setBaseOpen] = useState(false);
    const [derivedOpen, setDerivedOpen] = useState(false);
    return (
        <section className="space-y-ds-3">
            <SampleLabel>T5 Modal y T6 derived</SampleLabel>
            <Button variant="tertiary" instance="ds-open-t5" onClick={() => setBaseOpen(true)}>
                Abrir modal
            </Button>
            <Modal
                open={baseOpen}
                onClose={() => {
                    setDerivedOpen(false);
                    setBaseOpen(false);
                }}
                title="Pedido"
                instance="ds-t5"
                variant="compact"
                layer="base"
                disableUsageTracking
                footer={
                    <Button variant="primary" instance="ds-t5-derived" onClick={() => setDerivedOpen(true)}>
                        Abrir derived
                    </Button>
                }
            >
                <p className="m-0 text-[14px] text-ds-texto">Cuerpo del modal padre.</p>
            </Modal>
            <Modal
                open={derivedOpen}
                onClose={() => setDerivedOpen(false)}
                title="Línea"
                instance="ds-t6"
                parentInstance="ds-t5"
                variant="compact"
                layer="derived"
                disableUsageTracking
            >
                <p className="m-0 text-[14px] text-ds-texto">Subordinado. Misma pieza Modal.</p>
            </Modal>
        </section>
    );
}
