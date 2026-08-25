'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/modal';
import { Notice } from '@/components/ui/Notice';
import { PetroleumSegmented } from '@/components/ui/PetroleumSegmented';
import { Surface } from '@/components/ui/Surface';
import type { StudioSnapshot } from '@/lib/design-system/canon/schema';
import { findOption } from '@/lib/design-system/visual-studio/allowed-values';
import { actualValues, hydrateElements, studioNavId } from '@/lib/design-system/visual-studio/catalog';
import { describeChanges, gateCanonDecision, gateProposalValues } from '@/lib/design-system/visual-studio/decision';
import type {
    ApplyResult,
    ImpactReport,
    PropertyValues,
    ProposalLane,
    StudioElement,
} from '@/lib/design-system/visual-studio/types';
import type { AuditReport, CanonHistoryEntry } from '@/lib/design-system/canon/schema';
import {
    auditStudioElement,
    confirmCanonDecision,
    discardStudioProposal,
    loadElementHistory,
    saveAsCanon,
    saveStudioProposal,
} from '../actions';
import { CanonMark, SampleLabel } from './catalog-kit';
import { HeaderTaxonomyList } from './header-taxonomy';
import { CanonicalCompositions, ElementPreview } from './studio-previews';

const NAV = [
    { id: 'foundations', label: 'FOUNDATIONS' },
    { id: 'components', label: 'COMPONENTS' },
    { id: 'patterns', label: 'PATTERNS' },
    { id: 'headers', label: 'HEADERS' },
    { id: 'compositions', label: 'COMPOSITIONS' },
    { id: 'canon', label: 'CANON' },
    { id: 'proposals', label: 'PROPOSALS' },
    { id: 'history', label: 'HISTORY' },
] as const;

type SectionId = (typeof NAV)[number]['id'];

function PropertyPicker({
    element,
    values,
    disabled,
    onChange,
}: {
    element: StudioElement;
    values: PropertyValues;
    disabled: boolean;
    onChange: (propertyId: string, next: string) => void;
}) {
    return (
        <div className="space-y-ds-4">
            {element.properties.map((property) => {
                const current = values[property.id] ?? property.actualId;
                const chosen = findOption(property.options, current);
                if (property.options.length <= 5) {
                    return (
                        <div key={property.id} className="space-y-ds-2">
                            <SampleLabel>{property.label}</SampleLabel>
                            <PetroleumSegmented
                                instance={`ds-prop-${element.id}-${property.id}`}
                                density="comfortable"
                                value={current}
                                onChange={(next) => {
                                    if (!disabled) onChange(property.id, next);
                                }}
                                aria-label={property.label}
                                options={property.options.map((option) => ({
                                    value: option.id,
                                    label: option.label.split(' · ')[0] ?? option.label,
                                }))}
                            />
                            {chosen?.note ? (
                                <p className="m-0 text-[12px] text-ds-texto-tenue">{chosen.note}</p>
                            ) : null}
                            {chosen?.requiresNewToken ? (
                                <Notice instance={`ds-token-${property.id}`} variant="warning" title="Nuevo token requerido">
                                    {chosen.value} no existe en TOKENS.md. Puedes guardarlo como propuesta, no como canon.
                                </Notice>
                            ) : null}
                            {chosen?.blocksCanon ? (
                                <Notice instance={`ds-block-${property.id}`} variant="warning" title="No congelable">
                                    {chosen.note ?? 'Incumple una ley ya cerrada.'}
                                </Notice>
                            ) : null}
                        </div>
                    );
                }
                return (
                    <Field
                        key={property.id}
                        instance={`ds-field-prop-${property.id}`}
                        label={property.label}
                        htmlFor={`ds-select-${element.id}-${property.id}`}
                    >
                        <select
                            id={`ds-select-${element.id}-${property.id}`}
                            value={current}
                            disabled={disabled}
                            onChange={(event) => onChange(property.id, event.target.value)}
                        >
                            {property.options.map((option) => (
                                <option key={option.id} value={option.id}>
                                    {option.label}
                                    {option.requiresNewToken ? ' · nuevo token' : ''}
                                </option>
                            ))}
                        </select>
                    </Field>
                );
            })}
        </div>
    );
}

