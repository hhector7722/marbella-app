/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    Modo,
    ViewportPreset,
    Recipe,
    MovidaId,
    Movida,
    Hipotesis,
    EstadoHipotesis,
    VariantNode,
    EstadoVersion,
    Regla,
    SondaNota,
    Intensidad,
    DesignContext,
} from './types';
import { MOVIDAS_CATALOGO, MOVIDA_BY_ID } from './movidas';
import { resolverReceta } from './design-context';
import { SCREEN_IDS, ScreenId } from './screens/real';

// ============================================================
// STORE — Marbella Design Studio (modelo conceptual definitivo)
// Árbol de versiones por pantalla real. Hipótesis como centro de
// gravedad. Movidas mutables hacia el Design Language.
// ============================================================

const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function mergeRecipes(a: Recipe, b: Recipe): Recipe {
    const out: Recipe = { ...a };
    for (const [k, v] of Object.entries(b)) {
        out[k as MovidaId] = v as Intensidad;
    }
    return out;
}

interface ScreenVersions {
    [screenKey: string]: VariantNode[];
}

interface StudioStateV4 {
    // ---- Modos ----
    modo: Modo;
    viewport: ViewportPreset;
    activeScreenKey: ScreenId;
    activeVariantId: string | null;
    activeHipotesisId: string | null;

    // ---- Árbol de versiones por pantalla ----
    versions: ScreenVersions;

    // ---- Hipótesis (centro de gravedad) ----
    hipotesis: Hipotesis[];

    // ---- Movidas (madurez mutable) ----
    movidas: Movida[];

    // ---- Reglas validadas ----
    reglas: Regla[];

    // ---- Notas de sonda ----
    sondaNotas: SondaNota[];

    // ---- Observaciones de Absorber (semillas) ----
    observaciones: { id: string; referenciaId: string; movidaId: MovidaId; nota: string; createdAt: string }[];

    // ================= ACCIONES =================

    setModo: (m: Modo) => void;
    setViewport: (v: ViewportPreset) => void;
    setActiveScreen: (s: ScreenId) => void;
    setActiveVariant: (id: string | null) => void;

    // Árbol de versiones
    ensureOriginBranch: (screenKey: ScreenId) => void;
    addVariantFromRecipe: (screenKey: ScreenId, parentId: string | null, name: string, recipe: Recipe, opts?: { hipotesisId?: string; estado?: EstadoVersion }) => string | null;
    forkVariant: (screenKey: ScreenId, parentId: string, name: string) => string | null;
    fusionarVariantes: (screenKey: ScreenId, ids: string[], name: string) => string | null;
    setVariantState: (screenKey: ScreenId, id: string, estado: EstadoVersion) => void;
    deleteVariant: (screenKey: ScreenId, id: string) => boolean;
    setPuerta1: (screenKey: ScreenId, id: string, value: boolean) => void;
    setSegundaPantalla: (screenKey: ScreenId, id: string, pantalla: string | null) => void;

    // Hipótesis
    addHipotesis: (texto: string, movidas: MovidaId[], opts?: { referencias?: string[]; pantallas?: string[]; notas?: string }) => string;
    updateHipotesisEstado: (id: string, estado: EstadoHipotesis) => void;
    updateHipotesisNotas: (id: string, notas: string) => void;
    setActiveHipotesis: (id: string | null) => void;

    // Movidas / Design Language
    updateMovidaMadurez: (movidaId: MovidaId, madurez: Movida['madurez'], reglaId?: string) => void;
    convertToRegla: (screenKey: ScreenId, variantId: string) => string | null;

    // Sondear
    saveSondaNota: (screenKey: ScreenId, recipe: Recipe, texto: string) => void;

    // Absorber
    recordReadObservation: (referenciaId: string, movidaId: MovidaId, nota: string) => void;
}

function defaultVersions(): ScreenVersions {
    const out: ScreenVersions = {};
    for (const key of SCREEN_IDS) {
        out[key] = [
            {
                id: `${key}-original`,
                screenKey: key,
                parentId: null,
                name: 'Original',
                recipe: {},
                estado: 'original',
                createdAt: now(),
                updatedAt: now(),
            },
        ];
    }
    return out;
}

const versionOf = (versions: ScreenVersions, screenKey: ScreenId, id: string): VariantNode | undefined =>
    (versions[screenKey] || []).find(v => v.id === id);

