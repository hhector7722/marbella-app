'use client';

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { PetroleumSegmented } from '@/components/ui/PetroleumSegmented';
import { Surface } from '@/components/ui/Surface';
import type { StudioSnapshot } from '@/lib/design-system/canon/schema';
import { actualValues, hydrateElements } from '@/lib/design-system/visual-studio/catalog';
import { describeChanges, gateCanonDecision, gateProposalValues } from '@/lib/design-system/visual-studio/decision';
import type {
    ApplyResult,
    ImpactReport,
    PropertyValues,
    StudioElement,
} from '@/lib/design-system/visual-studio/types';
import type { AuditReport } from '@/lib/design-system/canon/schema';
import {
    canDesignInPrimaryPath,
    defaultSceneForElement,
    HEADER_CHOICES,
    LOOK_SHORTCUTS,
    lockedPrimaryCopy,
    resolveSceneTarget,
    STUDIO_SCENES,
    type StudioSceneId,
    type StudioScreen,
    valuesEqual,
} from '@/lib/design-system/visual-studio/ux-scenes';
import {
    formatStudioStamp,
    humanConsumerName,
    humanDebtLead,
    humanGateReason,
    humanImpactLead,
    humanPublishResult,
    humanSummary,
    humanTitle,
    humanWarning,
    uxStatusHint,
    uxStatusOf,
} from '@/lib/design-system/visual-studio/ux-copy';
import {
    auditStudioElement,
    confirmCanonDecision,
    discardStudioProposal,
    saveAsCanon,
    saveStudioProposal,
} from '../actions';
import { CanonMark, UxStatusMark } from './catalog-kit';
import { StudioLivingScene } from './studio-scene';
import { ElementPreview } from './studio-previews';
import { VisualPropertyList } from './visual-controls';

function draftsFromSnapshot(
    elements: StudioElement[],
    snapshot: StudioSnapshot
): Record<string, PropertyValues> {
    const next: Record<string, PropertyValues> = {};
    for (const element of elements) {
        next[element.id] = snapshot.proposals[element.id]?.a?.values ?? actualValues(element);
    }
    return next;
}

