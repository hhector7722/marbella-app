'use client';

import { useRef, type PointerEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { PetroleumSegmented } from '@/components/ui/PetroleumSegmented';
import { Surface } from '@/components/ui/Surface';
import { DocumentListRow } from '@/components/ui/DocumentListRow';
import { getStudioElement } from '@/lib/design-system/visual-studio/catalog';
import type { PropertyValues } from '@/lib/design-system/visual-studio/types';
import {
    type StudioSceneId,
    STUDIO_REGIONS,
    regionMatchesQuery,
    sceneById,
} from '@/lib/design-system/visual-studio/ux-scenes';
import { previewStyle, StudioHeaderFrame } from './studio-previews';

function styleOf(elementId: string, values: PropertyValues) {
    const element = getStudioElement(elementId);
    if (!element) return undefined;
    return previewStyle(element, values);
}

const PEEK_MS = 400;

function RegionHit({
    label,
    selected,
    dimmed,
    onSelect,
    children,
}: {
    label: string;
    selected: boolean;
    dimmed: boolean;
    onSelect: () => void;
    children: ReactNode;
}) {
    return (
        <div className={`relative ${dimmed ? 'opacity-40' : ''}`}>
            <div className="pointer-events-none">{children}</div>
            <button
                type="button"
                aria-label={label}
                aria-pressed={selected}
                onClick={onSelect}
                className={`absolute inset-0 z-10 min-h-ds-tactil shrink-0 border-2 ${
                    selected ? 'border-ds-marca' : 'border-transparent'
                }`}
            />
        </div>
    );
}

function InlineModal({
    headerSelected,
    fieldSelected,
    buttonSelected,
    dimHeader,
    dimField,
    dimButton,
    headerValues,
    fieldValues,
    buttonValues,
    onSelect,
}: {
    headerSelected: boolean;
    fieldSelected: boolean;
    buttonSelected: boolean;
    dimHeader: boolean;
    dimField: boolean;
    dimButton: boolean;
    headerValues: PropertyValues;
    fieldValues: PropertyValues;
    buttonValues: PropertyValues;
    onSelect: (elementId: string) => void;
}) {
    return (
        <div className="border border-ds-borde rounded-ds-superficie overflow-hidden bg-ds-superficie shadow-ds-modal">
            <RegionHit
                label="Cabecera de modal"
                selected={headerSelected}
                dimmed={dimHeader}
                onSelect={() => onSelect('modal-header')}
            >
                <div
                    className="flex h-ds-modal-header items-center px-ds-4 bg-ds-marca text-ds-texto-invertido"
                    data-studio-preview="header"
                    data-element="header"
                    data-align-x={headerValues['align-x'] ?? 'left'}
                >
                    <p className="m-0 text-[14px] font-black uppercase tracking-wider">Pedido</p>
                </div>
            </RegionHit>
            <div className="p-ds-4 space-y-ds-4">
                <RegionHit
                    label="Campo"
                    selected={fieldSelected}
                    dimmed={dimField}
                    onSelect={() => onSelect('field')}
                >
                    <div data-studio-preview="field" style={styleOf('field', fieldValues)}>
                        <Field instance="ds-scene-modal-field" label="Notas" htmlFor="ds-scene-modal-field">
                            <input id="ds-scene-modal-field" defaultValue="Sin gluten" readOnly />
                        </Field>
                    </div>
                </RegionHit>
                <div className="flex flex-wrap justify-end gap-ds-2">
                    <RegionHit
                        label="Botón"
                        selected={buttonSelected}
                        dimmed={dimButton}
                        onSelect={() => onSelect('button')}
                    >
                        <div
                            className="flex flex-wrap justify-end gap-ds-2"
                            data-studio-preview="button"
                            style={styleOf('button', buttonValues)}
                        >
                            <Button variant="secondary" instance="ds-scene-modal-cancel">
                                Cancelar
                            </Button>
                            <Button variant="primary" instance="ds-scene-modal-ok">
                                Guardar
                            </Button>
                        </div>
                    </RegionHit>
                </div>
            </div>
        </div>
    );
}

export function StudioLivingScene({
    scene,
    peeking,
    selectedId,
    searchQuery,
    valuesFor,
    onSelectRegion,
    onPeekChange,
}: {
    scene: StudioSceneId;
    peeking: boolean;
    selectedId: string | null;
    searchQuery: string;
    valuesFor: (elementId: string) => PropertyValues;
    onSelectRegion: (elementId: string) => void;
    onPeekChange: (next: boolean) => void;
}) {
    const timer = useRef<number | null>(null);
    const didPeek = useRef(false);
    const def = sceneById(scene);
    const q = searchQuery.trim();
    const dim = (elementId: string) => {
        if (q.length === 0) return false;
        const region = STUDIO_REGIONS.find((item) => item.elementId === elementId);
        if (!region) return true;
        return !regionMatchesQuery(region, q);
    };

    function clearPeekTimer() {
        if (timer.current != null) {
            window.clearTimeout(timer.current);
            timer.current = null;
        }
    }

    function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        didPeek.current = false;
        clearPeekTimer();
        timer.current = window.setTimeout(() => {
            didPeek.current = true;
            onPeekChange(true);
        }, PEEK_MS);
    }

    function handlePointerEnd() {
        clearPeekTimer();
        onPeekChange(false);
    }

    function select(elementId: string) {
        if (didPeek.current) return;
        onSelectRegion(elementId);
    }

    const headerValues = valuesFor('page-header');
    const blockValues = valuesFor('block-header');
    const buttonValues = valuesFor('button');
    const fieldValues = valuesFor('field');
    const emptyValues = valuesFor('empty-state');
    const filterValues = valuesFor('radio-segmented');
    const tableValues = valuesFor('table');
    const modalHeaderValues = valuesFor('modal-header');
    const density = filterValues.density === 'compact' ? 'compact' : 'comfortable';

    const filter = (
        <RegionHit
            label="Selector de opciones"
            selected={selectedId === 'radio-segmented'}
            dimmed={dim('radio-segmented')}
            onSelect={() => select('radio-segmented')}
        >
            <PetroleumSegmented
                instance={`ds-scene-filter-${scene}`}
                density={density}
                value="hoy"
                onChange={() => undefined}
                aria-label="Periodo"
                options={[
                    { value: 'hoy', label: 'Hoy' },
                    { value: 'semana', label: 'Semana' },
                    { value: 'mes', label: 'Mes' },
                ]}
            />
        </RegionHit>
    );

    const pageHeader = (
        <RegionHit
            label="Cabecera de página"
            selected={selectedId === 'page-header'}
            dimmed={dim('page-header')}
            onSelect={() => select('page-header')}
        >
            <StudioHeaderFrame
                title={def.title}
                action={def.action}
                values={headerValues}
                petroleum
            />
        </RegionHit>
    );

    const body = (() => {
        if (scene === 'list') {
            return (
                <>
                    {filter}
                    <RegionHit
                        label="Estado vacío"
                        selected={selectedId === 'empty-state'}
                        dimmed={dim('empty-state')}
                        onSelect={() => select('empty-state')}
                    >
                        <div
                            data-studio-preview="empty"
                            style={styleOf('empty-state', emptyValues)}
                        >
                            <EmptyState
                                instance="ds-scene-empty"
                                variant="none"
                                title="Aún no hay albaranes"
                                description="Cuando llegue el primero, aparecerá aquí."
                            />
                        </div>
                    </RegionHit>
                    <RegionHit
                        label="Botón"
                        selected={selectedId === 'button'}
                        dimmed={dim('button')}
                        onSelect={() => select('button')}
                    >
                        <div
                            className="shrink-0"
                            data-studio-preview="button"
                            style={styleOf('button', buttonValues)}
                        >
                            <Button variant="primary" instance="ds-scene-nuevo">
                                Nuevo
                            </Button>
                        </div>
                    </RegionHit>
                </>
            );
        }

        if (scene === 'detail') {
            return (
                <>
                    <RegionHit
                        label="Aviso"
                        selected={selectedId === 'notice'}
                        dimmed={dim('notice')}
                        onSelect={() => select('notice')}
                    >
                        <Notice instance="ds-scene-notice" variant="info" title="Contrato">
                            Revisa las condiciones antes de firmar.
                        </Notice>
                    </RegionHit>
                    <Surface variant="block" instance="ds-scene-block">
                        <RegionHit
                            label="Cabecera de tarjeta"
                            selected={selectedId === 'block-header'}
                            dimmed={dim('block-header')}
                            onSelect={() => select('block-header')}
                        >
                            <StudioHeaderFrame
                                title="Contrato"
                                showBack={false}
                                petroleum={false}
                                values={{
                                    ...blockValues,
                                    'title-size': blockValues['title-size'] ?? 'tipo.minimo',
                                }}
                            />
                        </RegionHit>
                        <RegionHit
                            label="Fila de listado"
                            selected={selectedId === 'document-list-row'}
                            dimmed={dim('document-list-row')}
                            onSelect={() => select('document-list-row')}
                        >
                            <ul className="m-0 p-0">
                                <DocumentListRow
                                    instance="ds-scene-row"
                                    title="Anexo 2026"
                                    subtitle="PDF"
                                    onOpen={() => undefined}
                                />
                            </ul>
                        </RegionHit>
                    </Surface>
                    <RegionHit
                        label="Botón"
                        selected={selectedId === 'button'}
                        dimmed={dim('button')}
                        onSelect={() => select('button')}
                    >
                        <div
                            className="shrink-0"
                            data-studio-preview="button"
                            style={styleOf('button', buttonValues)}
                        >
                            <Button variant="primary" instance="ds-scene-detail-ok">
                                Guardar
                            </Button>
                        </div>
                    </RegionHit>
                </>
            );
        }

        if (scene === 'form') {
            return (
                <>
                    <RegionHit
                        label="Campo"
                        selected={selectedId === 'field'}
                        dimmed={dim('field')}
                        onSelect={() => select('field')}
                    >
                        <div
                            data-studio-preview="field"
                            style={styleOf('field', fieldValues)}
                        >
                            <Field instance="ds-scene-field" label="Nombre" htmlFor="ds-scene-field">
                                <input id="ds-scene-field" defaultValue="Ana" readOnly />
                            </Field>
                        </div>
                    </RegionHit>
                    <RegionHit
                        label="Botón"
                        selected={selectedId === 'button'}
                        dimmed={dim('button')}
                        onSelect={() => select('button')}
                    >
                        <div
                            className="shrink-0"
                            data-studio-preview="button"
                            style={styleOf('button', buttonValues)}
                        >
                            <Button variant="primary" instance="ds-scene-form-ok" layout="fill">
                                Guardar
                            </Button>
                        </div>
                    </RegionHit>
                </>
            );
        }

        if (scene === 'table') {
            return (
                <>
                    {filter}
                    <RegionHit
                        label="Tabla"
                        selected={selectedId === 'table'}
                        dimmed={dim('table')}
                        onSelect={() => select('table')}
                    >
                        <div
                            className="overflow-x-auto"
                            data-studio-preview="table"
                            style={styleOf('table', tableValues)}
                        >
                            <table className="w-full text-[14px]">
                                <thead className="bg-ds-marca text-ds-texto-invertido">
                                    <tr>
                                        <th className="text-left font-black uppercase text-[11px] tracking-widest px-ds-3 py-ds-2">
                                            Persona
                                        </th>
                                        <th className="text-right font-black uppercase text-[11px] tracking-widest px-ds-3 py-ds-2">
                                            Importe
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-ds-borde">
                                        <td className="px-ds-3 py-ds-3">Ana</td>
                                        <td className="px-ds-3 py-ds-3 text-right tabular-nums">1.280 €</td>
                                    </tr>
                                    <tr>
                                        <td className="px-ds-3 py-ds-3">Luis</td>
                                        <td className="px-ds-3 py-ds-3 text-right tabular-nums">960 €</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </RegionHit>
                    <RegionHit
                        label="Botón"
                        selected={selectedId === 'button'}
                        dimmed={dim('button')}
                        onSelect={() => select('button')}
                    >
                        <div
                            className="shrink-0"
                            data-studio-preview="button"
                            style={styleOf('button', buttonValues)}
                        >
                            <Button variant="tertiary" instance="ds-scene-table-ver">
                                Ver
                            </Button>
                        </div>
                    </RegionHit>
                </>
            );
        }

        return (
            <div className="relative space-y-ds-4">
                <div className="opacity-40 pointer-events-none">
                    <EmptyState
                        instance="ds-scene-modal-bg"
                        variant="none"
                        title="Aún no hay albaranes"
                        description="La ventana se abre encima."
                    />
                </div>
                <InlineModal
                    headerSelected={selectedId === 'modal-header'}
                    fieldSelected={selectedId === 'field'}
                    buttonSelected={selectedId === 'button'}
                    dimHeader={dim('modal-header')}
                    dimField={dim('field')}
                    dimButton={dim('button')}
                    headerValues={modalHeaderValues}
                    fieldValues={fieldValues}
                    buttonValues={buttonValues}
                    onSelect={select}
                />
            </div>
        );
    })();

    return (
        <div
            data-studio-scene={scene}
            data-peeking={peeking ? 'true' : 'false'}
            className="relative min-h-0"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onPointerLeave={handlePointerEnd}
        >
            <p className="pointer-events-none absolute right-ds-2 top-ds-2 z-20 m-0 text-[11px] font-black uppercase tracking-widest text-ds-texto-tenue">
                Estudio
            </p>
            <span
                className={`pointer-events-none absolute left-ds-2 top-ds-2 z-20 text-[11px] font-black uppercase tracking-widest ${
                    peeking ? 'bg-ds-marca text-ds-texto-invertido px-ds-2 py-ds-1' : 'text-ds-aviso'
                }`}
            >
                {peeking ? 'Oficial' : 'Ensayo'}
            </span>
            <Surface variant="page" instance="ds-studio-scene" className="overflow-hidden">
                {scene === 'modal' ? (
                    <StudioHeaderFrame title={def.title} values={headerValues} petroleum />
                ) : (
                    pageHeader
                )}
                <div data-element="body" className="p-ds-4 space-y-ds-4">
                    {body}
                </div>
            </Surface>
        </div>
    );
}