export const useStudioStore = create<StudioStateV4>()(
    persist(
        (set, get) => ({
            modo: 'decidir',
            viewport: 'mobile',
            activeScreenKey: 'movimientos',
            activeVariantId: null,
            activeHipotesisId: null,
            versions: defaultVersions(),
            hipotesis: [],
            movidas: MOVIDAS_CATALOGO,
            reglas: [],
            sondaNotas: [],
            observaciones: [],

            setModo: m => set({ modo: m }),
            setViewport: v => set({ viewport: v }),
            setActiveScreen: s => set({ activeScreenKey: s, activeVariantId: null }),
            setActiveVariant: id => set({ activeVariantId: id }),

            ensureOriginBranch: screenKey =>
                set(state => {
                    if ((state.versions[screenKey] || []).some(v => v.parentId === null)) return state;
                    return {
                        versions: {
                            ...state.versions,
                            [screenKey]: [
                                {
                                    id: `${screenKey}-original`,
                                    screenKey,
                                    parentId: null,
                                    name: 'Original',
                                    recipe: {},
                                    estado: 'original',
                                    createdAt: now(),
                                    updatedAt: now(),
                                },
                            ],
                        },
                    };
                }),

            addVariantFromRecipe: (screenKey, parentId, name, recipe, opts) => {
                get().ensureOriginBranch(screenKey);
                const id = uid('v');
                const node: VariantNode = {
                    id,
                    screenKey,
                    parentId,
                    name,
                    recipe,
                    estado: opts?.estado ?? 'candidata',
                    hipotesisId: opts?.hipotesisId ?? get().activeHipotesisId ?? undefined,
                    createdAt: now(),
                    updatedAt: now(),
                };
                set(state => ({
                    versions: { ...state.versions, [screenKey]: [...(state.versions[screenKey] || []), node] },
                    activeVariantId: id,
                }));
                return id;
            },

            forkVariant: (screenKey, parentId, name) => {
                const parent = versionOf(get().versions, screenKey, parentId);
                if (!parent) return null;
                return get().addVariantFromRecipe(screenKey, parentId, name, { ...parent.recipe });
            },

            fusionarVariantes: (screenKey, ids, name) => {
                const nodes = ids.map(id => versionOf(get().versions, screenKey, id)).filter(Boolean) as VariantNode[];
                if (nodes.length < 2) return null;
                let recipe: Recipe = {};
                for (const n of nodes) recipe = mergeRecipes(recipe, n.recipe);
                return get().addVariantFromRecipe(screenKey, ids[0], name, recipe, { estado: 'candidata' });
            },

            setVariantState: (screenKey, id, estado) =>
                set(state => ({
                    versions: {
                        ...state.versions,
                        [screenKey]: (state.versions[screenKey] || []).map(v =>
                            v.id === id ? { ...v, estado, updatedAt: now() } : v
                        ),
                    },
                })),

            deleteVariant: (screenKey, id) => {
                const node = versionOf(get().versions, screenKey, id);
                if (!node || node.parentId === null) return false;
                const remaining = (get().versions[screenKey] || []).filter(v => v.id !== id);
                set(state => ({
                    versions: { ...state.versions, [screenKey]: remaining },
                    activeVariantId: state.activeVariantId === id ? null : state.activeVariantId,
                }));
                return true;
            },

            setPuerta1: (screenKey, id, value) =>
                set(state => ({
                    versions: {
                        ...state.versions,
                        [screenKey]: (state.versions[screenKey] || []).map(v =>
                            v.id === id ? { ...v, superaPuerta1: value, updatedAt: now() } : v
                        ),
                    },
                })),

            setSegundaPantalla: (screenKey, id, pantalla) =>
                set(state => ({
                    versions: {
                        ...state.versions,
                        [screenKey]: (state.versions[screenKey] || []).map(v =>
                            v.id === id ? { ...v, segundaPantalla: pantalla, updatedAt: now() } : v
                        ),
                    },
                })),

            addHipotesis: (texto, movidas, opts) => {
                const id = uid('hip');
                const h: Hipotesis = {
                    id,
                    texto,
                    estado: 'nueva',
                    movidas,
                    referencias: opts?.referencias ?? [],
                    variantes: [],
                    pantallas: opts?.pantallas ?? [],
                    notas: opts?.notas ?? '',
                    createdAt: now(),
                    updatedAt: now(),
                    timeline: [{ estado: 'nueva', fecha: now() }],
                };
                set(state => ({ hipotesis: [...state.hipotesis, h], activeHipotesisId: id }));
                return id;
            },

            updateHipotesisEstado: (id, estado) =>
                set(state => ({
                    hipotesis: state.hipotesis.map(h => {
                        if (h.id !== id) return h;
                        if (h.estado === estado) return h;
                        return { ...h, estado, updatedAt: now(), timeline: [...h.timeline, { estado, fecha: now() }] };
                    }),
                })),

            updateHipotesisNotas: (id, notas) =>
                set(state => ({
                    hipotesis: state.hipotesis.map(h => (h.id === id ? { ...h, notas, updatedAt: now() } : h)),
                })),

            setActiveHipotesis: id => set({ activeHipotesisId: id }),

            updateMovidaMadurez: (movidaId, madurez, reglaId) =>
                set(state => ({
                    movidas: state.movidas.map(m =>
                        m.id === movidaId
                            ? { ...m, madurez, reglaId: reglaId ?? m.reglaId }
                            : m
                    ),
                })),

            convertToRegla: (screenKey, variantId) => {
                const node = versionOf(get().versions, screenKey, variantId);
                if (!node || node.parentId === null) return null;
                const gate2 = !!node.segundaPantalla;
                if (!node.superaPuerta1 || !gate2) return null;

                const movidasActivas = Object.keys(node.recipe) as MovidaId[];
                if (movidasActivas.length === 0) return null;
                const movidaId = movidasActivas[0];

                const id = uid('regla');
                const regla: Regla = {
                    id,
                    movidaId,
                    resumen: `Variante «${node.name}» supera la doble puerta en ${node.screenKey} y ${node.segundaPantalla}.`,
                    ejemplo: node.name,
                    contraejemplo: 'Original sin la movida aplicada.',
                    pantallaOrigen: node.screenKey,
                    pantallaValidacion: node.segundaPantalla!,
                    varianteOrigenId: node.id,
                    hipotesisId: node.hipotesisId,
                    createdAt: now(),
                };

                set(state => ({
                    reglas: [...state.reglas, regla],
                    versions: {
                        ...state.versions,
                        [screenKey]: (state.versions[screenKey] || []).map(v =>
                            v.id === node.id ? { ...v, estado: 'conservada', updatedAt: now() } : v
                        ),
                    },
                    hipotesis: node.hipotesisId
                        ? state.hipotesis.map(h =>
                              h.id === node.hipotesisId
                                  ? {
                                        ...h,
                                        estado: 'convertida_en_regla',
                                        updatedAt: now(),
                                        timeline: [...h.timeline, { estado: 'convertida_en_regla', fecha: now() }],
                                    }
                                  : h
                          )
                        : state.hipotesis,
                }));

                get().updateMovidaMadurez(movidaId, 'regla', id);
                return id;
            },

            saveSondaNota: (screenKey, recipe, texto) =>
                set(state => ({
                    sondaNotas: [...state.sondaNotas, { id: uid('sonda'), screenKey, recipe, texto, createdAt: now() }],
                })),

            recordReadObservation: (referenciaId, movidaId, nota) => {
                const exists = get().observaciones.some(
                    o => o.referenciaId === referenciaId && o.movidaId === movidaId
                );
                if (exists) return;
                const obs = { id: uid('obs'), referenciaId, movidaId, nota, createdAt: now() };
                set(state => ({ observaciones: [...state.observaciones, obs] }));
                const sourceCount = get().observaciones.filter(o => o.movidaId === movidaId).length;
                const madurezActual = MOVIDA_BY_ID[movidaId].madurez;
                if (madurezActual === 'semilla' && sourceCount >= 2) {
                    get().updateMovidaMadurez(movidaId, 'ingrediente');
                }
            },
        }),
        {
            name: 'marbella-studio-storage',
            version: 4,
            migrate: (persistedState: any, version: number) => {
                if (version < 4) {
                    // El modelo anterior (contratos/Copiloto) queda DESCARTADO.
                    return {
                        modo: 'decidir',
                        viewport: 'mobile',
                        activeScreenKey: 'movimientos',
                        activeVariantId: null,
                        activeHipotesisId: null,
                        versions: defaultVersions(),
                        hipotesis: [],
                        movidas: MOVIDAS_CATALOGO,
                        reglas: [],
                        sondaNotas: [],
                        observaciones: [],
                    };
                }
                return persistedState;
            },
        }
    )
);

export function designContextDe(state: StudioStateV4): DesignContext {
    const node = versionOf(state.versions, state.activeScreenKey, state.activeVariantId || '');
    return resolverReceta(node ? node.recipe : {});
}
