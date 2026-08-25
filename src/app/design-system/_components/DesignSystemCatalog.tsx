'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/Surface';
import { Field } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { KpiStat } from '@/components/ui/KpiStat';
import { PetroleumSegmented } from '@/components/ui/PetroleumSegmented';
import { DocumentListRow } from '@/components/ui/DocumentListRow';
import { Modal } from '@/components/ui/modal';
import { PageScreen } from '@/components/dashboard/DashboardDetailLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { PageScreenTemplate } from '@/lib/design-system';
import { CanonMark, CatalogSection, SampleLabel } from './catalog-kit';

const NAV_ITEMS = [
    { href: '#foundations', label: 'Fundamentos' },
    { href: '#buttons', label: 'Botones' },
    { href: '#surfaces', label: 'Superficies' },
    { href: '#fields', label: 'Campos' },
    { href: '#selectors', label: 'Selectores' },
    { href: '#feedback', label: 'Feedback' },
    { href: '#kpi', label: 'KPI' },
    { href: '#rows', label: 'Filas' },
    { href: '#modals', label: 'Modales' },
    { href: '#page-screen', label: 'PageScreen' },
    { href: '#table', label: 'Tabla' },
    { href: '#sin-canon', label: 'Sin canon' },
] as const;

const COLOR_SWATCHES: Array<{
    name: string;
    token: string;
    className: string;
    status: 'CERRADO' | 'INCOMPLETO';
}> = [
    { name: 'Marca', token: 'color.marca', className: 'bg-ds-marca', status: 'CERRADO' },
    { name: 'Marca intenso', token: 'color.marca.intenso', className: 'bg-ds-marca-intenso', status: 'CERRADO' },
    { name: 'Superficie', token: 'color.superficie', className: 'bg-ds-superficie border border-ds-borde', status: 'CERRADO' },
    { name: 'Inactiva', token: 'color.superficie.inactiva', className: 'bg-ds-superficie-inactiva', status: 'CERRADO' },
    { name: 'Texto', token: 'color.texto', className: 'bg-ds-texto', status: 'CERRADO' },
    { name: 'Positivo', token: 'color.positivo', className: 'bg-ds-positivo', status: 'CERRADO' },
    { name: 'Negativo', token: 'color.negativo', className: 'bg-ds-negativo', status: 'CERRADO' },
    { name: 'Aviso', token: 'color.aviso', className: 'bg-ds-aviso', status: 'CERRADO' },
    { name: 'Informativo', token: 'color.informativo', className: 'bg-ds-informativo', status: 'CERRADO' },
    { name: 'Crítico', token: 'color.critico', className: 'bg-ds-critico', status: 'CERRADO' },
];

const SPACING_SAMPLES = [
    { token: 'espacio.1', className: 'w-ds-1 h-ds-1', label: '4 px', status: 'CERRADO' as const },
    { token: 'espacio.2', className: 'w-ds-2 h-ds-2', label: '8 px', status: 'CERRADO' as const },
    { token: 'espacio.3', className: 'w-ds-3 h-ds-3', label: '12 px', status: 'CERRADO' as const },
    { token: 'espacio.4', className: 'w-ds-4 h-ds-4', label: '16 px', status: 'CERRADO' as const },
    { token: 'espacio.8', className: 'w-ds-8 h-ds-8', label: '32 px', status: 'CERRADO' as const },
];

