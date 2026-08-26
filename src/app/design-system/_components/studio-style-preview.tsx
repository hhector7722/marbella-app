'use client';

import { useRef, type CSSProperties, type PointerEvent } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/Field';
import { PetroleumSegmented } from '@/components/ui/PetroleumSegmented';
import { getStudioElement } from '@/lib/design-system/visual-studio/catalog';
import type { PropertyValues } from '@/lib/design-system/visual-studio/types';
import type { StyleType } from '@/lib/design-system/visual-studio/ux-styles';
import { previewStyle, StudioHeaderFrame } from './studio-previews';

const PEEK_MS = 400;

function styleOf(elementId: string, values: PropertyValues): CSSProperties | undefined {
    const element = getStudioElement(elementId);
    if (!element) return undefined;
    return previewStyle(element, values);
}

export function StudioStylePreview({
    styleType,
    peeking,
    valuesFor,
    onPeekChange,
}: {
    styleType: StyleType;
    peeking: boolean;
    valuesFor: (elementId: string) => PropertyValues;
    onPeekChange: (peeking: boolean) => void;
}) {
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    function startPeek(event: PointerEvent<HTMLDivElement>) {
        if (event.pointerType === 'mouse' && event.buttons !== 1) return;
        timer.current = setTimeout(() => onPeekChange(true), PEEK_MS);
    }

    function endPeek() {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        onPeekChange(false);
    }

    const pageHeader = valuesFor('page-header');
    const modalHeader = valuesFor('modal-header');
    const button = valuesFor('button');
    const field = valuesFor('field');
    const highlight = styleType.id;
    const buttonStyle = styleOf('button', button);
    const fieldStyle = styleOf('field', field);
    const modalStyle = styleOf('modal-header', modalHeader);

    return (
        <div
            data-studio-preview="styles"
            className="select-none"
            onPointerDown={startPeek}
            onPointerUp={endPeek}
            onPointerCancel={endPeek}
            onPointerLeave={endPeek}
            style={{ ...buttonStyle, ...modalStyle } as CSSProperties}
        >
            {styleType.preview === 'modal' ? (
                <ModalGarment
                    headerValues={modalHeader}
                    fieldStyle={fieldStyle}
                    highlight={highlight}
                />
            ) : (
                <PageGarment
                    headerValues={pageHeader}
                    fieldStyle={fieldStyle}
                    highlight={highlight}
                />
            )}
            <p className="m-0 mt-ds-2 text-center text-[12px] text-ds-texto-tenue">
                {peeking ? 'Diseño oficial' : 'Mantén pulsado para ver lo oficial'}
            </p>
        </div>
    );
}

function PageGarment({
    headerValues,
    fieldStyle,
    highlight,
}: {
    headerValues: PropertyValues;
    fieldStyle?: CSSProperties;
    highlight: string;
}) {
    return (
        <div className="overflow-hidden border border-ds-borde bg-ds-superficie shadow-ds-pagina">
            <div className={ring(highlight === 'page-header')}>
                <StudioHeaderFrame title="Albaranes" action="+" values={headerValues} />
            </div>
            <div className="space-y-ds-4 p-ds-4">
                <div className={ring(highlight === 'field')} data-studio-preview="field" style={fieldStyle}>
                    <Field instance="ds-style-field" label="Proveedor" htmlFor="ds-style-field">
                        <input id="ds-style-field" defaultValue="Acme" readOnly />
                    </Field>
                </div>
                <div className={ring(highlight === 'selector')}>
                    <PetroleumSegmented
                        instance="ds-style-selector"
                        density="comfortable"
                        value="hoy"
                        onChange={() => undefined}
                        aria-label="Periodo"
                        options={[
                            { value: 'hoy', label: 'Hoy' },
                            { value: 'semana', label: 'Semana' },
                        ]}
                    />
                </div>
                <div className="flex flex-wrap items-center justify-end gap-ds-2" data-studio-preview="button">
                    <span className={ring(highlight === 'button-filter')}>
                        <Button
                            variant="tertiary"
                            instance="ds-style-filter"
                            aria-label="Filtrar"
                            icon={<Filter size={20} strokeWidth={2.5} />}
                        />
                    </span>
                    <span className={ring(highlight === 'button-cancel')}>
                        <Button variant="secondary" instance="ds-style-cancel">
                            Cancelar
                        </Button>
                    </span>
                    <span className={ring(highlight === 'button-destroy')}>
                        <Button variant="destructive" instance="ds-style-destroy">
                            Eliminar
                        </Button>
                    </span>
                    <span className={ring(highlight === 'button-save')}>
                        <Button variant="primary" instance="ds-style-save">
                            Guardar
                        </Button>
                    </span>
                </div>
            </div>
        </div>
    );
}

function ModalGarment({
    headerValues,
    fieldStyle,
    highlight,
}: {
    headerValues: PropertyValues;
    fieldStyle?: CSSProperties;
    highlight: string;
}) {
    const align = headerValues['align-x'] ?? 'left';
    return (
        <div className="mx-auto max-w-[22rem] overflow-hidden rounded-ds-superficie border border-ds-borde bg-ds-superficie shadow-ds-modal">
            <div
                className={`flex h-ds-modal-header max-h-ds-modal-header min-h-ds-modal-header items-center bg-ds-marca px-[var(--modal-header-inset,var(--espacio-4))] text-ds-texto-invertido ${ring(highlight === 'modal-header')}`}
                data-element="header"
                data-align-x={align}
                style={{
                    justifyContent: align === 'center' ? 'center' : 'space-between',
                }}
            >
                <p className="m-0 min-w-0 truncate text-[14px] font-black uppercase tracking-wider">Pedido</p>
                <span
                    aria-hidden
                    className="flex h-full w-[var(--modal-header-height)] shrink-0 items-center justify-center"
                >
                    <X size={16} strokeWidth={2.5} />
                </span>
            </div>
            <div className="space-y-ds-4 p-ds-4">
                <div data-studio-preview="field" style={fieldStyle}>
                    <Field instance="ds-style-modal-field" label="Notas" htmlFor="ds-style-modal-field">
                        <input id="ds-style-modal-field" defaultValue="Sin gluten" readOnly />
                    </Field>
                </div>
                <div className="flex flex-wrap justify-end gap-ds-2" data-studio-preview="button">
                    <Button variant="secondary" instance="ds-style-modal-cancel">
                        Cancelar
                    </Button>
                    <Button variant="primary" instance="ds-style-modal-ok">
                        Guardar
                    </Button>
                </div>
            </div>
        </div>
    );
}

function ring(on: boolean): string {
    return on ? 'outline outline-2 outline-offset-[-2px] outline-ds-marca' : '';
}
