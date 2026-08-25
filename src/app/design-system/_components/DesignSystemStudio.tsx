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
    auditStudioElement,
    confirmCanonDecision,
    discardStudioProposal,
    saveAsCanon,
    saveStudioProposal,
} from '../actions';
import { CanonMark, SampleLabel, UxStatusMark } from './catalog-kit';
import { HeaderTaxonomyList } from './header-taxonomy';
import { ElementContextPreview, ElementPreview } from './studio-previews';
import { VisualPropertyList } from './visual-controls';
import {
    type UxFamily,
    type UxFamilyId,
    UX_HOME_FAMILIES,
    UX_MORE_FAMILIES,
    contextScenesFor,
    familyById,
    primaryFamilyFor,
    resolveStudioTarget,
} from '@/lib/design-system/visual-studio/ux-nav';
import {
    humanConsumerName,
    humanGateReason,
    humanSummary,
    humanTitle,
    humanWarning,
    uxStatusHint,
    uxStatusOf,
} from '@/lib/design-system/visual-studio/ux-copy';

type Screen = 'home' | 'family' | 'edit' | 'confirm' | 'done';
type PreviewMode = 'actual' | 'proposal' | 'compare';

function migrationPrompt(element: StudioElement, pending: AuditReport['pending']): string {
    const list = pending.map((hit, index) => `${index + 1}. ${humanConsumerName(hit.file)}`).join('\n');
    return `MIGRAR AL DISEÑO OFICIAL
Elemento: ${humanTitle(element)}

Inspecciona cada consumidor. Aplica el componente o patrón correcto.
Respeta la lógica existente. No cambies funcionalidad.
No hagas reemplazos masivos por regex.
Ejecuta tests y vuelve a auditar.

ELEMENTOS PENDIENTES
${list || 'Ninguno.'}
`;
}

function FamilyCard({
    title,
    blurb,
    onClick,
}: {
    title: string;
    blurb: string;
    onClick: () => void;
}) {
    return (
        <li>
            <button
                type="button"
                onClick={onClick}
                className="flex w-full min-h-ds-tactil shrink-0 flex-col items-start justify-center gap-ds-1 border border-ds-borde bg-ds-superficie px-ds-4 py-ds-3 text-left"
            >
                <span className="text-[16px] font-bold text-ds-texto-fuerte">{title}</span>
                <span className="text-[12px] text-ds-texto-tenue">{blurb}</span>
            </button>
        </li>
    );
}

function PreviewFrame({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="space-y-ds-2">
            <SampleLabel>{label}</SampleLabel>
            <div className="border border-ds-borde bg-ds-superficie p-ds-4">{children}</div>
        </div>
    );
}