export function DesignSystemCatalog() {
    const [segmentComfort, setSegmentComfort] = useState('turno');
    const [segmentCompact, setSegmentCompact] = useState('tickets');
    const [pageTemplate, setPageTemplate] = useState<PageScreenTemplate>('list');
    const [baseOpen, setBaseOpen] = useState(false);
    const [derivedOpen, setDerivedOpen] = useState(false);

    return (
        <div className="min-h-screen pb-ds-8">
            <header className="sticky top-0 z-20 border-b border-white/20 bg-ds-marca text-ds-texto-invertido pt-[env(safe-area-inset-top)]">
                <div className="mx-auto max-w-4xl px-ds-4 py-ds-3 space-y-ds-2">
                    <p className="m-0 text-[11px] font-black uppercase tracking-[0.2em] opacity-80">
                        Catálogo visual interno
                    </p>
                    <h1 className="m-0 text-[20px] font-black tracking-tight">
                        Design System Marbella
                    </h1>
                    <p className="m-0 text-[14px] leading-snug opacity-80">
                        Showroom del sistema actual. No es una pantalla de negocio. Las piezas
                        reales se muestran tal cual existen; lo que no tiene canon está marcado.
                    </p>
                </div>
                <nav
                    aria-label="Secciones del catálogo"
                    className="overflow-x-auto border-t border-white/15"
                >
                    <ul className="mx-auto flex max-w-4xl min-w-max gap-ds-1 px-ds-4 py-ds-1">
                        {NAV_ITEMS.map((item) => (
                            <li key={item.href} className="shrink-0">
                                <a
                                    href={item.href}
                                    className="inline-flex min-h-ds-tactil items-center px-ds-3 text-[11px] font-black uppercase tracking-widest text-ds-texto-invertido/90 hover:bg-white/10"
                                >
                                    {item.label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>
            </header>

            <div className="mx-auto max-w-4xl space-y-ds-8 p-ds-4 md:p-ds-8">
                <CatalogSection
                    id="foundations"
                    title="1. Foundations"
                    status={['CERRADO', 'INCOMPLETO']}
                    note="Valores de TOKENS.md. Lo adoptado usa variables CSS; lo declarado sin variable se etiqueta."
                >
                    <Surface variant="block" instance="ds-foundations" className="p-ds-4 space-y-ds-6">
                        <div>
                            <SampleLabel>Color</SampleLabel>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-ds-3">
                                {COLOR_SWATCHES.map((swatch) => (
                                    <div key={swatch.token} className="space-y-ds-1 min-w-0">
                                        <div className={`h-ds-8 w-full ${swatch.className}`} />
                                        <p className="m-0 text-[11px] font-bold text-ds-texto-fuerte truncate">
                                            {swatch.name}
                                        </p>
                                        <p className="m-0 text-[11px] text-ds-texto-tenue truncate">
                                            {swatch.token}
                                        </p>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-ds-4 space-y-ds-2">
                                <div className="flex flex-wrap items-center gap-ds-2">
                                    <div className="h-ds-8 w-ds-8 bg-marbella-shell border border-ds-borde" />
                                    <p className="m-0 text-[12px] text-ds-texto">
                                        Envolvente (`bg-marbella-shell`) — CERRADO. Es el lienzo; no
                                        contiene contenido.
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-ds-2">
                                    <CanonMark status="INCOMPLETO" />
                                    <p className="m-0 text-[12px] text-ds-texto">
                                        `color.marca.profundo`, `color.marca.suave` y
                                        `color.superficie.hundida` están documentados y no tienen
                                        variable CSS.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <SampleLabel>Tipografía</SampleLabel>
                            <div className="space-y-ds-2 text-ds-texto">
                                <p className="m-0 text-[30px] font-bold leading-none">Cifra 30 / 700</p>
                                <p className="m-0 text-[20px] font-bold">Título 20 / 700</p>
                                <p className="m-0 text-[16px] font-semibold">Subtítulo 16 / 600</p>
                                <p className="m-0 text-[14px] font-normal">Cuerpo 14 / 400 · Inter</p>
                                <p className="m-0 text-[12px] font-normal">Apoyo 12 / 400</p>
                                <p className="m-0 text-[11px] font-normal">Mínimo 11 · único por debajo: calendario</p>
                                <p className="m-0 text-[16px] font-bold">Entrada 16 · evita zoom en móvil</p>
                            </div>
                            <p className="mt-ds-2 mb-0 text-[12px] text-ds-texto-tenue">
                                Familia única Inter (adoptada). Tamaños en su mayoría declarados, no
                                centralizados.
                            </p>
                        </div>

                        <div>
                            <SampleLabel>Spacing</SampleLabel>
                            <div className="flex flex-wrap items-end gap-ds-4">
                                {SPACING_SAMPLES.map((sample) => (
                                    <div key={sample.token} className="space-y-ds-1">
                                        <div className={`${sample.className} bg-ds-marca`} />
                                        <p className="m-0 text-[11px] font-bold">{sample.label}</p>
                                        <p className="m-0 text-[11px] text-ds-texto-tenue">{sample.token}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-ds-3 flex flex-wrap items-center gap-ds-2">
                                <CanonMark status="INCOMPLETO" />
                                <p className="m-0 text-[12px] text-ds-texto">
                                    `espacio.6` (24 px) y `espacio.12` (48 px) están documentados sin
                                    variable CSS.
                                </p>
                            </div>
                        </div>

                        <div>
                            <SampleLabel>Radios</SampleLabel>
                            <div className="flex flex-wrap gap-ds-4">
                                <div className="space-y-ds-1">
                                    <div className="h-ds-8 w-ds-8 bg-ds-marca rounded-[8px]" />
                                    <p className="m-0 text-[11px] font-bold">8 px · Button / Segmented</p>
                                </div>
                                <div className="space-y-ds-1">
                                    <div className="h-ds-8 w-ds-8 bg-ds-marca rounded-ds-control" />
                                    <p className="m-0 text-[11px] font-bold">12 px · radio.control</p>
                                </div>
                                <div className="space-y-ds-1">
                                    <div className="h-ds-8 w-ds-8 bg-ds-marca rounded-ds-superficie" />
                                    <p className="m-0 text-[11px] font-bold">16 px · radio.superficie</p>
                                </div>
                                <div className="space-y-ds-1">
                                    <div className="h-ds-8 w-ds-8 bg-ds-marca rounded-full" />
                                    <p className="m-0 text-[11px] font-bold">Circular · avatares</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <SampleLabel>Sombras / elevación</SampleLabel>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-ds-4">
                                <div className="bg-ds-superficie p-ds-4 shadow-ds-superficie border border-ds-borde">
                                    <p className="m-0 text-[12px] font-bold">elevacion.superficie</p>
                                    <p className="m-0 text-[11px] text-ds-texto-tenue">Surface block</p>
                                </div>
                                <div className="bg-ds-superficie p-ds-4 shadow-ds-pagina">
                                    <p className="m-0 text-[12px] font-bold">elevacion.pagina</p>
                                    <p className="m-0 text-[11px] text-ds-texto-tenue">Surface page</p>
                                </div>
                                <div className="bg-ds-superficie p-ds-4 shadow-ds-modal">
                                    <p className="m-0 text-[12px] font-bold">elevacion.modal</p>
                                    <p className="m-0 text-[11px] text-ds-texto-tenue">Misma cifra, papel distinto</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <SampleLabel>Estados</SampleLabel>
                            <div className="flex flex-wrap items-center gap-ds-2">
                                <CanonMark status="INCOMPLETO" />
                                <p className="m-0 text-[12px] text-ds-texto">
                                    Hover / active / disabled / focus / loading están cerrados en Button
                                    y Modal. Fuera de esas piezas el catálogo de estados no está
                                    unificado.
                                </p>
                            </div>
                        </div>

                        <div>
                            <SampleLabel>Touch targets</SampleLabel>
                            <div className="flex flex-wrap items-center gap-ds-3">
                                <div className="min-h-ds-tactil min-w-ds-tactil grid place-items-center bg-ds-marca text-ds-texto-invertido text-[11px] font-black">
                                    48
                                </div>
                                <p className="m-0 text-[12px] text-ds-texto max-w-prose">
                                    `tactil.minimo` 48 px. No negociable. Incumplido hoy en TimeFilter y
                                    en el ancho de ± del stepper.
                                </p>
                            </div>
                        </div>
                    </Surface>
                </CatalogSection>

                <CatalogSection
                    id="buttons"
                    title="2. Buttons"
                    status="CERRADO"
                    note="Componente real `Button`. Anatomía XOR: texto o icono, nunca ambos. El fill lo fija la variante."
                >
                    <Surface variant="block" instance="ds-buttons" className="p-ds-4 space-y-ds-4">
                        <div className="flex flex-wrap gap-ds-3">
                            <Button variant="primary" instance="ds-btn-primary">
                                Primary
                            </Button>
                            <Button variant="secondary" instance="ds-btn-secondary">
                                Secondary
                            </Button>
                            <Button variant="tertiary" instance="ds-btn-tertiary">
                                Tertiary
                            </Button>
                            <Button variant="destructive" instance="ds-btn-destructive">
                                Destructive
                            </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-ds-3">
                            <Button variant="primary" instance="ds-btn-loading" loading>
                                Guardando
                            </Button>
                            <Button variant="secondary" instance="ds-btn-disabled" disabled>
                                Disabled
                            </Button>
                            <Button
                                variant="tertiary"
                                instance="ds-btn-icon"
                                aria-label="Añadir muestra"
                                icon={<Plus size={20} strokeWidth={2.5} />}
                            />
                            <Button
                                variant="destructive"
                                instance="ds-btn-icon-del"
                                aria-label="Eliminar muestra"
                                icon={<Trash2 size={20} strokeWidth={2.5} />}
                            />
                        </div>
                        <p className="m-0 text-[12px] text-ds-texto-tenue">
                            Icon-only es el mismo Button, 48×48, con `aria-label`. El chrome close/back
                            de Modal no es esta pieza.
                        </p>
                    </Surface>
                </CatalogSection>

                <CatalogSection
                    id="surfaces"
                    title="3. Surfaces"
                    status="CERRADO"
                    note="`Surface` page flota sobre el envolvente. `block` agrupa dentro. No es un Card universal."
                >
                    <Surface variant="page" instance="ds-surface-page">
                        <div data-element="header" className="flex items-center justify-between gap-2 shrink-0">
                            <h3 data-element="title">Surface page</h3>
                        </div>
                        <div className="p-ds-4 space-y-ds-3">
                            <p className="m-0 text-[14px] text-ds-texto">
                                Cabecera petróleo canónica del primer hijo `header`. Dentro, solo block.
                            </p>
                            <Surface variant="block" instance="ds-surface-block" className="p-ds-4">
                                <p className="m-0 text-[14px] font-bold text-ds-texto-fuerte">Surface block</p>
                                <p className="m-0 mt-ds-1 text-[12px] text-ds-texto-tenue">
                                    Radio control, borde 1 px, elevación mínima.
                                </p>
                            </Surface>
                        </div>
                    </Surface>
                </CatalogSection>

                <CatalogSection
                    id="fields"
                    title="4. Fields"
                    status={['INCOMPLETO', 'SIN CANON']}
                    note="Field existe. El consumidor pasa input/select/textarea. Search no tiene pieza."
                >
                    <Surface variant="block" instance="ds-fields" className="p-ds-4 space-y-ds-4">
                        <Field instance="ds-field-ok" label="Nombre" htmlFor="ds-field-ok" hint="Campo en reposo">
                            <input id="ds-field-ok" defaultValue="La Marbella" />
                        </Field>
                        <Field
                            instance="ds-field-error"
                            label="Importe"
                            htmlFor="ds-field-error"
                            error="Falta el importe del ticket."
                        >
                            <input id="ds-field-error" inputMode="decimal" />
                        </Field>
                        <Field instance="ds-field-disabled" label="Turno" htmlFor="ds-field-disabled" hint="Deshabilitado">
                            <input id="ds-field-disabled" defaultValue="Comida" disabled />
                        </Field>
                        <p className="m-0 text-[12px] text-ds-texto-tenue">
                            El foco usa anillo de marca (pulsa un campo). Disabled de Field no tiene
                            receta CSS propia más allá del nativo — INCOMPLETO.
                        </p>
                        <div className="flex flex-wrap items-center gap-ds-2">
                            <CanonMark status="SIN CANON" />
                            <CanonMark status="PROPUESTA / A DECIDIR" />
                            <p className="m-0 text-[12px] text-ds-texto">
                                Search no es Field. Candidato: composición de Albaranes. No se muestra
                                un mock que parezca componente.
                            </p>
                        </div>
                    </Surface>
                </CatalogSection>

                <CatalogSection
                    id="selectors"
                    title="5. Selectores"
                    status="CERRADO"
                    note="PetroleumSegmented real. Dos densidades contractuales. No es Tab, Chip ni segmented zinc."
                >
                    <Surface variant="block" instance="ds-selectors" className="p-ds-4 space-y-ds-4">
                        <div>
                            <SampleLabel>comfortable · 48 px</SampleLabel>
                            <PetroleumSegmented
                                instance="ds-seg-comfortable"
                                density="comfortable"
                                aria-label="Modo de muestra comfortable"
                                value={segmentComfort}
                                onChange={setSegmentComfort}
                                options={[
                                    { value: 'turno', label: 'Turno' },
                                    { value: 'dia', label: 'Día' },
                                    { value: 'semana', label: 'Semana' },
                                ]}
                            />
                        </div>
                        <div>
                            <SampleLabel>compact</SampleLabel>
                            <PetroleumSegmented
                                instance="ds-seg-compact"
                                density="compact"
                                aria-label="Modo de muestra compact"
                                value={segmentCompact}
                                onChange={setSegmentCompact}
                                options={[
                                    { value: 'tickets', label: 'Tickets' },
                                    { value: 'live', label: 'Live' },
                                    { value: 'productos', label: 'Productos' },
                                    { value: 'horas', label: 'Horas' },
                                ]}
                            />
                        </div>
                    </Surface>
                </CatalogSection>

                <CatalogSection
                    id="feedback"
                    title="6. Feedback"
                    status="INCOMPLETO"
                    note="EmptyState y Notice son piezas reales. none ≈ mismatch. critical = negative. LoadingSpinner no tiene contrato de color/tamaño en el DS."
                >
                    <div className="space-y-ds-4">
                        <Surface variant="block" instance="ds-empty" className="p-ds-4 space-y-ds-4">
                            <SampleLabel>EmptyState</SampleLabel>
                            <EmptyState
                                instance="ds-empty-none"
                                variant="none"
                                title="No hay documentos todavía."
                                description="Cuando se genere el primero, aparecerá aquí."
                            />
                            <EmptyState
                                instance="ds-empty-mismatch"
                                variant="mismatch"
                                title="Nada coincide con el filtro."
                                description="Prueba otro periodo o limpia la búsqueda."
                            />
                            <EmptyState
                                instance="ds-empty-error"
                                variant="error"
                                title="No se pudo cargar."
                                description="El sistema no obtuvo los documentos. Reintenta."
                                action={
                                    <Button variant="secondary" instance="ds-empty-retry">
                                        Reintentar
                                    </Button>
                                }
                            />
                        </Surface>
                        <Surface variant="block" instance="ds-notice" className="p-ds-4 space-y-ds-3">
                            <SampleLabel>Notice</SampleLabel>
                            <Notice instance="ds-notice-pos" variant="positive" title="Cuadrado">
                                El recuento coincide con lo esperado.
                            </Notice>
                            <Notice instance="ds-notice-neg" variant="negative" title="Descuadre">
                                Falta efectivo respecto al esperado.
                            </Notice>
                            <Notice instance="ds-notice-warn" variant="warning" title="Atención">
                                Hay líneas sin mapear. No bloquea el guardado.
                            </Notice>
                            <Notice instance="ds-notice-info" variant="info" title="Contexto">
                                El día de negocio no coincide con el día natural.
                            </Notice>
                            <Notice instance="ds-notice-crit" variant="critical" title="Fallo de sistema">
                                Misma pintura que negative. Variante contractual, aspecto no distinguido.
                            </Notice>
                        </Surface>
                        <Surface variant="block" instance="ds-spinner" className="p-ds-4">
                            <div className="flex flex-wrap items-center gap-ds-2 mb-ds-3">
                                <SampleLabel>LoadingSpinner</SampleLabel>
                                <CanonMark status="INCOMPLETO" />
                            </div>
                            <div className="flex flex-wrap items-end gap-ds-6 text-ds-marca">
                                <div className="space-y-ds-1 text-center">
                                    <LoadingSpinner size="sm" />
                                    <p className="m-0 text-[11px]">sm</p>
                                </div>
                                <div className="space-y-ds-1 text-center">
                                    <LoadingSpinner size="md" />
                                    <p className="m-0 text-[11px]">md</p>
                                </div>
                                <div className="space-y-ds-1 text-center">
                                    <LoadingSpinner size="lg" />
                                    <p className="m-0 text-[11px]">lg</p>
                                </div>
                                <div className="space-y-ds-1 text-center">
                                    <LoadingSpinner size="xl" />
                                    <p className="m-0 text-[11px]">xl</p>
                                </div>
                            </div>
                            <p className="mt-ds-3 mb-0 text-[12px] text-ds-texto-tenue">
                                Tamaños del componente actual. Color heredado (`currentColor`). No hay
                                tokens de loading en el contrato de primitivas.
                            </p>
                        </Surface>
                    </div>
                </CatalogSection>

                <CatalogSection
                    id="kpi"
                    title="7. KPI"
                    status="INCOMPLETO"
                    note="KpiStat real. Tonos existentes. No cubre tiras densas de calendario (P3 / Labor)."
                >
                    <Surface variant="block" instance="ds-kpi" className="p-ds-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-ds-4">
                            <KpiStat instance="ds-kpi-n" label="Tickets" tone="neutral">
                                128
                            </KpiStat>
                            <KpiStat instance="ds-kpi-p" label="Cobrado" tone="positive">
                                3.240 €
                            </KpiStat>
                            <KpiStat instance="ds-kpi-neg" label="Pendiente" tone="negative">
                                86 €
                            </KpiStat>
                            <KpiStat instance="ds-kpi-i" label="Mesas" tone="info">
                                11
                            </KpiStat>
                        </div>
                    </Surface>
                </CatalogSection>

                <CatalogSection
                    id="rows"
                    title="8. Filas"
                    status="CERRADO"
                    note="DocumentListRow real. Familia de documentos de perfil. No es ListRow genérico."
                >
                    <Surface variant="block" instance="ds-rows" className="p-ds-4">
                        <SampleLabel>host li → open button → body (title / subtitle) + trailing</SampleLabel>
                        <ul className="m-0 p-0 list-none space-y-ds-2">
                            <DocumentListRow
                                instance="ds-row-nomina"
                                title="Nómina agosto 2026"
                                subtitle="nomina-agosto.pdf"
                                onOpen={() => undefined}
                                trailing={
                                    <Button
                                        variant="destructive"
                                        instance="ds-row-del"
                                        aria-label="Eliminar documento de muestra"
                                        icon={<Trash2 size={20} strokeWidth={2.5} />}
                                    />
                                }
                            />
                            <DocumentListRow
                                instance="ds-row-contrato"
                                title="Contrato laboral"
                                subtitle="Sin archivo adjunto"
                                onOpen={() => undefined}
                            />
                        </ul>
                    </Surface>
                </CatalogSection>

                <CatalogSection
                    id="modals"
                    title="9. Modals"
                    status="CERRADO"
                    note="Modal real. Base y derived. Al abrir la derivada, el base se subordina (ADR-0009): blur, opacity y sin pointer-events."
                >
                    <Surface variant="block" instance="ds-modals" className="p-ds-4 space-y-ds-3">
                        <Button variant="primary" instance="ds-open-base" onClick={() => setBaseOpen(true)}>
                            Abrir modal base
                        </Button>
                        <p className="m-0 text-[12px] text-ds-texto-tenue">
                            Header 36 px, body con separación contractual, footer con Button de texto.
                            No hay overlay paralelo.
                        </p>
                    </Surface>
                    <Modal
                        open={baseOpen}
                        onClose={() => {
                            setDerivedOpen(false);
                            setBaseOpen(false);
                        }}
                        title="Modal base"
                        subtitle="Catálogo · T5"
                        instance="ds-modal-base"
                        layer="base"
                        variant="standard"
                        footer={
                            <>
                                <Button
                                    variant="secondary"
                                    instance="ds-modal-base-cerrar"
                                    onClick={() => {
                                        setDerivedOpen(false);
                                        setBaseOpen(false);
                                    }}
                                >
                                    Cerrar
                                </Button>
                                <Button
                                    variant="tertiary"
                                    instance="ds-modal-base-derived"
                                    onClick={() => setDerivedOpen(true)}
                                >
                                    Abrir derivada
                                </Button>
                            </>
                        }
                    >
                        <p className="m-0 text-[14px] text-ds-texto">
                            Cuerpo desplazable. Pulsa «Abrir derivada» para ver subordinación real:
                            este panel se atenúa debajo de la capa derived.
                        </p>
                    </Modal>
                    <Modal
                        open={derivedOpen}
                        onClose={() => setDerivedOpen(false)}
                        title="Modal derived"
                        subtitle="Catálogo · T6"
                        instance="ds-modal-derived"
                        parentInstance="ds-modal-base"
                        layer="derived"
                        variant="compact"
                        footer={
                            <Button
                                variant="primary"
                                instance="ds-modal-derived-listo"
                                onClick={() => setDerivedOpen(false)}
                            >
                                Listo
                            </Button>
                        }
                    >
                        <p className="m-0 text-[14px] text-ds-texto">
                            Superficie derivada. Escape y ← vuelven al padre. El base permanece
                            abierto y subordinado.
                        </p>
                    </Modal>
                </CatalogSection>

                <CatalogSection
                    id="page-screen"
                    title="10. PageScreen"
                    status="CERRADO"
                    note="Plantilla real T2/T3/T4. El catálogo cambia de template; no es una pantalla de negocio."
                >
                    <div className="space-y-ds-3">
                        <PetroleumSegmented
                            instance="ds-page-template"
                            density="comfortable"
                            aria-label="Plantilla PageScreen"
                            value={pageTemplate}
                            onChange={(value) => setPageTemplate(value as PageScreenTemplate)}
                            options={[
                                { value: 'list', label: 'List' },
                                { value: 'detail', label: 'Detail' },
                                { value: 'form', label: 'Form' },
                            ]}
                        />
                        <PageScreen
                            template={pageTemplate}
                            title={
                                pageTemplate === 'list'
                                    ? 'Listado'
                                    : pageTemplate === 'detail'
                                      ? 'Detalle'
                                      : 'Formulario'
                            }
                            subtitle={`Plantilla T${pageTemplate === 'list' ? '2' : pageTemplate === 'detail' ? '3' : '4'} · catálogo`}
                            backHref="/design-system"
                            compactHeader
                            className="min-h-0 p-0 pb-0"
                            cardClassName="min-h-0"
                            rightSlot={
                                <Button variant="tertiary" instance="ds-pagescreen-accion">
                                    Acción
                                </Button>
                            }
                            footerSlot={
                                pageTemplate === 'form' ? (
                                    <div className="flex flex-wrap justify-end gap-ds-2 pt-ds-3">
                                        <Button variant="secondary" instance="ds-form-cancelar">
                                            Cancelar
                                        </Button>
                                        <Button variant="primary" instance="ds-form-guardar">
                                            Guardar
                                        </Button>
                                    </div>
                                ) : undefined
                            }
                        >
                            {pageTemplate === 'list' ? (
                                <p className="m-0 text-[14px] text-ds-texto">
                                    Cuerpo de listado. Filtros en `rightSlot` o aquí. EmptyState cuando no
                                    hay filas.
                                </p>
                            ) : null}
                            {pageTemplate === 'detail' ? (
                                <div className="space-y-ds-3">
                                    <p className="m-0 text-[14px] text-ds-texto">
                                        Información de detalle y secciones. Acciones en cabecera o pie.
                                    </p>
                                    <Surface variant="block" instance="ds-detail-block" className="p-ds-4">
                                        <p className="m-0 text-[12px] font-bold">Bloque interior</p>
                                    </Surface>
                                </div>
                            ) : null}
                            {pageTemplate === 'form' ? (
                                <Field instance="ds-form-campo" label="Concepto" htmlFor="ds-form-campo">
                                    <input id="ds-form-campo" defaultValue="Muestra de formulario" />
                                </Field>
                            ) : null}
                        </PageScreen>
                    </div>
                </CatalogSection>

                <CatalogSection
                    id="table"
                    title="11. Tabla"
                    status={['SIN CANON', 'PROPUESTA / A DECIDIR']}
                    note="No existe componente Table. Esto es la receta T8 actual: composición. No es una primitiva."
                >
                    <Surface variant="block" instance="ds-table" className="p-ds-4 space-y-ds-4 overflow-x-hidden">
                        <SampleLabel>Receta T8 · thead marca · tabular-nums a la derecha · sin scroll X</SampleLabel>
                        <table className="w-full">
                            <thead className="bg-ds-marca text-ds-texto-invertido">
                                <tr>
                                    <th className="px-ds-3 py-ds-2 text-left text-[11px] font-black uppercase tracking-wider">
                                        Concepto
                                    </th>
                                    <th className="px-ds-3 py-ds-2 text-right text-[11px] font-black uppercase tracking-wider">
                                        Importe
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-ds-borde">
                                    <td className="px-ds-3 py-ds-3 text-[14px] text-ds-texto">Turno comida</td>
                                    <td className="px-ds-3 py-ds-3 text-right tabular-nums text-[14px] font-bold">
                                        128,40 €
                                    </td>
                                </tr>
                                <tr className="border-b border-ds-borde">
                                    <td className="px-ds-3 py-ds-3 text-[14px] text-ds-texto">Turno cena</td>
                                    <td className="px-ds-3 py-ds-3 text-right tabular-nums text-[14px] font-bold">
                                        214,10 €
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <div className="space-y-ds-2">
                            <SampleLabel>
                                Alternativa P5 en móvil · fichas, no scroll horizontal · sigue sin ser
                                componente
                            </SampleLabel>
                            <Surface variant="block" instance="ds-table-card-1" className="p-ds-3">
                                <p className="m-0 text-[11px] uppercase tracking-widest text-ds-texto-tenue">
                                    Turno comida
                                </p>
                                <p className="m-0 text-right tabular-nums text-[16px] font-black">128,40 €</p>
                            </Surface>
                            <Surface variant="block" instance="ds-table-card-2" className="p-ds-3">
                                <p className="m-0 text-[11px] uppercase tracking-widest text-ds-texto-tenue">
                                    Turno cena
                                </p>
                                <p className="m-0 text-right tabular-nums text-[16px] font-black">214,10 €</p>
                            </Surface>
                        </div>
                    </Surface>
                </CatalogSection>

                <CatalogSection
                    id="sin-canon"
                    title="12. Elementos sin canon"
                    status={['CERRADO', 'INCOMPLETO', 'SIN CANON', 'ESPECIALIZADO']}
                    note="Inventario del Blueprint Visual v0. Nada de esto se presenta como definitivo si no está cerrado."
                >
                    <Surface variant="block" instance="ds-inventory" className="p-ds-4 overflow-x-hidden">
                        <div className="space-y-ds-6 text-[13px] text-ds-texto">
                            <InventoryGroup
                                title="CERRADOS"
                                items={[
                                    'Button (4 variantes + icon-only)',
                                    'Modal base / derived / system (ADR-0007/8/9)',
                                    'Surface page / block',
                                    'PetroleumSegmented comfortable / compact',
                                    'DocumentListRow',
                                    'PageScreen list / detail / form (chrome)',
                                    'Toast sonner (feedback de acción, no Notice)',
                                    'Color marca / envolvente / semánticos adoptados',
                                    'Dropdown: se usa Modal; no hay popover de sistema',
                                ]}
                            />
                            <InventoryGroup
                                title="INCOMPLETOS"
                                items={[
                                    'Field (pocos consumidores; disabled sin receta CSS)',
                                    'EmptyState: none y mismatch no se distinguen de aspecto',
                                    'Notice: critical pinta igual que negative',
                                    'KpiStat: un consumidor real de mosaico',
                                    'LoadingSpinner: sin contrato de color/tamaño en DS',
                                    'Spacing 6 y 12, hundida, marca profundo/suave: sin CSS',
                                    'TimeFilter: táctil y chrome',
                                    'Navbar / TabBar',
                                    'Estados de control fuera de Button/Modal',
                                ]}
                            />
                            <InventoryGroup
                                title="SIN CANON"
                                items={[
                                    'Search (candidato Albaranes; no crear Input de sistema)',
                                    'Checkbox / Radio / Switch — no crear Switch',
                                    'DatePicker — P3 o Field date',
                                    'ListRow operativo genérico — no crear',
                                    'SelectionOption — no crear',
                                    'Table como componente — receta T8, no Table.tsx',
                                    'Badge / Chip factory',
                                    'Tabs underline (TabBar de facto deprecado)',
                                ]}
                            />
                            <InventoryGroup
                                title="ESPECIALIZADOS"
                                items={[
                                    'Segmented zinc (Inventario / Mapeo / Ledger)',
                                    'TimeFilter kinds hours',
                                    'RecipeCard huérfano — no es referencia',
                                    'PavilionMatchingBadge (insignia de estado local)',
                                    'KPI tiras Labor / Propinas',
                                    'ConsumptionBottomSheet (excepción única de overlay)',
                                    'IngredientWizard',
                                    'Calendario mensual P3 (patrón, no componente)',
                                ]}
                            />
                        </div>
                    </Surface>
                </CatalogSection>
            </div>
        </div>
    );
}

function InventoryGroup({ title, items }: { title: string; items: string[] }) {
    return (
        <div>
            <p className="m-0 mb-ds-2 text-[11px] font-black uppercase tracking-widest text-ds-texto-fuerte">
                {title}
            </p>
            <ul className="m-0 pl-ds-4 space-y-ds-1">
                {items.map((item) => (
                    <li key={item}>{item}</li>
                ))}
            </ul>
        </div>
    );
}