function migrationPrompt(element: StudioElement, pending: AuditReport['pending']): string {
    const list = pending.map((hit, index) => `${index + 1}. ${humanConsumerName(hit.file)}`).join('\n');
    return `MIGRAR AL DISEÑO OFICIAL
Elemento: ${humanTitle(element)}

Inspecciona cada consumidor. Aplica el componente o patrón correcto.
Respeta la lógica existente. No cambies funcionalidad.
No hagas reemplazos masivos por regex.
Ejecuta tests y vuelve a auditar.

SITIOS PENDIENTES
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
    const [screen, setScreen] = useState<StudioScreen>('scene');
    const [scene, setScene] = useState<StudioSceneId>('list');
    const [selectedId, setSelectedId] = useState('page-header');
    const [searchQuery, setSearchQuery] = useState('');
    const [peeking, setPeeking] = useState(false);
    const [choosingHeader, setChoosingHeader] = useState(false);
    const [isolated, setIsolated] = useState(false);
    const [reviewing, setReviewing] = useState(false);
    const [impact, setImpact] = useState<ImpactReport | null>(null);
    const [audit, setAudit] = useState<AuditReport | null>(null);
    const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [proposalSaved, setProposalSaved] = useState(false);
    const [techOpen, setTechOpen] = useState(false);
    const [debtOpen, setDebtOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const elements = useMemo(() => hydrateElements(snapshot.registry.elements), [snapshot]);
    const [drafts, setDrafts] = useState(() => draftsFromSnapshot(elements, snapshot));

    const element = elements.find((item) => item.id === selectedId) ?? elements[0]!;
    const actual = useMemo(() => actualValues(element), [element]);
    const proposalValues = { ...actual, ...(drafts[element.id] ?? {}) };
    const uxStatus = uxStatusOf(element);
    const frozen = element.status === 'CANON CERRADO';
    const inherited = element.status === 'HEREDADO' || Boolean(element.inherits);
    const readOnlyKind =
        element.status === 'DEPRECADO' || element.status === 'ESPECIALIZADO' || inherited;
    const canEdit =
        !readOnlyKind &&
        element.applyKind !== 'unavailable' &&
        !element.redirectTo &&
        (!frozen || reviewing);
    const gate = gateCanonDecision(element, proposalValues, { allowRevisionProposal: reviewing });
    const proposalGate = gateProposalValues(element, proposalValues);
    const changes = describeChanges(element, proposalValues);
    const canSaveProposal = canEdit && element.properties.length > 0;
    const canMakeOfficial =
        canSaveProposal &&
        gate.ok &&
        element.promotePolicy !== 'proposal-only' &&
        !inherited &&
        (element.status === 'BORRADOR / PROPUESTA' ||
            element.status === 'SIN CANON' ||
            (frozen && reviewing));
    const savedLane = snapshot.proposals[element.id]?.a;
    const dirtyUnsaved = !valuesEqual(proposalValues, savedLane?.values ?? actual);
    const hasSavedEssay = Boolean(savedLane);
    const lockedCopy = lockedPrimaryCopy(element);

    useEffect(() => {
        setSnapshot(initialSnapshot);
        setDrafts(draftsFromSnapshot(hydrateElements(initialSnapshot.registry.elements), initialSnapshot));
    }, [initialSnapshot]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const pieza = params.get('pieza');
        if (!pieza) return;
        openRegion(pieza, { fromUrl: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        setApplyResult(null);
        setError(null);
        setProposalSaved(false);
        setTechOpen(false);
        setDebtOpen(false);
        setIsolated(false);
        const saved = snapshot.proposals[element.id]?.a;
        setReviewing(element.status === 'CANON CERRADO' && Boolean(saved));
        startTransition(() => {
            void auditStudioElement(element.id).then((result) => {
                if (result.ok) {
                    setAudit(result.audit);
                    setImpact(result.impact);
                }
            });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [element.id]);

    useEffect(() => {
        if (!element.id) return;
        startTransition(() => {
            void auditStudioElement(element.id).then((result) => {
                if (result.ok) {
                    setAudit(result.audit);
                    setImpact(result.impact);
                }
            });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [snapshot.proposals[element.id]?.a?.updatedAt]);

    function valuesFor(elementId: string): PropertyValues {
        const item = elements.find((entry) => entry.id === elementId);
        if (!item) return {};
        const base = actualValues(item);
        if (peeking) return base;
        return { ...base, ...(drafts[elementId] ?? {}) };
    }

    function goScene() {
        setScreen('scene');
        setChoosingHeader(false);
        setPeeking(false);
        setError(null);
    }

    function openRegion(id: string, opts?: { fromUrl?: boolean }) {
        const target = resolveSceneTarget(id);
        const item = elements.find((entry) => entry.id === target);
        if (!item) return;
        setSelectedId(item.id);
        setScene(defaultSceneForElement(id));
        setChoosingHeader(id === 'page-header' && !opts?.fromUrl);
        setScreen('sheet');
        setReviewing(item.status === 'CANON CERRADO' && Boolean(snapshot.proposals[item.id]?.a));
    }

    function openHeaderChoice(choiceId: string) {
        const target = resolveSceneTarget(choiceId);
        const item = elements.find((entry) => entry.id === target);
        if (!item) return;
        setSelectedId(item.id);
        setChoosingHeader(false);
        if (choiceId === 'table-header' || target === 'table') setScene('table');
        else if (choiceId === 'modal-header') setScene('modal');
        else if (choiceId === 'block-header') setScene('detail');
        else setScene('list');
        setReviewing(item.status === 'CANON CERRADO' && Boolean(snapshot.proposals[item.id]?.a));
    }

    function setProposalValue(propertyId: string, next: string) {
        setDrafts((prev) => ({
            ...prev,
            [element.id]: { ...actual, ...(prev[element.id] ?? {}), [propertyId]: next },
        }));
        setProposalSaved(false);
    }

    function saveProposalNow() {
        setError(null);
        startTransition(() => {
            void saveStudioProposal({
                elementId: element.id,
                lane: 'a',
                values: proposalValues,
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

    function openConfirm() {
        setError(null);
        startTransition(() => {
            void confirmCanonDecision({
                elementId: element.id,
                lane: 'a',
                values: proposalValues,
                isRevision: frozen && reviewing,
            }).then((result) => {
                if (!result.ok) {
                    setError(result.message);
                    return;
                }
                setImpact(result.impact);
                setAudit(result.audit);
                setScreen('confirm');
            });
        });
    }

    function confirmOfficial() {
        startTransition(() => {
            void saveAsCanon({
                elementId: element.id,
                lane: 'a',
                values: proposalValues,
                isRevision: frozen && reviewing,
            }).then((result) => {
                setApplyResult(result);
                if (result.ok) {
                    setReviewing(false);
                    setScreen('done');
                    router.refresh();
                } else setError(result.message);
            });
        });
    }

    const recentOfficial = [...snapshot.registry.history].reverse().slice(0, 8);
    const essays = Object.entries(snapshot.proposals)
        .map(([id, lanes]) => {
            const item = elements.find((entry) => entry.id === id);
            if (!item || !lanes.a) return null;
            return { item, updatedAt: lanes.a.updatedAt };
        })
        .filter((entry): entry is { item: StudioElement; updatedAt: string } => Boolean(entry));

    const title =
        screen === 'scene'
            ? 'Marbella · Estudio'
            : screen === 'look'
              ? 'Cambiar el look'
              : screen === 'essays'
                ? 'Ensayos'
                : screen === 'confirm'
                  ? 'Hacer oficial'
                  : screen === 'done'
                    ? 'Diseño actualizado'
                    : choosingHeader
                      ? 'Qué cabecera'
                      : humanTitle(element);

    const sheetOpen = screen === 'sheet';
    const showScene = screen === 'scene' || sheetOpen;

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-ds-superficie-inactiva">
            <header className="sticky top-0 z-20 shrink-0 border-b border-white/20 bg-ds-marca text-ds-texto-invertido pt-[env(safe-area-inset-top)]">
                <div className="flex items-center gap-ds-2 px-ds-4 py-ds-3">
                    {screen !== 'scene' ? (
                        <Button
                            variant="secondary"
                            instance="ds-back"
                            aria-label="Volver"
                            icon={<ArrowLeft size={20} strokeWidth={2.5} />}
                            onClick={() => {
                                if (screen === 'confirm' || screen === 'done') {
                                    setScreen('sheet');
                                    return;
                                }
                                goScene();
                            }}
                            className="shrink-0"
                        />
                    ) : null}
                    <div className="min-w-0 flex-1">
                        <p className="m-0 text-[11px] font-black uppercase tracking-[0.2em] opacity-80">
                            Estudio
                        </p>
                        <h1 className="m-0 truncate text-[20px] font-black tracking-tight">{title}</h1>
                    </div>
                </div>
                {!snapshot.writable ? (
                    <p className="m-0 px-ds-4 pb-ds-2 text-[12px] text-ds-aviso-fondo">
                        {snapshot.writableReason ?? 'Este entorno no puede guardar cambios.'}
                    </p>
                ) : null}
            </header>

            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                {showScene ? (
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <div className="shrink-0 space-y-ds-2 px-ds-4 pt-ds-3">
                            {screen === 'scene' ? (
                                <>
                                    <p className="m-0 text-[14px] text-ds-texto">
                                        Toca lo que quieras cambiar.
                                    </p>
                                    <p className="m-0 text-[12px] text-ds-texto-tenue">
                                        Esto es un ensayo. Marbella no cambia hasta que lo hagas oficial.
                                        Mantén pulsado para ver lo oficial.
                                    </p>
                                </>
                            ) : null}
                            {dirtyUnsaved && sheetOpen ? (
                                <Notice instance="ds-banner-dirty" variant="warning" title="No está guardado">
                                    El ensayo vive solo en esta pantalla hasta que lo guardes.
                                </Notice>
                            ) : null}
                            {hasSavedEssay && !dirtyUnsaved ? (
                                <Notice instance="ds-banner-essay" variant="info" title="Ensayo · no es Marbella">
                                    Este diseño no es el oficial hasta que lo hagas oficial.
                                </Notice>
                            ) : null}
                            <Field instance="ds-studio-search" label="Buscar" htmlFor="ds-studio-search">
                                <input
                                    id="ds-studio-search"
                                    type="search"
                                    value={searchQuery}
                                    placeholder="Cabecera, botón, campo…"
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                />
                            </Field>
                        </div>
                        <div className="min-h-0 flex-1 overflow-auto px-ds-4 py-ds-3">
                            <StudioLivingScene
                                scene={scene}
                                peeking={peeking}
                                selectedId={sheetOpen ? selectedId : null}
                                searchQuery={searchQuery}
                                valuesFor={valuesFor}
                                onSelectRegion={openRegion}
                                onPeekChange={setPeeking}
                            />
                        </div>
                        <div className="shrink-0 space-y-ds-3 border-t border-ds-borde px-ds-4 py-ds-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                            <PetroleumSegmented
                                instance="ds-studio-scene-ctx"
                                density="compact"
                                value={scene}
                                onChange={(next) => setScene(next as StudioSceneId)}
                                aria-label="Contexto de la escena"
                                options={STUDIO_SCENES.map((item) => ({
                                    value: item.id,
                                    label: item.label,
                                }))}
                            />
                            {screen === 'scene' ? (
                                <div className="grid grid-cols-2 gap-ds-2">
                                    <Button
                                        variant="secondary"
                                        instance="ds-open-look"
                                        layout="fill"
                                        onClick={() => setScreen('look')}
                                    >
                                        Look
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        instance="ds-open-essays"
                                        layout="fill"
                                        onClick={() => setScreen('essays')}
                                    >
                                        Ensayos
                                    </Button>
                                </div>
                            ) : (
                                <p className="m-0 text-[12px] text-ds-texto-tenue">
                                    Mantén pulsado para ver lo oficial
                                </p>
                            )}
                        </div>
                    </div>
                ) : null}

                {sheetOpen ? (
                    <aside className="flex h-[52dvh] shrink-0 flex-col overflow-hidden border-t border-ds-borde bg-ds-superficie md:h-auto md:w-[min(24rem,40%)] md:border-l md:border-t-0">
                        <SheetBody
                            element={element}
                            uxStatus={uxStatus}
                            proposalValues={proposalValues}
                            isolated={isolated}
                            setIsolated={setIsolated}
                            choosingHeader={choosingHeader}
                            canEdit={canEdit}
                            reviewing={reviewing}
                            frozen={frozen}
                            inherited={inherited}
                            lockedCopy={lockedCopy}
                            error={error}
                            proposalSaved={proposalSaved}
                            impact={impact}
                            audit={audit}
                            techOpen={techOpen}
                            setTechOpen={setTechOpen}
                            debtOpen={debtOpen}
                            setDebtOpen={setDebtOpen}
                            snapshot={snapshot}
                            pending={pending}
                            gateReason={!gate.ok && canSaveProposal ? humanGateReason(gate.reason) : null}
                            onChange={setProposalValue}
                            onChooseHeader={openHeaderChoice}
                            onCancelPropose={() => {
                                setReviewing(false);
                                setDrafts((prev) => ({ ...prev, [element.id]: actual }));
                            }}
                            onDiscardProposal={() => {
                                startTransition(() => {
                                    void discardStudioProposal(element.id).then((result) => {
                                        if (result.ok) {
                                            setSnapshot(result.snapshot);
                                            setDrafts((prev) => ({ ...prev, [element.id]: actual }));
                                        }
                                    });
                                });
                            }}
                            footer={
                                <SheetFooter
                                    frozen={frozen}
                                    reviewing={reviewing}
                                    readOnlyKind={readOnlyKind}
                                    canSaveProposal={canSaveProposal}
                                    canMakeOfficial={canMakeOfficial}
                                    pending={pending}
                                    writable={snapshot.writable}
                                    proposalGateOk={proposalGate.ok}
                                    gateOk={gate.ok}
                                    hasProperties={element.properties.length > 0}
                                    onPropose={() => setReviewing(true)}
                                    onSave={saveProposalNow}
                                    onOfficial={openConfirm}
                                />
                            }
                        />
                    </aside>
                ) : null}

                {screen === 'look' ? (
                    <LookScreen
                        onOpen={(elementId) => {
                            openRegion(elementId, { fromUrl: true });
                        }}
                    />
                ) : null}

                {screen === 'essays' ? (
                    <EssaysScreen
                        essays={essays}
                        recentOfficial={recentOfficial}
                        onOpen={(id) => openRegion(id, { fromUrl: true })}
                    />
                ) : null}

                {screen === 'confirm' ? (
                    <ConfirmScreen
                        element={element}
                        impact={impact}
                        audit={audit}
                        changes={changes}
                        error={error}
                        debtOpen={debtOpen}
                        setDebtOpen={setDebtOpen}
                        pending={pending}
                        writable={snapshot.writable}
                        onCancel={() => setScreen('sheet')}
                        onConfirm={confirmOfficial}
                    />
                ) : null}

                {screen === 'done' ? (
                    <DoneScreen
                        element={element}
                        impact={impact}
                        applyResult={applyResult}
                        audit={audit}
                        onSeeDebt={() => {
                            setDebtOpen(true);
                            setScreen('sheet');
                        }}
                        onHome={goScene}
                    />
                ) : null}
            </div>
        </div>
    );
}

function SheetFooter({
    frozen,
    reviewing,
    readOnlyKind,
    canSaveProposal,
    canMakeOfficial,
    pending,
    writable,
    proposalGateOk,
    gateOk,
    hasProperties,
    onPropose,
    onSave,
    onOfficial,
}: {
    frozen: boolean;
    reviewing: boolean;
    readOnlyKind: boolean;
    canSaveProposal: boolean;
    canMakeOfficial: boolean;
    pending: boolean;
    writable: boolean;
    proposalGateOk: boolean;
    gateOk: boolean;
    hasProperties: boolean;
    onPropose: () => void;
    onSave: () => void;
    onOfficial: () => void;
}) {
    return (
        <div className="shrink-0 space-y-ds-2 border-t border-ds-borde p-ds-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
            {frozen && !reviewing && !readOnlyKind && hasProperties ? (
                <Button variant="primary" instance="ds-propose" layout="fill" onClick={onPropose}>
                    Proponer cambio
                </Button>
            ) : null}
            {reviewing ? (
                <p className="m-0 text-[12px] text-ds-texto-tenue">
                    Estás trabajando sobre una copia. El diseño oficial no cambiará hasta que lo hagas
                    oficial.
                </p>
            ) : null}
            {canSaveProposal ? (
                <Button
                    variant={canMakeOfficial ? 'secondary' : 'primary'}
                    instance="ds-save-proposal"
                    layout="fill"
                    disabled={pending || !proposalGateOk || !writable}
                    loading={pending}
                    onClick={onSave}
                >
                    Guardar ensayo
                </Button>
            ) : null}
            {canMakeOfficial ? (
                <Button
                    variant="primary"
                    instance="ds-make-official"
                    layout="fill"
                    disabled={pending || !gateOk || !writable}
                    loading={pending}
                    onClick={onOfficial}
                >
                    Hacer oficial
                </Button>
            ) : null}
        </div>
    );
}

function SheetBody({
    element,
    uxStatus,
    proposalValues,
    isolated,
    setIsolated,
    choosingHeader,
    canEdit,
    reviewing,
    frozen,
    inherited,
    lockedCopy,
    error,
    proposalSaved,
    impact,
    audit,
    techOpen,
    setTechOpen,
    debtOpen,
    setDebtOpen,
    snapshot,
    pending,
    gateReason,
    onChange,
    onChooseHeader,
    onCancelPropose,
    onDiscardProposal,
    footer,
}: {
    element: StudioElement;
    uxStatus: ReturnType<typeof uxStatusOf>;
    proposalValues: PropertyValues;
    isolated: boolean;
    setIsolated: (next: boolean) => void;
    choosingHeader: boolean;
    canEdit: boolean;
    reviewing: boolean;
    frozen: boolean;
    inherited: boolean;
    lockedCopy: string | null;
    error: string | null;
    proposalSaved: boolean;
    impact: ImpactReport | null;
    audit: AuditReport | null;
    techOpen: boolean;
    setTechOpen: (open: boolean) => void;
    debtOpen: boolean;
    setDebtOpen: (open: boolean) => void;
    snapshot: StudioSnapshot;
    pending: boolean;
    gateReason: string | null;
    onChange: (propertyId: string, next: string) => void;
    onChooseHeader: (id: string) => void;
    onCancelPropose: () => void;
    onDiscardProposal: () => void;
    footer: ReactNode;
}) {
    const warning = humanWarning(element);
    const hint = uxStatusHint(uxStatus);
    const debt = humanDebtLead(audit?.pending.length ?? 0);

    return (
        <>
            <div className="min-h-0 flex-1 overflow-auto p-ds-4 space-y-ds-4">
                {choosingHeader ? (
                    <div className="space-y-ds-2">
                        <p className="m-0 text-[14px] text-ds-texto">Elige el tipo de cabecera.</p>
                        <ul className="m-0 grid grid-cols-1 gap-ds-2 p-0">
                            {HEADER_CHOICES.map((choice) => (
                                <li key={choice.id}>
                                    <button
                                        type="button"
                                        onClick={() => onChooseHeader(choice.id)}
                                        className="flex w-full min-h-ds-tactil shrink-0 flex-col items-start justify-center gap-ds-1 border border-ds-borde bg-ds-superficie px-ds-4 py-ds-3 text-left"
                                    >
                                        <span className="text-[16px] font-bold text-ds-texto-fuerte">
                                            {choice.label}
                                        </span>
                                        <span className="text-[12px] text-ds-texto-tenue">{choice.blurb}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-ds-2">
                            <h2 className="m-0 text-[16px] font-black uppercase tracking-wide text-ds-texto-fuerte">
                                {humanTitle(element)}
                            </h2>
                            <UxStatusMark status={uxStatus} />
                        </div>
                        {hint ? <p className="m-0 text-[14px] text-ds-texto">{hint}</p> : null}
                        <p className="m-0 text-[14px] text-ds-texto">{humanSummary(element)}</p>
                        {warning ? (
                            <Notice instance="ds-header-warning" variant="warning" title="Ojo">
                                {warning}
                            </Notice>
                        ) : null}
                        {inherited ? (
                            <Notice instance="ds-inherited" variant="info" title="Hereda">
                                Las ventanas internas usan esta misma cabecera. El diseño oficial no se cambia
                                aquí.
                            </Notice>
                        ) : null}
                        {lockedCopy && !canDesignInPrimaryPath(element) ? (
                            <Notice instance="ds-locked" variant="info" title="No se cambia aquí">
                                {lockedCopy}
                            </Notice>
                        ) : null}
                        {element.properties.length > 0 ? (
                            <PetroleumSegmented
                                instance="ds-isolated"
                                density="compact"
                                value={isolated ? 'piece' : 'scene'}
                                onChange={(next) => setIsolated(next === 'piece')}
                                aria-label="Vista de la pieza"
                                options={[
                                    { value: 'scene', label: 'En escena' },
                                    { value: 'piece', label: 'Solo la pieza' },
                                ]}
                            />
                        ) : null}
                        {isolated ? (
                            <div className="border border-ds-borde bg-ds-superficie-inactiva p-ds-3">
                                <ElementPreview element={element} values={proposalValues} />
                            </div>
                        ) : null}
                        {element.properties.length > 0 && (canEdit || reviewing || !frozen) ? (
                            <VisualPropertyList
                                properties={element.properties}
                                values={proposalValues}
                                disabled={!canEdit}
                                onChange={onChange}
                            />
                        ) : null}
                        {error ? (
                            <Notice instance="ds-error" variant="negative" title="No se puede guardar">
                                {humanGateReason(error)}
                            </Notice>
                        ) : null}
                        {proposalSaved ? (
                            <Notice instance="ds-proposal-ok" variant="positive" title="Ensayo guardado">
                                No ha cambiado la aplicación oficial.
                            </Notice>
                        ) : null}
                        {gateReason ? <p className="m-0 text-[12px] text-ds-aviso">{gateReason}</p> : null}
                        {reviewing ? (
                            <Button
                                variant="tertiary"
                                instance="ds-review-cancel"
                                layout="fill"
                                onClick={onCancelPropose}
                            >
                                Descartar copia
                            </Button>
                        ) : null}
                        {snapshot.proposals[element.id] ? (
                            <Button
                                variant="tertiary"
                                instance="ds-discard-proposal"
                                layout="fill"
                                disabled={pending}
                                onClick={onDiscardProposal}
                            >
                                Borrar ensayo
                            </Button>
                        ) : null}
                        {debt ? (
                            <div className="space-y-ds-3">
                                <Notice instance="ds-debt" variant="warning" title="Deuda">
                                    {debt}
                                </Notice>
                                <Button
                                    variant="secondary"
                                    instance="ds-debt-open"
                                    layout="fill"
                                    onClick={() => setDebtOpen(!debtOpen)}
                                >
                                    {debtOpen ? 'Ocultar sitios' : 'Ver sitios'}
                                </Button>
                                {debtOpen && audit ? (
                                    <ul className="m-0 space-y-ds-2 text-[14px] text-ds-texto">
                                        {audit.pending.map((hit) => (
                                            <li key={hit.file}>{humanConsumerName(hit.file)}</li>
                                        ))}
                                    </ul>
                                ) : null}
                            </div>
                        ) : null}
                        <TechDetails
                            element={element}
                            proposalValues={proposalValues}
                            impact={impact}
                            audit={audit}
                            techOpen={techOpen}
                            setTechOpen={setTechOpen}
                        />
                    </>
                )}
            </div>
            {choosingHeader ? null : footer}
        </>
    );
}

function TechDetails({
    element,
    proposalValues,
    impact,
    audit,
    techOpen,
    setTechOpen,
}: {
    element: StudioElement;
    proposalValues: PropertyValues;
    impact: ImpactReport | null;
    audit: AuditReport | null;
    techOpen: boolean;
    setTechOpen: (open: boolean) => void;
}) {
    return (
        <div>
            <button
                type="button"
                onClick={() => setTechOpen(!techOpen)}
                className="inline-flex min-h-ds-tactil items-center text-[14px] font-bold text-ds-texto-tenue"
            >
                ⓘ Información técnica
            </button>
            {techOpen ? (
                <Surface variant="block" instance="ds-tech" className="mt-ds-2 p-ds-4 space-y-ds-3">
                    <p className="m-0 text-[12px] text-ds-texto">Estado: {element.status}</p>
                    <p className="m-0 text-[12px] text-ds-texto">Registry: {element.id}</p>
                    <p className="m-0 text-[12px] text-ds-texto">Contrato: {element.applyKind}</p>
                    {element.inherits ? (
                        <p className="m-0 text-[12px] text-ds-texto">Inherits: {element.inherits}</p>
                    ) : null}
                    <CanonMark status={element.status} />
                    {element.properties.length > 0 ? (
                        <ul className="m-0 space-y-ds-1 text-[12px] text-ds-texto">
                            {element.properties.map((property) => (
                                <li key={property.id}>
                                    {property.id}: {proposalValues[property.id] ?? property.actualId}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    {impact && !impact.undetermined ? (
                        <p className="m-0 text-[12px] text-ds-texto">
                            Sitios (ficheros): {impact.consumers} · pantallas (rutas): {impact.routes} ·
                            variantes: {impact.variants}
                        </p>
                    ) : null}
                    {element.facts?.map((fact) => (
                        <p key={fact.label} className="m-0 text-[12px] text-ds-texto">
                            {fact.label}: {fact.value}
                        </p>
                    ))}
                    {audit && audit.pending.length > 0 ? (
                        <Field
                            instance="ds-migrate-prompt"
                            label="Migrar al diseño oficial"
                            htmlFor="ds-migrate-prompt"
                        >
                            <textarea
                                id="ds-migrate-prompt"
                                readOnly
                                rows={8}
                                value={migrationPrompt(element, audit.pending)}
                            />
                        </Field>
                    ) : null}
                </Surface>
            ) : null}
        </div>
    );
}

function LookScreen({ onOpen }: { onOpen: (elementId: string) => void }) {
    return (
        <div className="min-h-0 flex-1 overflow-auto p-ds-4 space-y-ds-4">
            <p className="m-0 text-[14px] text-ds-texto">
                Tres o cuatro decisiones que ya existen. No es un tema global.
            </p>
            <ul className="m-0 grid grid-cols-1 gap-ds-2 p-0">
                {LOOK_SHORTCUTS.map((item) => (
                    <li key={item.id}>
                        <button
                            type="button"
                            onClick={() => onOpen(item.elementId)}
                            className="flex w-full min-h-ds-tactil shrink-0 flex-col items-start justify-center gap-ds-1 border border-ds-borde bg-ds-superficie px-ds-4 py-ds-3 text-left"
                        >
                            <span className="text-[16px] font-bold text-ds-texto-fuerte">{item.title}</span>
                            <span className="text-[12px] text-ds-texto-tenue">{item.blurb}</span>
                        </button>
                    </li>
                ))}
            </ul>
            <Notice instance="ds-look-locked" variant="info" title="Colores, tipo y espacio">
                Estos valores ya son oficiales y no se cambian desde aquí.
            </Notice>
        </div>
    );
}

function EssaysScreen({
    essays,
    recentOfficial,
    onOpen,
}: {
    essays: Array<{ item: StudioElement; updatedAt: string }>;
    recentOfficial: StudioSnapshot['registry']['history'];
    onOpen: (id: string) => void;
}) {
    return (
        <div className="min-h-0 flex-1 overflow-auto p-ds-4 space-y-ds-6">
            <div className="space-y-ds-2">
                <p className="m-0 text-[11px] font-black uppercase tracking-widest text-ds-texto-tenue">
                    Guardados
                </p>
                {essays.length === 0 ? (
                    <p className="m-0 text-[14px] text-ds-texto-tenue">No hay ensayos guardados.</p>
                ) : (
                    <ul className="m-0 space-y-ds-2 p-0">
                        {essays.map(({ item, updatedAt }) => (
                            <li key={item.id}>
                                <button
                                    type="button"
                                    className="flex w-full min-h-ds-tactil items-center justify-between gap-ds-3 border border-ds-borde bg-ds-superficie px-ds-4 text-left"
                                    onClick={() => onOpen(item.id)}
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[14px] font-bold">
                                            {humanTitle(item)}
                                        </span>
                                        <span className="block text-[12px] text-ds-texto-tenue">
                                            {formatStudioStamp(updatedAt)}
                                        </span>
                                    </span>
                                    <UxStatusMark status="propuesta" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {recentOfficial.length > 0 ? (
                <div className="space-y-ds-2">
                    <p className="m-0 text-[11px] font-black uppercase tracking-widest text-ds-texto-tenue">
                        Recientes oficiales
                    </p>
                    <ul className="m-0 space-y-ds-2 p-0">
                        {recentOfficial.map((entry) => (
                            <li key={`${entry.elementId}-${entry.version}-${entry.at}`}>
                                <button
                                    type="button"
                                    className="flex w-full min-h-ds-tactil items-center justify-between gap-ds-3 border border-ds-borde bg-ds-superficie px-ds-4 text-left"
                                    onClick={() => onOpen(entry.elementId)}
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[14px] font-bold">
                                            {humanTitle(entry.elementId)}
                                        </span>
                                        <span className="block text-[12px] text-ds-texto-tenue">
                                            {formatStudioStamp(entry.at)}
                                        </span>
                                    </span>
                                    <UxStatusMark status="oficial" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}

function ConfirmScreen({
    element,
    impact,
    audit,
    changes,
    error,
    debtOpen,
    setDebtOpen,
    pending,
    writable,
    onCancel,
    onConfirm,
}: {
    element: StudioElement;
    impact: ImpactReport | null;
    audit: AuditReport | null;
    changes: ReturnType<typeof describeChanges>;
    error: string | null;
    debtOpen: boolean;
    setDebtOpen: (open: boolean) => void;
    pending: boolean;
    writable: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    const debt = humanDebtLead(audit?.pending.length ?? 0);
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-ds-6 overflow-auto p-ds-4">
                <p className="m-0 text-[16px] text-ds-texto">Vas a cambiar el diseño oficial de:</p>
                <p className="m-0 text-[20px] font-black uppercase tracking-wide">{humanTitle(element)}</p>
                <p className="m-0 text-[16px] text-ds-texto">{humanImpactLead(element, impact)}</p>
                {changes.length > 0 ? (
                    <ul className="m-0 space-y-ds-2 text-[14px] text-ds-texto">
                        {changes.map((change) => (
                            <li key={change.property}>
                                {change.property}: {change.from.split(' · ')[0]} → {change.to.split(' · ')[0]}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="m-0 text-[14px] text-ds-texto-tenue">
                        Sin cambios de valor. Se confirma el diseño actual como oficial.
                    </p>
                )}
                {debt ? (
                    <div className="space-y-ds-2">
                        <Notice instance="ds-confirm-debt" variant="warning" title="Deuda">
                            {debt}
                        </Notice>
                        <Button
                            variant="secondary"
                            instance="ds-confirm-sites"
                            layout="fill"
                            onClick={() => setDebtOpen(!debtOpen)}
                        >
                            {debtOpen ? 'Ocultar sitios' : 'Ver sitios'}
                        </Button>
                        {debtOpen && audit ? (
                            <ul className="m-0 space-y-ds-2 text-[14px] text-ds-texto">
                                {audit.pending.map((hit) => (
                                    <li key={hit.file}>{humanConsumerName(hit.file)}</li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                ) : null}
                <p className="m-0 text-[14px] font-bold text-ds-texto">El diseño oficial cambiará ahora.</p>
                {error ? (
                    <Notice instance="ds-confirm-error" variant="negative" title="No se puede guardar">
                        {humanGateReason(error)}
                    </Notice>
                ) : null}
            </div>
            <div className="shrink-0 space-y-ds-2 border-t border-ds-borde p-ds-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
                <Button variant="secondary" instance="ds-save-cancel" layout="fill" onClick={onCancel}>
                    Cancelar
                </Button>
                <Button
                    variant="primary"
                    instance="ds-save-confirm"
                    layout="fill"
                    loading={pending}
                    disabled={!writable}
                    onClick={onConfirm}
                >
                    Hacer oficial
                </Button>
            </div>
        </div>
    );
}

function DoneScreen({
    element,
    impact,
    applyResult,
    audit,
    onSeeDebt,
    onHome,
}: {
    element: StudioElement;
    impact: ImpactReport | null;
    applyResult: ApplyResult | null;
    audit: AuditReport | null;
    onSeeDebt: () => void;
    onHome: () => void;
}) {
    const remaining = applyResult?.remainingDebt.length ?? 0;
    return (
        <div className="min-h-0 flex-1 space-y-ds-6 overflow-auto p-ds-4">
            <Notice instance="ds-done" variant="positive" title="Diseño actualizado">
                {humanTitle(element)}. El nuevo diseño ya es oficial.
            </Notice>
            {applyResult ? (
                <p className="m-0 text-[16px] text-ds-texto">
                    {humanPublishResult({
                        blueprintUpdated: applyResult.blueprintUpdated,
                        sourcesUpdated: applyResult.sourcesUpdated,
                        remainingDebt: applyResult.remainingDebt,
                    })}
                </p>
            ) : null}
            <p className="m-0 text-[16px] text-ds-texto">{humanImpactLead(element, impact)}</p>
            {remaining > 0 ? (
                <Notice instance="ds-done-debt" variant="warning" title={humanDebtLead(remaining) ?? 'Deuda'}>
                    No se ha fingido que el diseño nuevo ya está en sitios que todavía no lo usan.
                </Notice>
            ) : null}
            {audit && audit.pending.length > 0 ? (
                <Button variant="secondary" instance="ds-done-see-debt" layout="fill" onClick={onSeeDebt}>
                    Ver sitios
                </Button>
            ) : null}
            <Button variant="primary" instance="ds-done-home" layout="fill" onClick={onHome}>
                Volver a la escena
            </Button>
        </div>
    );
}
