/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    ViewportPreset,
    Recipe,
    MovidaId,
    Movida,
    Estetica,
    SandboxRoute,
    DesignContext,
    Intensidad,
    SelectedVisualElement,
    VisualOverrides,
} from './types';
import { MOVIDAS_CATALOGO } from './movidas';
import { resolverReceta } from './design-context';
import { REFERENCIAS } from './referencias';

// ============================================================
// STORE DEL SANDBOX VISUAL DE MARBELLA
// Centro de gravedad: ESTÉTICA GLOBAL aplicada a toda Marbella.
// Navegación real entre rutas. Persistencia en localStorage.
// ============================================================

const now = () => new Date().toISOString();
const uid = (prefix: string) =>
    `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const SANDBOX_ROUTES: { id: SandboxRoute; title: string; grupo: string }[] = [
    { id: '/dashboard/ventas', title: 'Ventas', grupo: 'Dashboard' },
    { id: '/dashboard/history', title: 'Cierres / History', grupo: 'Dashboard' },
    { id: '/dashboard/movements', title: 'Movimientos', grupo: 'Dashboard' },
    { id: '/dashboard/labor', title: 'Coste Laboral', grupo: 'Dashboard' },
    { id: '/dashboard/insights', title: 'Insights', grupo: 'Dashboard' },
    { id: '/dashboard/sala', title: 'Radar de Sala', grupo: 'Dashboard' },
    { id: '/staff/history', title: 'Historial Personal', grupo: 'Personal' },
    { id: '/registros', title: 'Fichar / Registro', grupo: 'Personal' },
];

export const ESTETICA_ORIGINAL_ID = 'estetica-original';

function esteticasIniciales(): Estetica[] {
    const hoy = now();
    const base: Estetica[] = [
        {
            id: ESTETICA_ORIGINAL_ID,
            name: 'Marbella Original',
            description: 'La identidad actual de Marbella. Punto de partida.',
            recipe: {},
            parentId: null,
            isOriginal: true,
            createdAt: hoy,
            updatedAt: hoy,
        },
        {
            id: 'est-editorial-v1',
            name: 'Marbella Editorial',
            description: 'Más aire, menos superficies, jerarquía tipográfica marcada.',
            recipe: {
                aire: 'moderado',
                superficies: 'moderado',
                voz_tipografica: 'moderado',
                ruido_navegacion: 'moderado',
                profundidad: 'sutil',
            },
            parentId: ESTETICA_ORIGINAL_ID,
            createdAt: hoy,
            updatedAt: hoy,
        },
        {
            id: 'est-minimal-v1',
            name: 'Marbella Minimal',
            description: 'Superficies mínimas, contraste limpio, navegación silenciosa.',
            recipe: {
                superficies: 'fuerte',
                profundidad: 'nada',
                contraste: 'moderado',
                ruido_navegacion: 'fuerte',
                tratamiento_tablas: 'fuerte',
                peso_botones: 'fuerte',
            },
            parentId: ESTETICA_ORIGINAL_ID,
            createdAt: hoy,
            updatedAt: hoy,
        },
        {
            id: 'est-operativa-v1',
            name: 'Marbella Operativa',
            description: 'Más densidad, controles compactos, mucha información visible.',
            recipe: {
                densidad: 'moderado',
                protagonismo_kpi: 'moderado',
                contraste: 'moderado',
                voz_tipografica: 'sutil',
                tratamiento_tablas: 'moderado',
            },
            parentId: ESTETICA_ORIGINAL_ID,
            createdAt: hoy,
            updatedAt: hoy,
        },
    ];

    const referencias = REFERENCIAS.map(reference => ({
        id: `est-${reference.id}-v1`,
        name: reference.nombre,
        description: reference.descripcion,
        recipe: Object.fromEntries(reference.movidasObservadas.map(move => [move.movidaId, move.intensidad])) as Recipe,
        parentId: ESTETICA_ORIGINAL_ID,
        createdAt: hoy,
        updatedAt: hoy,
    }));

    return [...base, ...referencias];
}

function añadirReferenciasFaltantes(esteticas: Estetica[]): Estetica[] {
    const existentes = new Set(esteticas.map(estetica => estetica.id));
    return [...esteticas, ...esteticasIniciales().filter(estetica => estetica.id.startsWith('est-') && !existentes.has(estetica.id))];
}

interface SandboxState {
    // ---- Contexto visual ----
    viewport: ViewportPreset;
    activeEsteticaId: string;
    esteticas: Estetica[];
    route: SandboxRoute;
    routeHistory: SandboxRoute[];
    labMode: boolean;
    selectedElement: SelectedVisualElement | null;

    // ---- Conservados del modelo anterior (útiles después) ----
    movidas: Movida[];

    // ================= ACCIONES =================

    setViewport: (v: ViewportPreset) => void;
    setRoute: (r: SandboxRoute) => void;
    goBack: () => void;

    // Estéticas: CRUD
    setActiveEstetica: (id: string) => void;
    createEstetica: (name: string, recipe: Recipe, opts?: { description?: string; parentId?: string; overrides?: VisualOverrides }) => string;
    duplicateEstetica: (id: string, newName?: string) => string | null;
    renameEstetica: (id: string, newName: string) => void;
    deleteEstetica: (id: string) => boolean;
    updateEsteticaRecipe: (id: string, recipe: Recipe) => void;
    mergeRecipeIntoEstetica: (esteticaId: string, recipe: Recipe) => void;
    setLabMode: (active: boolean) => void;
    setSelectedElement: (element: SelectedVisualElement | null) => void;
    updateEsteticaOverrides: (id: string, overrides: VisualOverrides) => void;

}

export const useSandboxStore = create<SandboxState>()(
    persist(
        (set, get) => ({
            viewport: 'mobile',
            activeEsteticaId: ESTETICA_ORIGINAL_ID,
            esteticas: esteticasIniciales(),
            route: '/dashboard/ventas',
            routeHistory: [],
            labMode: false,
            selectedElement: null,
            movidas: MOVIDAS_CATALOGO,

            setViewport: v => set({ viewport: v }),

            setRoute: r =>
                set(state => ({
                    route: r,
                    routeHistory: state.route !== r ? [...state.routeHistory, state.route] : state.routeHistory,
                })),

            goBack: () =>
                set(state => {
                    const hist = [...state.routeHistory];
                    const prev = hist.pop();
                    return {
                        routeHistory: hist,
                        route: prev ?? state.route,
                    };
                }),

            setActiveEstetica: id => {
                const existe = get().esteticas.some(e => e.id === id);
                if (existe) set({ activeEsteticaId: id });
            },

            createEstetica: (name, recipe, opts) => {
                const id = uid('est');
                const e: Estetica = {
                    id,
                    name,
                    description: opts?.description,
                    recipe,
                    overrides: opts?.overrides ?? {},
                    parentId: opts?.parentId ?? get().activeEsteticaId,
                    createdAt: now(),
                    updatedAt: now(),
                };
                set(state => ({
                    esteticas: [...state.esteticas, e],
                    activeEsteticaId: id,
                }));
                return id;
            },

            duplicateEstetica: (id, newName) => {
                const origen = get().esteticas.find(e => e.id === id);
                if (!origen) return null;
                const nombre = newName ?? `${origen.name} (copia)`;
                return get().createEstetica(nombre, { ...origen.recipe }, {
                    description: origen.description,
                    parentId: id,
                    overrides: { ...origen.overrides },
                });
            },

            renameEstetica: (id, newName) =>
                set(state => ({
                    esteticas: state.esteticas.map(e =>
                        e.id === id && !e.isOriginal
                            ? { ...e, name: newName, updatedAt: now() }
                            : e
                    ),
                })),

            deleteEstetica: id => {
                const est = get().esteticas.find(e => e.id === id);
                if (!est || est.isOriginal) return false;
                const remaining = get().esteticas.filter(e => e.id !== id);
                set(state => ({
                    esteticas: remaining,
                    activeEsteticaId: state.activeEsteticaId === id ? ESTETICA_ORIGINAL_ID : state.activeEsteticaId,
                }));
                return true;
            },

            updateEsteticaRecipe: (id, recipe) =>
                set(state => ({
                    esteticas: state.esteticas.map(e =>
                        e.id === id && !e.isOriginal
                            ? { ...e, recipe, updatedAt: now() }
                            : e
                    ),
                })),

            mergeRecipeIntoEstetica: (esteticaId, recipePatch) => {
                const est = get().esteticas.find(e => e.id === esteticaId);
                if (!est || est.isOriginal) return;
                const merged: Recipe = { ...est.recipe };
                for (const [k, v] of Object.entries(recipePatch)) {
                    merged[k as MovidaId] = v as Intensidad;
                }
                get().updateEsteticaRecipe(esteticaId, merged);
            },

            setLabMode: active => set({ labMode: active, selectedElement: active ? get().selectedElement : null }),
            setSelectedElement: element => set({ selectedElement: element }),
            updateEsteticaOverrides: (id, overrides) =>
                set(state => ({
                    esteticas: state.esteticas.map(e =>
                        e.id === id && !e.isOriginal ? { ...e, overrides, updatedAt: now() } : e
                    ),
                })),

        }),
        {
            name: 'marbella-sandbox-storage',
            version: 6,
            migrate: (persistedState: any, version: number) => {
                if (version < 5) {
                    return {
                        viewport: 'mobile',
                        activeEsteticaId: ESTETICA_ORIGINAL_ID,
                        esteticas: esteticasIniciales(),
                        route: '/dashboard/ventas' as SandboxRoute,
                        routeHistory: [],
                        movidas: MOVIDAS_CATALOGO,
                    };
                }
                if (version < 6) {
                    return {
                        ...persistedState,
                        esteticas: añadirReferenciasFaltantes((persistedState.esteticas ?? []).map((e: Estetica) => ({ ...e, overrides: e.overrides ?? {} }))),
                        labMode: false,
                        selectedElement: null,
                    };
                }
                return persistedState;
            },
        }
    )
);

// ============================================================
// SELECTORES
// ============================================================

export function useActiveEstetica(): Estetica {
    const activa = useSandboxStore(s => s.esteticas.find(e => e.id === s.activeEsteticaId));
    return activa ?? useSandboxStore.getState().esteticas[0];
}

export function activeEsteticaRecipe(): Recipe {
    const s = useSandboxStore.getState();
    const est = s.esteticas.find(e => e.id === s.activeEsteticaId);
    return est?.recipe ?? {};
}

export function designContextDeEsteticaActiva(): DesignContext {
    return resolverReceta(activeEsteticaRecipe());
}
