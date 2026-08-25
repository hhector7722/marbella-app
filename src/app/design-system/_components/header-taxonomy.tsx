'use client';

import {
    HEADER_DERIVED_ID,
    HEADER_PRIMARY_IDS,
    HEADER_SPECIALIZED_IDS,
} from '@/lib/design-system/visual-studio/catalog';
import type { StudioElement } from '@/lib/design-system/visual-studio/types';
import { CanonMark, SampleLabel } from './catalog-kit';

function byId(elements: StudioElement[], id: string): StudioElement | undefined {
    return elements.find((item) => item.id === id);
}

function HeaderCard({
    item,
    selected,
    indented,
    onSelect,
}: {
    item: StudioElement;
    selected: boolean;
    indented?: boolean;
    onSelect: (item: StudioElement) => void;
}) {
    const mark =
        item.redirectTo === 'table' ? (
            <span className="inline-flex items-center px-ds-2 py-ds-1 text-[11px] font-black uppercase tracking-widest border shrink-0 bg-ds-superficie-inactiva text-ds-texto-fuerte border-ds-borde-marcado">
                → T8
            </span>
        ) : item.inherits ? (
            <CanonMark status="HEREDADO" />
        ) : (
            <CanonMark status={item.status} />
        );

    return (
        <li className={indented ? 'pl-ds-6' : undefined}>
            <button
                type="button"
                onClick={() => onSelect(item)}
                className={`flex w-full min-h-ds-tactil items-center justify-between gap-ds-3 px-ds-4 py-ds-3 border ${selected ? 'border-ds-marca bg-ds-superficie' : 'border-ds-borde bg-ds-superficie'}`}
            >
                <span className="text-left min-w-0">
                    <span className="block text-[16px] font-bold text-ds-texto-fuerte">
                        {item.inherits ? `↳ ${item.label}` : item.label}
                    </span>
                    <span className="block text-[12px] text-ds-texto-tenue truncate">
                        {item.listSummary ?? item.summary}
                    </span>
                </span>
                {mark}
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
    const primary = HEADER_PRIMARY_IDS.map((id) => byId(elements, id)).filter(
        (item): item is StudioElement => Boolean(item)
    );
    const derived = byId(elements, HEADER_DERIVED_ID);
    const specialized = HEADER_SPECIALIZED_IDS.map((id) => byId(elements, id)).filter(
        (item): item is StudioElement => Boolean(item)
    );

    return (
        <div className="space-y-ds-4">
            <ul className="grid grid-cols-1 gap-ds-2">
                {primary.map((item) => (
                    <HeaderCard
                        key={item.id}
                        item={item}
                        selected={selectedId === item.id}
                        onSelect={onSelect}
                    />
                ))}
                {derived ? (
                    <HeaderCard
                        item={derived}
                        selected={selectedId === derived.id}
                        indented
                        onSelect={onSelect}
                    />
                ) : null}
            </ul>
            <div className="space-y-ds-2">
                <SampleLabel>Specialized</SampleLabel>
                <ul className="grid grid-cols-1 gap-ds-2">
                    {specialized.map((item) => (
                        <HeaderCard
                            key={item.id}
                            item={item}
                            selected={selectedId === item.id}
                            onSelect={onSelect}
                        />
                    ))}
                </ul>
            </div>
        </div>
    );
}