export function DesignSystemStudio({
    snapshot: initialSnapshot,
}: {
    snapshot: StudioSnapshot;
    elements?: StudioElement[];
}) {
    const router = useRouter();
    const [snapshot, setSnapshot] = useState(initialSnapshot);
    const [screen, setScreen] = useState<Screen>('home');
    const [familyId, setFamilyId] = useState<UxFamilyId | null>(null);
    const [selectedId, setSelectedId] = useState('button');
    const [previewMode, setPreviewMode] = useState<PreviewMode>('proposal');
    const [contextScene, setContextScene] = useState<string | null>(null);
    const [proposal, setProposal] = useState<PropertyValues>({});
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
    const element = elements.find((item) => item.id === selectedId) ?? elements[0]!;
    const actual = useMemo(() => actualValues(element), [element]);
    const proposalValues = { ...actual, ...proposal };
    const previewValues = previewMode === 'actual' ? actual : proposalValues;
    const uxStatus = uxStatusOf(element);
    const frozen = element.status === 'CANON CERRADO';
    const inherited = element.status === 'HEREDADO' || Boolean(element.inherits);
    const readOnlyKind =
        element.status === 'DEPRECADO' || element.status === 'ESPECIALIZADO' || inherited;
    const canEdit =
        previewMode !== 'actual' &&
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
    const scenes = contextScenesFor(element.id);
    const family = familyId ? familyById(familyId) : primaryFamilyFor(element.id);

    useEffect(() => {
        setSnapshot(initialSnapshot);
    }, [initialSnapshot]);

    useEffect(() => {
        const saved = snapshot.proposals[element.id]?.a?.values;
        setProposal(saved ?? actualValues(element));
        setApplyResult(null);
        setError(null);
        setProposalSaved(false);
        setTechOpen(false);
        setDebtOpen(false);
        setContextScene(null);
        startTransition(() => {
            void auditStudioElement(element.id).then((result) => {
                if (result.ok) {
                    setAudit(result.audit);
                    setImpact(result.impact);
                }
            });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [element.id, snapshot.proposals[element.id]?.a?.updatedAt]);

    useEffect(() => {
        setReviewing(false);
        setPreviewMode(element.status === 'CANON CERRADO' ? 'actual' : 'proposal');
    }, [element.id, element.status]);

    function goHome() {
        setScreen('home');
        setFamilyId(null);
        setContextScene(null);
    }

    function openFamily(next: UxFamily) {
        setFamilyId(next.id);
        if (next.id === 'headers') {
            setScreen('family');
            return;
        }
        if (next.elementIds.length === 1) {
            openElement(next.elementIds[0]!);
            return;
        }
        setScreen('family');
    }

    function openElement(id: string) {
        const item = elements.find((entry) => entry.id === id);
        if (!item) return;
        if (item.redirectTo) {
            setSelectedId(item.redirectTo);
            setFamilyId(primaryFamilyFor(item.redirectTo)?.id ?? familyId);
            setScreen('edit');
            setReviewing(false);
            return;
        }
        setSelectedId(item.id);
        setScreen('edit');
        setReviewing(false);
    }

    function setProposalValue(propertyId: string, next: string) {
        setProposal((prev) => ({ ...prev, [propertyId]: next }));
        setProposalSaved(false);
        if (previewMode === 'actual') setPreviewMode('proposal');
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

    const recentOfficial = [...snapshot.registry.history].reverse().slice(0, 6);
    const recentProposals = Object.keys(snapshot.proposals)
        .map((id) => elements.find((item) => item.id === id))
        .filter((item): item is StudioElement => Boolean(item));

    const backLabel =
        screen === 'edit' && family && (family.id === 'headers' || family.elementIds.length > 1)
            ? family.label
            : 'Design System';

    return (
        <div className="min-h-screen">
            <header className="sticky top-0 z-20 border-b border-white/20 bg-ds-marca text-ds-texto-invertido pt-[env(safe-area-inset-top)]">
                <div className="mx-auto max-w-4xl px-ds-4 py-ds-3 space-y-ds-2">
                    {screen !== 'home' ? (
                        <Button
                            variant="secondary"
                            instance="ds-back"
                            aria-label="Volver"
                            icon={<ArrowLeft size={20} strokeWidth={2.5} />}
                            onClick={() => {
                                if (screen === 'confirm' || screen === 'done') {
                                    setScreen('edit');
                                    return;
                                }
                                if (screen === 'edit' && family && (family.id === 'headers' || family.elementIds.length > 1)) {
                                    setScreen('family');
                                    return;
                                }
                                goHome();
                            }}
                            className="shrink-0"
                        />
                    ) : null}
                    <p className="m-0 text-[11px] font-black uppercase tracking-[0.2em] opacity-80">
                        Design System
                    </p>
                    <h1 className="m-0 text-[20px] font-black tracking-tight">
                        {screen === 'home'
                            ? '¿Qué quieres cambiar?'
                            : screen === 'family'
                              ? (family?.label ?? 'Elegir')
                              : screen === 'confirm'
                                ? 'Hacer oficial'
                                : screen === 'done'
                                  ? 'Diseño actualizado'
                                  : humanTitle(element)}
                    </h1>
                    {!snapshot.writable ? (
                        <p className="m-0 text-[12px] text-ds-aviso-fondo">
                            {snapshot.writableReason ?? 'Este entorno no puede guardar cambios.'}
                        </p>
                    ) : null}
                </div>
            </header>

            <div className="mx-auto max-w-4xl space-y-ds-6 p-ds-4 md:p-ds-8">
                {screen === 'home' ? (
                    <>
                        <ul className="grid grid-cols-1 gap-ds-2 md:grid-cols-2">
                            {UX_HOME_FAMILIES.map((item) => (
                                <FamilyCard
                                    key={item.id}
                                    title={item.label}
                                    blurb={item.blurb}
                                    onClick={() => openFamily(item)}
                                />
                            ))}
                        </ul>
                        <div className="space-y-ds-2">
                            <SampleLabel>Más</SampleLabel>
                            <ul className="grid grid-cols-1 gap-ds-2 md:grid-cols-2">
                                {UX_MORE_FAMILIES.map((item) => (
                                    <FamilyCard
                                        key={item.id}
                                        title={item.label}
                                        blurb={item.blurb}
                                        onClick={() => openFamily(item)}
                                    />
                                ))}
                            </ul>
                        </div>
                        {recentOfficial.length > 0 || recentProposals.length > 0 ? (
                            <div className="space-y-ds-3">
                                <SampleLabel>Cambios recientes</SampleLabel>
                                <ul className="space-y-ds-2">
                                    {recentProposals.map((item) => (
                                        <li key={`p-${item.id}`}>
                                            <button
                                                type="button"
                                                className="flex w-full min-h-ds-tactil items-center justify-between gap-ds-3 border border-ds-borde bg-ds-superficie px-ds-4 text-left"
                                                onClick={() => {
                                                    setFamilyId(primaryFamilyFor(item.id)?.id ?? null);
                                                    openElement(item.id);
                                                }}
                                            >
                                                <span className="text-[14px] font-bold">{humanTitle(item)}</span>
                                                <UxStatusMark status="propuesta" />
                                            </button>
                                        </li>
                                    ))}
                                    {recentOfficial.map((entry) => (
                                        <li key={`${entry.elementId}-${entry.version}-${entry.at}`}>
                                            <button
                                                type="button"
                                                className="flex w-full min-h-ds-tactil items-center justify-between gap-ds-3 border border-ds-borde bg-ds-superficie px-ds-4 text-left"
                                                onClick={() => {
                                                    setFamilyId(primaryFamilyFor(entry.elementId)?.id ?? null);
                                                    openElement(entry.elementId);
                                                }}
                                            >
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-[14px] font-bold truncate">
                                                        {humanTitle(entry.elementId)}
                                                    </span>
                                                    <span className="block text-[12px] text-ds-texto-tenue">
                                                        {entry.at}
                                                    </span>
                                                </span>
                                                <UxStatusMark status="oficial" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </>
                ) : null}

                {screen === 'family' && family ? (
                    family.id === 'headers' ? (
                        <HeaderTaxonomyList
                            elements={elements}
                            selectedId={selectedId}
                            onSelect={(item) => openElement(resolveStudioTarget(item))}
                        />
                    ) : (
                        <div className="space-y-ds-4">
                            <p className="m-0 text-[14px] text-ds-texto">{family.blurb}</p>
                            <ul className="grid grid-cols-1 gap-ds-2">
                                {family.elementIds.map((id) => {
                                    const item = elements.find((entry) => entry.id === id);
                                    if (!item) return null;
                                    return (
                                        <li key={id}>
                                            <button
                                                type="button"
                                                onClick={() => openElement(id)}
                                                className="flex w-full min-h-ds-tactil shrink-0 items-center justify-between gap-ds-3 border border-ds-borde bg-ds-superficie px-ds-4 py-ds-3"
                                            >
                                                <span className="text-left min-w-0 flex-1">
                                                    <span className="block text-[16px] font-bold text-ds-texto-fuerte">
                                                        {humanTitle(item)}
                                                    </span>
                                                    <span className="block text-[12px] text-ds-texto-tenue">
                                                        {humanSummary(item)}
                                                    </span>
                                                </span>
                                                <UxStatusMark status={uxStatusOf(item)} />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )
                ) : null}

                {screen === 'edit' ? (
                    <EditorBody
                        element={element}
                        uxStatus={uxStatus}
                        actual={actual}
                        proposalValues={proposalValues}
                        previewValues={previewValues}
                        previewMode={previewMode}
                        setPreviewMode={setPreviewMode}
                        contextScene={contextScene}
                        setContextScene={setContextScene}
                        scenes={scenes}
                        canEdit={canEdit}
                        reviewing={reviewing}
                        frozen={frozen}
                        inherited={inherited}
                        error={error}
                        proposalSaved={proposalSaved}
                        applyResult={applyResult}
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
                        onCancelPropose={() => {
                            setReviewing(false);
                            setPreviewMode('actual');
                            setProposal(actual);
                        }}
                        onDiscardProposal={() => {
                            startTransition(() => {
                                void discardStudioProposal(element.id).then((result) => {
                                    if (result.ok) setSnapshot(result.snapshot);
                                });
                            });
                        }}
                    />
                ) : null}

                {screen === 'confirm' ? (
                    <div className="space-y-ds-6">
                        <p className="m-0 text-[16px] text-ds-texto">
                            Vas a cambiar el diseño oficial de:
                        </p>
                        <p className="m-0 text-[20px] font-black uppercase tracking-wide">
                            {humanTitle(element)}
                        </p>
                        {impact?.undetermined ? (
                            <Notice instance="ds-impact-unknown" variant="warning" title="Impacto">
                                No se puede calcular con certeza cuántas pantallas usan esta pieza.
                            </Notice>
                        ) : (
                            <p className="m-0 text-[16px] text-ds-texto">
                                Este cambio puede afectar a:
                                <span className="block font-bold">
                                    {impact?.consumers ?? '—'} elementos
                                </span>
                                <span className="block font-bold">
                                    {impact?.routes ?? '—'} pantallas
                                </span>
                                <span className="block font-bold">
                                    {impact?.variants ?? '—'} variantes
                                </span>
                            </p>
                        )}
                        {changes.length > 0 ? (
                            <ul className="m-0 space-y-ds-2 text-[14px] text-ds-texto">
                                {changes.map((change) => (
                                    <li key={change.property}>
                                        {change.property}: {change.from.split(' · ')[0]} →{' '}
                                        {change.to.split(' · ')[0]}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="m-0 text-[14px] text-ds-texto-tenue">
                                Sin cambios de valor. Se confirma el diseño actual como oficial.
                            </p>
                        )}
                        <p className="m-0 text-[14px] font-bold text-ds-texto">
                            El diseño oficial cambiará ahora.
                        </p>
                        {error ? (
                            <Notice instance="ds-confirm-error" variant="negative" title="No se puede guardar">
                                {humanGateReason(error)}
                            </Notice>
                        ) : null}
                    </div>
                ) : null}

                {screen === 'done' ? (
                    <div className="space-y-ds-6">
                        <Notice instance="ds-done" variant="positive" title="Diseño actualizado">
                            {humanTitle(element)}. El nuevo diseño ya es oficial.
                        </Notice>
                        {impact && !impact.undetermined ? (
                            <p className="m-0 text-[16px] text-ds-texto">
                                {impact.consumers} elementos utilizan ahora el nuevo contrato.
                            </p>
                        ) : null}
                        {(applyResult?.remainingDebt.length ?? 0) > 0 ? (
                            <Notice
                                instance="ds-done-debt"
                                variant="warning"
                                title={`${applyResult?.remainingDebt.length} elementos necesitan adaptación`}
                            >
                                No se ha fingido que el diseño nuevo ya está en piezas que todavía no lo usan.
                            </Notice>
                        ) : null}
                        {audit && audit.pending.length > 0 ? (
                            <Button
                                variant="secondary"
                                instance="ds-done-see-debt"
                                layout="fill"
                                onClick={() => {
                                    setDebtOpen(true);
                                    setScreen('edit');
                                }}
                            >
                                Ver elementos
                            </Button>
                        ) : null}
                        <Button variant="primary" instance="ds-done-home" layout="fill" onClick={goHome}>
                            Volver al inicio
                        </Button>
                    </div>
                ) : null}
                {screen === 'edit' || screen === 'confirm' ? (
                    <div className="h-[calc(var(--tactil-minimo)*5)] shrink-0" aria-hidden />
                ) : null}
            </div>

            {screen === 'edit' ? (
                <div className="sticky bottom-0 z-20 shrink-0 border-t border-ds-borde bg-ds-superficie pb-[env(safe-area-inset-bottom)]">
                    <div className="mx-auto flex max-w-4xl flex-col gap-ds-2 p-ds-4">
                        {frozen && !reviewing && !readOnlyKind && element.properties.length > 0 ? (
                            <Button
                                variant="primary"
                                instance="ds-propose"
                                layout="fill"
                                onClick={() => {
                                    setReviewing(true);
                                    setPreviewMode('proposal');
                                }}
                            >
                                Proponer cambio
                            </Button>
                        ) : null}
                        {reviewing ? (
                            <p className="m-0 text-[12px] text-ds-texto-tenue">
                                Estás trabajando sobre una copia. El diseño oficial no cambiará hasta que lo
                                hagas oficial.
                            </p>
                        ) : null}
                        {canSaveProposal ? (
                            <Button
                                variant={canMakeOfficial ? 'secondary' : 'primary'}
                                instance="ds-save-proposal"
                                layout="fill"
                                disabled={pending || !proposalGate.ok || !snapshot.writable}
                                loading={pending}
                                onClick={saveProposalNow}
                            >
                                Guardar propuesta
                            </Button>
                        ) : null}
                        {canMakeOfficial ? (
                            <>
                                <Button
                                    variant="primary"
                                    instance="ds-make-official"
                                    layout="fill"
                                    disabled={pending || !gate.ok || !snapshot.writable}
                                    loading={pending}
                                    onClick={openConfirm}
                                >
                                    Hacer oficial
                                </Button>
                                <p className="m-0 text-[12px] text-ds-texto-tenue">
                                    Convertirá esta propuesta en el diseño oficial de Marbella.
                                </p>
                            </>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {screen === 'confirm' ? (
                <div className="sticky bottom-0 z-20 shrink-0 border-t border-ds-borde bg-ds-superficie pb-[env(safe-area-inset-bottom)]">
                    <div className="mx-auto flex max-w-4xl flex-col gap-ds-2 p-ds-4">
                        <Button
                            variant="secondary"
                            instance="ds-save-cancel"
                            layout="fill"
                            onClick={() => setScreen('edit')}
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="primary"
                            instance="ds-save-confirm"
                            layout="fill"
                            loading={pending}
                            disabled={!snapshot.writable}
                            onClick={confirmOfficial}
                        >
                            Hacer oficial
                        </Button>
                    </div>
                </div>
            ) : null}

            <span className="sr-only">{backLabel}</span>
        </div>
    );
}

function EditorBody({
    element,
    uxStatus,
    actual,
    proposalValues,
    previewValues,
    previewMode,
    setPreviewMode,
    contextScene,
    setContextScene,
    scenes,
    canEdit,
    reviewing,
    frozen,
    inherited,
    error,
    proposalSaved,
    applyResult,
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
    onCancelPropose,
    onDiscardProposal,
}: {
    element: StudioElement;
    uxStatus: ReturnType<typeof uxStatusOf>;
    actual: PropertyValues;
    proposalValues: PropertyValues;
    previewValues: PropertyValues;
    previewMode: PreviewMode;
    setPreviewMode: (mode: PreviewMode) => void;
    contextScene: string | null;
    setContextScene: (scene: string | null) => void;
    scenes: readonly { id: string; label: string }[];
    canEdit: boolean;
    reviewing: boolean;
    frozen: boolean;
    inherited: boolean;
    error: string | null;
    proposalSaved: boolean;
    applyResult: ApplyResult | null;
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
    onCancelPropose: () => void;
    onDiscardProposal: () => void;
}) {
    const warning = humanWarning(element);
    const hint = uxStatusHint(uxStatus);
    const showCompare = element.properties.length > 0 && (reviewing || !frozen);

    return (
        <div className="space-y-ds-6">
            <div className="flex flex-wrap items-center gap-ds-2">
                <h2 className="m-0 text-[20px] font-black uppercase tracking-wide text-ds-texto-fuerte">
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
                <Notice instance="ds-inherited" variant="info" title="Hereda la cabecera de modal">
                    Las ventanas internas usan esta misma cabecera. El diseño oficial no se cambia aquí.
                </Notice>
            ) : null}

            {reviewing ? (
                <Notice instance="ds-copy" variant="info" title="Nueva propuesta">
                    Estás trabajando sobre una copia. El diseño oficial no cambiará hasta que lo hagas
                    oficial.
                </Notice>
            ) : null}

            {showCompare ? (
                <PetroleumSegmented
                    instance="ds-preview-mode"
                    density="comfortable"
                    value={previewMode}
                    onChange={(next) => setPreviewMode(next as PreviewMode)}
                    aria-label="Vista del preview"
                    options={[
                        { value: 'actual', label: 'Actual' },
                        { value: 'proposal', label: 'Propuesta' },
                        { value: 'compare', label: 'Comparar' },
                    ]}
                />
            ) : null}

            {previewMode === 'compare' ? (
                <div className="space-y-ds-4">
                    <PreviewFrame label="Actual">
                        <ElementPreview element={element} values={actual} />
                    </PreviewFrame>
                    <PreviewFrame label="Propuesta">
                        <ElementPreview element={element} values={proposalValues} />
                    </PreviewFrame>
                </div>
            ) : (
                <PreviewFrame label={previewMode === 'actual' ? 'Actual' : 'Propuesta'}>
                    <ElementPreview element={element} values={previewValues} />
                </PreviewFrame>
            )}

            {scenes.length > 0 ? (
                <div className="space-y-ds-3">
                    <SampleLabel>Probar en contexto</SampleLabel>
                    <div className="flex flex-wrap gap-ds-2">
                        {scenes.map((scene) => (
                            <button
                                key={scene.id}
                                type="button"
                                aria-pressed={contextScene === scene.id}
                                onClick={() =>
                                    setContextScene(contextScene === scene.id ? null : scene.id)
                                }
                                className={`inline-flex min-h-ds-tactil shrink-0 items-center px-ds-4 border text-[14px] font-bold ${
                                    contextScene === scene.id
                                        ? 'border-ds-marca bg-ds-marca text-ds-texto-invertido'
                                        : 'border-ds-borde-marcado bg-ds-superficie text-ds-texto-fuerte'
                                }`}
                            >
                                {scene.label}
                            </button>
                        ))}
                    </div>
                    {contextScene ? (
                        <div className="border border-ds-borde bg-ds-superficie p-ds-4">
                            <ElementContextPreview
                                element={element}
                                values={previewValues}
                                scene={contextScene}
                            />
                        </div>
                    ) : null}
                </div>
            ) : null}

            {element.properties.length > 0 && (canEdit || reviewing || !frozen) ? (
                <div className="space-y-ds-3">
                    <SampleLabel>Modificar</SampleLabel>
                    <VisualPropertyList
                        properties={element.properties}
                        values={proposalValues}
                        disabled={!canEdit}
                        onChange={onChange}
                    />
                </div>
            ) : null}

            {error ? (
                <Notice instance="ds-error" variant="negative" title="No se puede guardar">
                    {humanGateReason(error)}
                </Notice>
            ) : null}

            {proposalSaved ? (
                <Notice instance="ds-proposal-ok" variant="positive" title="Propuesta guardada">
                    No ha cambiado la aplicación oficial.
                </Notice>
            ) : null}

            {applyResult?.ok ? (
                <Notice instance="ds-saved" variant="positive" title="Diseño actualizado">
                    {applyResult.message}
                </Notice>
            ) : null}

            {gateReason ? <p className="m-0 text-[12px] text-ds-aviso">{gateReason}</p> : null}

            {reviewing ? (
                <Button variant="tertiary" instance="ds-review-cancel" layout="fill" onClick={onCancelPropose}>
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
                    Borrar propuestas
                </Button>
            ) : null}

            {audit && audit.pending.length > 0 ? (
                <div className="space-y-ds-3">
                    <Notice
                        instance="ds-debt"
                        variant="warning"
                        title={`${audit.pending.length} elementos necesitan adaptación`}
                    >
                        Todavía no usan el diseño oficial.
                    </Notice>
                    <Button
                        variant="secondary"
                        instance="ds-debt-open"
                        layout="fill"
                        onClick={() => setDebtOpen(!debtOpen)}
                    >
                        {debtOpen ? 'Ocultar elementos' : 'Ver elementos'}
                    </Button>
                    {debtOpen ? (
                        <div className="space-y-ds-3">
                            <p className="m-0 text-[14px] text-ds-texto">
                                Elementos que todavía no utilizan el diseño oficial:
                            </p>
                            <ul className="m-0 space-y-ds-2 text-[14px] text-ds-texto">
                                {audit.pending.map((hit) => (
                                    <li key={hit.file}>{humanConsumerName(hit.file)}</li>
                                ))}
                            </ul>
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
                        </div>
                    ) : null}
                </div>
            ) : null}

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
                        <p className="m-0 text-[12px] text-ds-texto">
                            Estado: {element.status}
                        </p>
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
                                Consumidores: {impact.consumers} · rutas: {impact.routes} · variantes:{' '}
                                {impact.variants}
                            </p>
                        ) : null}
                        {element.facts?.map((fact) => (
                            <p key={fact.label} className="m-0 text-[12px] text-ds-texto">
                                {fact.label}: {fact.value}
                            </p>
                        ))}
                    </Surface>
                ) : null}
            </div>
        </div>
    );
}