function migrationPrompt(element: StudioElement, pending: AuditReport['pending']): string {
    const list = pending.map((hit, index) => `${index + 1}. ${hit.file} — ${hit.reason}`).join('\n');
    return `MIGRAR AL CANON
Elemento: ${element.label}
Estado del canon: ${element.status}

Inspecciona cada consumidor. Aplica el componente o patrón correcto.
Respeta la lógica existente. No cambies funcionalidad.
No hagas reemplazos masivos por regex.
Ejecuta tests y vuelve a auditar.

CONSUMIDORES PENDIENTES
${list || 'Ninguno.'}
`;
}

export function DesignSystemStudio({
    snapshot: initialSnapshot,
}: {
    snapshot: StudioSnapshot;
    elements?: StudioElement[];
}) {
    const router = useRouter();
    const [snapshot, setSnapshot] = useState(initialSnapshot);
    const [section, setSection] = useState<SectionId>('components');
    const [selectedId, setSelectedId] = useState('field');
    const [lane, setLane] = useState<ProposalLane>('a');
    const [proposalA, setProposalA] = useState<PropertyValues>({});
    const [proposalB, setProposalB] = useState<PropertyValues>({});
    const [reviewing, setReviewing] = useState(false);
    const [saveOpen, setSaveOpen] = useState(false);
    const [impact, setImpact] = useState<ImpactReport | null>(null);
    const [audit, setAudit] = useState<AuditReport | null>(null);
    const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
    const [history, setHistory] = useState<Array<{ hash: string; date: string; subject: string }>>([]);
    const [canonHistory, setCanonHistory] = useState<CanonHistoryEntry[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [proposalSaved, setProposalSaved] = useState(false);
    const [pending, startTransition] = useTransition();

    const elements = useMemo(() => hydrateElements(snapshot.registry.elements), [snapshot]);

    const element = elements.find((item) => item.id === selectedId) ?? elements[0]!;
    const actual = useMemo(() => actualValues(element), [element]);
    const laneValues =
        lane === 'actual' ? actual : lane === 'a' ? { ...actual, ...proposalA } : { ...actual, ...proposalB };
    const frozen = element.status === 'CANON CERRADO';
    const inherited = element.status === 'HEREDADO' || Boolean(element.inherits);
    const readOnlyKind =
        element.status === 'DEPRECADO' || element.status === 'ESPECIALIZADO' || inherited;
    const canEdit =
        lane !== 'actual' &&
        !readOnlyKind &&
        element.applyKind !== 'unavailable' &&
        !element.redirectTo &&
        (!frozen || reviewing);
    const gate = gateCanonDecision(element, laneValues, { allowRevisionProposal: reviewing });
    const proposalGate = gateProposalValues(element, laneValues);
    const changes = describeChanges(element, laneValues);
    const canSaveProposal = canEdit && element.properties.length > 0;
    const canSaveCanon =
        canSaveProposal &&
        gate.ok &&
        element.promotePolicy !== 'proposal-only' &&
        !inherited &&
        (element.status === 'BORRADOR / PROPUESTA' ||
            element.status === 'SIN CANON' ||
            (frozen && reviewing));

    useEffect(() => {
        setSnapshot(initialSnapshot);
    }, [initialSnapshot]);

    useEffect(() => {
        const savedA = snapshot.proposals[element.id]?.a?.values;
        const savedB = snapshot.proposals[element.id]?.b?.values;
        setProposalA(savedA ?? actualValues(element));
        setProposalB(savedB ?? actualValues(element));
        setApplyResult(null);
        setError(null);
        setProposalSaved(false);
        startTransition(() => {
            void loadElementHistory(element.id).then((result) => {
                if (result.ok) {
                    setHistory(result.entries);
                    setCanonHistory(result.canonHistory);
                }
            });
            void auditStudioElement(element.id).then((result) => {
                if (result.ok) {
                    setAudit(result.audit);
                    setImpact(result.impact);
                }
            });
        });
        // snapshot.proposals[id] refresca A/B si se guardó en servidor
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [element.id, snapshot.proposals[element.id]?.a?.updatedAt, snapshot.proposals[element.id]?.b?.updatedAt]);

    useEffect(() => {
        setReviewing(false);
        setLane(element.status === 'CANON CERRADO' ? 'actual' : 'a');
    }, [element.id, element.status]);

    const visible = elements.filter((item) => {
        if (section === 'compositions' || section === 'history') return false;
        if (section === 'canon') return item.status === 'CANON CERRADO' && !item.inherits && !item.redirectTo;
        if (section === 'proposals') {
            if (item.redirectTo || item.inherits) return false;
            return Boolean(snapshot.proposals[item.id]) || item.status === 'BORRADOR / PROPUESTA' || item.status === 'SIN CANON';
        }
        return studioNavId(item) === section;
    });

    function setLaneValue(propertyId: string, next: string) {
        if (lane === 'a') setProposalA((prev) => ({ ...prev, [propertyId]: next }));
        if (lane === 'b') setProposalB((prev) => ({ ...prev, [propertyId]: next }));
        setProposalSaved(false);
    }

    function saveProposalNow() {
        if (lane === 'actual') return;
        setError(null);
        startTransition(() => {
            void saveStudioProposal({
                elementId: element.id,
                lane,
                values: laneValues,
            }).then((result) => {
                if (!result.ok) {
                    setError(result.message);
                    return;
                }
                setSnapshot(result.snapshot);
                setProposalSaved(true);
            });
        });
    }

    function openSaveCanon() {
        if (lane === 'actual') return;
        setError(null);
        startTransition(() => {
            void confirmCanonDecision({
                elementId: element.id,
                lane,
                values: laneValues,
                isRevision: frozen && reviewing,
            }).then((result) => {
                if (!result.ok) {
                    setError(result.message);
                    return;
                }
                setImpact(result.impact);
                setAudit(result.audit);
                setSaveOpen(true);
            });
        });
    }

    function confirmSave() {
        if (lane === 'actual') return;
        startTransition(() => {
            void saveAsCanon({
                elementId: element.id,
                lane,
                values: laneValues,
                isRevision: frozen && reviewing,
            }).then((result) => {
                setApplyResult(result);
                if (result.ok) {
                    setSaveOpen(false);
                    setReviewing(false);
                    router.refresh();
                } else setError(result.message);
            });
        });
    }

    return (
        <div className="min-h-screen pb-ds-8">
            <header className="sticky top-0 z-20 border-b border-white/20 bg-ds-marca text-ds-texto-invertido pt-[env(safe-area-inset-top)]">
                <div className="mx-auto max-w-4xl px-ds-4 py-ds-3 space-y-ds-2">
                    <p className="m-0 text-[11px] font-black uppercase tracking-[0.2em] opacity-80">
                        Design System Studio
                    </p>
                    <h1 className="m-0 text-[20px] font-black tracking-tight">Design System Marbella</h1>
                    <p className="m-0 text-[14px] leading-snug opacity-80">
                        CANON CERRADO es contrato obligatorio. Las propuestas no cambian la aplicación.
                    </p>
                    {!snapshot.writable ? (
                        <p className="m-0 text-[12px] text-ds-aviso-fondo">
                            {snapshot.writableReason ?? 'Este entorno no puede escribir el canon.'}
                        </p>
                    ) : null}
                </div>
                <nav aria-label="Secciones del estudio" className="overflow-x-auto border-t border-white/15">
                    <ul className="mx-auto flex max-w-4xl min-w-max gap-ds-1 px-ds-4 py-ds-1">
                        {NAV.map((item) => (
                            <li key={item.id} className="shrink-0">
                                <button
                                    type="button"
                                    className={`inline-flex min-h-ds-tactil items-center px-ds-3 text-[11px] font-black uppercase tracking-widest ${section === item.id ? 'bg-white/15' : 'text-ds-texto-invertido/90'}`}
                                    onClick={() => {
                                        setSection(item.id);
                                        if (item.id === 'headers') {
                                            const current = elements.find((el) => el.id === selectedId);
                                            if (!current || studioNavId(current) !== 'headers') {
                                                setSelectedId('page-header');
                                            }
                                        }
                                    }}
                                >
                                    {item.label}
                                </button>
                            </li>
                        ))}
                    </ul>
                </nav>
            </header>

            <div className="mx-auto max-w-4xl space-y-ds-6 p-ds-4 md:p-ds-8">
                {section === 'compositions' ? (
                    <CanonicalCompositions />
                ) : section === 'history' ? (
                    <Surface variant="block" instance="ds-history" className="p-ds-4 space-y-ds-4">
                        <h2 className="m-0 text-[20px] font-black">Historial</h2>
                        {snapshot.registry.history.length === 0 ? (
                            <p className="m-0 text-[14px] text-ds-texto">Aún no hay decisiones en el registro técnico.</p>
                        ) : (
                            <ul className="space-y-ds-3">
                                {[...snapshot.registry.history].reverse().map((entry) => (
                                    <li key={`${entry.elementId}-${entry.version}-${entry.at}`} className="text-[14px] text-ds-texto">
                                        <span className="font-bold">{entry.at}</span> · {entry.elementId} · v
                                        {entry.version} · {entry.kind}
                                        <span className="block text-[12px] text-ds-texto-tenue">
                                            {entry.fromStatus} → {entry.toStatus}
                                            {entry.changes
                                                .map((change) => ` · ${change.property}: ${change.from} → ${change.to}`)
                                                .join('')}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Surface>
                ) : (
                    <>
                        {section === 'headers' ? (
                            <HeaderTaxonomyList
                                elements={elements}
                                selectedId={selectedId}
                                onSelect={(item) => {
                                    if (item.redirectTo) {
                                        setSection('patterns');
                                        setSelectedId(item.redirectTo);
                                        setReviewing(false);
                                        return;
                                    }
                                    setSelectedId(item.id);
                                    setReviewing(false);
                                }}
                            />
                        ) : (
                            <ul className="grid grid-cols-1 gap-ds-2">
                                {visible.map((item) => (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedId(item.id);
                                                setReviewing(false);
                                            }}
                                            className={`flex w-full min-h-ds-tactil items-center justify-between gap-ds-3 px-ds-4 py-ds-3 border ${selectedId === item.id ? 'border-ds-marca bg-ds-superficie' : 'border-ds-borde bg-ds-superficie'}`}
                                        >
                                            <span className="text-left min-w-0">
                                                <span className="block text-[16px] font-bold text-ds-texto-fuerte">
                                                    {item.label}
                                                </span>
                                                <span className="block text-[12px] text-ds-texto-tenue truncate">
                                                    {item.summary}
                                                </span>
                                            </span>
                                            <CanonMark status={item.status} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}

                        <Surface variant="block" instance="ds-elemento" className="p-ds-4 space-y-ds-6">
                            <div className="flex flex-wrap items-center gap-ds-2">
                                <h2 className="m-0 text-[20px] font-black text-ds-texto-fuerte">{element.label}</h2>
                                <CanonMark status={element.status} />
                            </div>
                            <p className="m-0 text-[14px] text-ds-texto">{element.summary}</p>
                            <p className="m-0 text-[12px] text-ds-texto-tenue">
                                Propagación:{' '}
                                {element.applyKind === 'css-contract'
                                    ? 'primitiva centralizada (un contrato CSS)'
                                    : element.applyKind === 'blueprint-only'
                                      ? 'patrón / receta (Blueprint + deuda de consumidores)'
                                      : element.applyKind === 'locked'
                                        ? 'contrato cerrado. Solo revisión.'
                                        : 'no se congela como token suelto'}
                            </p>

                            {element.warning ? (
                                <Notice instance="ds-header-warning" variant="warning" title="Impacto">
                                    {element.warning}
                                </Notice>
                            ) : null}

                            {inherited ? (
                                <Notice instance="ds-inherited" variant="info" title="Hereda Modal Header">
                                    Los modales derived utilizan el mismo contrato visual de cabecera que el
                                    Modal base. ADR-0009 define la subordinación del panel, no una segunda
                                    anatomía de cabecera.
                                </Notice>
                            ) : null}

                            {element.status === 'SIN CANON' ? (
                                <Notice instance="ds-no-canon" variant="info" title="Sin decisión canónica">
                                    Existe implementación visual, pero todavía no existe una decisión canónica.
                                </Notice>
                            ) : null}

                            {frozen && element.id === 'modal-header' ? (
                                <Notice instance="ds-modal-36" variant="info" title="Contrato cerrado · 36 px">
                                    No editable directamente. Puedes proponer una revisión; no se reabre el
                                    alto, el chrome ni el inset desde aquí.
                                </Notice>
                            ) : frozen ? (
                                <Notice instance="ds-locked" variant="info" title="Contrato obligatorio">
                                    No se edita el canon vigente. Proponer revisión crea una propuesta; la
                                    aplicación sigue con el contrato actual hasta que se apruebe.
                                </Notice>
                            ) : null}

                            {element.facts && element.facts.length > 0 ? (
                                <div className="space-y-ds-2">
                                    <SampleLabel>Anatomía</SampleLabel>
                                    <dl className="m-0 space-y-ds-2">
                                        {element.facts.map((fact) => (
                                            <div key={fact.label}>
                                                <dt className="text-[11px] font-black uppercase tracking-widest text-ds-texto-tenue">
                                                    {fact.label}
                                                </dt>
                                                <dd className="m-0 text-[14px] text-ds-texto">{fact.value}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                </div>
                            ) : null}

                            {element.examples && element.examples.length > 0 ? (
                                <div className="space-y-ds-2">
                                    <SampleLabel>Ver ejemplos / implementaciones</SampleLabel>
                                    <ul className="m-0 space-y-ds-1 text-[14px] text-ds-texto">
                                        {element.examples.map((example) => (
                                            <li key={example}>{example}</li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}

                            {element.properties.length > 0 ? (
                                <PetroleumSegmented
                                    instance="ds-lane"
                                    density="comfortable"
                                    value={lane}
                                    onChange={(next) => setLane(next as ProposalLane)}
                                    aria-label="Comparar propuesta"
                                    options={[
                                        { value: 'actual', label: 'Actual' },
                                        { value: 'a', label: 'A' },
                                        { value: 'b', label: 'B' },
                                    ]}
                                />
                            ) : null}

                            <div>
                                <SampleLabel>
                                    Preview · {lane === 'actual' ? 'canon vigente' : lane === 'a' ? 'propuesta A' : 'propuesta B'}
                                </SampleLabel>
                                <div className="border border-ds-borde bg-ds-superficie p-ds-4">
                                    <ElementPreview element={element} values={laneValues} />
                                </div>
                            </div>

                            {element.properties.length > 0 ? (
                                <PropertyPicker
                                    element={element}
                                    values={laneValues}
                                    disabled={!canEdit}
                                    onChange={setLaneValue}
                                />
                            ) : null}

                            {error ? (
                                <Notice instance="ds-error" variant="negative" title="No se puede guardar">
                                    {error}
                                </Notice>
                            ) : null}

                            {proposalSaved ? (
                                <Notice instance="ds-proposal-ok" variant="positive" title="Propuesta guardada">
                                    No ha cambiado la aplicación oficial ni el canon vigente.
                                </Notice>
                            ) : null}

                            {applyResult?.ok ? (
                                <Notice instance="ds-saved" variant="positive" title="CANON CERRADO">
                                    {applyResult.message}
                                </Notice>
                            ) : null}

                            <div className="flex flex-col gap-ds-2">
                                {canSaveProposal ? (
                                    <Button
                                        variant="secondary"
                                        instance="ds-save-proposal"
                                        layout="fill"
                                        disabled={pending || !proposalGate.ok || !snapshot.writable}
                                        loading={pending}
                                        onClick={saveProposalNow}
                                    >
                                        {element.promotePolicy === 'proposal-only'
                                            ? 'Proponer diseño'
                                            : 'Guardar propuesta'}
                                    </Button>
                                ) : null}
                                {canSaveCanon ? (
                                    <Button
                                        variant="primary"
                                        instance="ds-save"
                                        layout="fill"
                                        disabled={pending || !gate.ok || !snapshot.writable}
                                        loading={pending}
                                        onClick={openSaveCanon}
                                    >
                                        Guardar como canon
                                    </Button>
                                ) : null}
                                {frozen && !reviewing ? (
                                    <Button
                                        variant="secondary"
                                        instance="ds-review"
                                        layout="fill"
                                        onClick={() => {
                                            setReviewing(true);
                                            setLane('a');
                                        }}
                                    >
                                        Proponer revisión
                                    </Button>
                                ) : null}
                                {reviewing ? (
                                    <Button
                                        variant="tertiary"
                                        instance="ds-review-cancel"
                                        layout="fill"
                                        onClick={() => {
                                            setReviewing(false);
                                            setLane('actual');
                                        }}
                                    >
                                        Descartar revisión
                                    </Button>
                                ) : null}
                                {snapshot.proposals[element.id] ? (
                                    <Button
                                        variant="tertiary"
                                        instance="ds-discard-proposal"
                                        layout="fill"
                                        disabled={pending}
                                        onClick={() => {
                                            startTransition(() => {
                                                void discardStudioProposal(element.id).then((result) => {
                                                    if (result.ok) setSnapshot(result.snapshot);
                                                });
                                            });
                                        }}
                                    >
                                        Borrar propuestas
                                    </Button>
                                ) : null}
                                {!gate.ok && canSaveProposal ? (
                                    <p className="m-0 text-[12px] text-ds-aviso">{gate.reason}</p>
                                ) : null}
                            </div>

                            {impact && !impact.undetermined ? (
                                <p className="m-0 text-[14px] text-ds-texto">
                                    Impacto real: {impact.consumers} consumidores, {impact.routes} rutas,{' '}
                                    {impact.variants} variantes.
                                </p>
                            ) : null}

                            {audit ? (
                                <div className="space-y-ds-3">
                                    <SampleLabel>Auditoría</SampleLabel>
                                    <p className="m-0 text-[14px] text-ds-texto">
                                        ✓ {audit.conforming} consumidores ya conformes
                                        {audit.pending.length > 0
                                            ? ` · ⚠ ${audit.pending.length} pendientes de migración`
                                            : ''}
                                    </p>
                                    {audit.pending.length > 0 ? (
                                        <>
                                            <Notice instance="ds-debt" variant="warning" title="DEUDA DE IMPLEMENTACIÓN">
                                                El canon no cambia. Estos consumidores no usan la primitiva.
                                            </Notice>
                                            <ul className="m-0 space-y-ds-2 text-[12px] text-ds-texto">
                                                {audit.pending.slice(0, 8).map((hit) => (
                                                    <li key={hit.file}>
                                                        {hit.file}: {hit.reason}
                                                    </li>
                                                ))}
                                            </ul>
                                            <Field
                                                instance="ds-migrate-prompt"
                                                label="Prompt para migrar al canon"
                                                htmlFor="ds-migrate-prompt"
                                            >
                                                <textarea
                                                    id="ds-migrate-prompt"
                                                    readOnly
                                                    rows={8}
                                                    value={migrationPrompt(element, audit.pending)}
                                                />
                                            </Field>
                                        </>
                                    ) : null}
                                </div>
                            ) : null}

                            {canonHistory.length > 0 ? (
                                <div>
                                    <SampleLabel>Decisiones de este elemento</SampleLabel>
                                    <ul className="space-y-ds-2">
                                        {canonHistory.slice(-6).reverse().map((entry) => (
                                            <li key={`${entry.version}-${entry.at}`} className="text-[12px] text-ds-texto">
                                                {entry.at} · v{entry.version} · {entry.kind}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}

                            {history.length > 0 ? (
                                <div>
                                    <SampleLabel>Historial git</SampleLabel>
                                    <ul className="space-y-ds-2">
                                        {history.slice(0, 6).map((entry) => (
                                            <li key={entry.hash} className="text-[12px] text-ds-texto">
                                                <span className="font-bold">{entry.date}</span>{' '}
                                                {entry.hash} · {entry.subject}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}
                        </Surface>
                    </>
                )}
            </div>

            <Modal
                open={saveOpen}
                onClose={() => setSaveOpen(false)}
                title="Este cambio se convertirá en canon"
                instance="ds-save-canon"
                layer="system"
                variant="compact"
                disableUsageTracking
                footer={
                    <div className="flex flex-wrap gap-ds-2 justify-end">
                        <Button variant="secondary" instance="ds-save-cancel" onClick={() => setSaveOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            variant="primary"
                            instance="ds-save-confirm"
                            loading={pending}
                            onClick={confirmSave}
                        >
                            Convertir en canon
                        </Button>
                    </div>
                }
            >
                <div className="space-y-ds-4 text-[14px] text-ds-texto">
                    <p className="m-0">
                        <strong>{element.label}</strong>. El canon es obligatorio para todos los consumidores.
                    </p>
                    <ul className="m-0 pl-ds-4 space-y-ds-1">
                        {changes.length === 0 ? (
                            <li>Sin cambios de valor. Se cierra el contrato actual.</li>
                        ) : (
                            changes.map((change) => (
                                <li key={change.property}>
                                    {change.property}: {change.from} → {change.to}
                                </li>
                            ))
                        )}
                    </ul>
                    {impact?.undetermined ? (
                        <Notice instance="ds-impact-unknown" variant="warning" title="Impacto">
                            Impacto no determinado: no hay patrón de búsqueda fiable.
                        </Notice>
                    ) : (
                        <p className="m-0">
                            Impacto: {impact?.consumers ?? '—'} consumidores, {impact?.routes ?? '—'} rutas,{' '}
                            {impact?.variants ?? '—'} variantes.
                            {audit ? ` ${audit.conforming} ya conformes, ${audit.pending.length} pendientes.` : ''}
                        </p>
                    )}
                    <p className="m-0 text-[12px] text-ds-texto-tenue">
                        {element.applyKind === 'css-contract'
                            ? 'Se actualizarán el registro técnico, el Blueprint y el CSS del contrato único. Los nativos fuera de la pieza quedan como deuda.'
                            : element.applyKind === 'locked'
                              ? 'Se actualizarán el registro y el Blueprint. El CSS de esta pieza cerrada no se reescribe.'
                              : 'Se actualizarán el registro y el Blueprint. No hay componente único que reescribir en automático.'}
                    </p>
                </div>
            </Modal>
        </div>
    );
}
