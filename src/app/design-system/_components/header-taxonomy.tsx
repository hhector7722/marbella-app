'use client';

import { HEADER_SPECIALIZED_IDS } from '@/lib/design-system/visual-studio/catalog';
import type { StudioElement } from '@/lib/design-system/visual-studio/types';
import { UX_HEADER_TYPES } from '@/lib/design-system/visual-studio/ux-nav';
import { humanSummary, humanTitle, uxStatusOf } from '@/lib/design-system/visual-studio/ux-copy';
import { SampleLabel, UxStatusMark } from './catalog-kit';

function byId(elements: StudioElement[], id: string): StudioElement | undefined {
    return elements.find((item) => item.id === id);
}

function ChoiceCard({
    title,
    blurb,
    status,
    selected,
    onSelect,
}: {
    title: string;
    blurb: string;
    status: ReturnType<typeof uxStatusOf> | null;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <li>
            <button
                type="button"
                onClick={onSelect}
                className={`flex w-full min-h-ds-tactil items-center justify-between gap-ds-3 px-ds-4 py-ds-3 border shrink-0 ${selected ? 'border-ds-marca bg-ds-superficie' : 'border-ds-borde bg-ds-superficie'}`}
            >
                <span className="text-left min-w-0 flex-1">
                    <span className="block text-[16px] font-bold text-ds-texto-fuerte">{title}</span>
                    <span className="block text-[12px] text-ds-texto-tenue">{blurb}</span>
                </span>
                {status ? <UxStatusMark status={status} /> : null}
            </button>
        </li>
    );
}

export function HeaderTaxonomyList({
    elements,
    selectedId,
    onSelect,
}: {
    elements: StudioElement[];
    selectedId: string;
    onSelect: (item: StudioElement) => void;
}) {
    const specialized = HEADER_SPECIALIZED_IDS.map((id) => byId(elements, id)).filter(
        (item): item is StudioElement => Boolean(item)
    );

    return (
        <div className="space-y-ds-6">
            <div className="space-y-ds-2">
                <h2 className="m-0 text-[20px] font-black text-ds-texto-fuerte">Cabeceras</h2>
                <p className="m-0 text-[14px] text-ds-texto">¿Qué tipo de cabecera?</p>
            </div>
            <ul className="grid grid-cols-1 gap-ds-2">
                {UX_HEADER_TYPES.map((type) => {
                    const item = byId(elements, type.id);
                    if (!item) return null;
                    const target = type.targetId ? byId(elements, type.targetId) ?? item : item;
                    return (
                        <ChoiceCard
                            key={type.id}
                            title={type.label}
                            blurb={type.blurb}
                            status={uxStatusOf(item)}
                            selected={selectedId === item.id || selectedId === target.id}
                            onSelect={() => onSelect(item)}
                        />
                    );
                })}
            </ul>
            {specialized.length > 0 ? (
                <div className="space-y-ds-2">
                    <SampleLabel>Otras cabeceras</SampleLabel>
                    <p className="m-0 text-[12px] text-ds-texto-tenue">
                        Solo se usan en una pantalla. No son el diseño general.
                    </p>
                    <ul className="grid grid-cols-1 gap-ds-2">
                        {specialized.map((item) => (
                            <ChoiceCard
                                key={item.id}
                                title={humanTitle(item)}
                                blurb={humanSummary(item)}
                                status={uxStatusOf(item)}
                                selected={selectedId === item.id}
                                onSelect={() => onSelect(item)}
                            />
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}
