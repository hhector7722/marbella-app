'use client';

import { useState, useMemo, useRef, useEffect, useTransition } from 'react';
import { linkTpvToRecipe, unlinkTpvFromRecipe } from './actions';
import type { TpvArticle, Recipe } from './page';
import { cn } from '@/lib/utils';
import { Search, ChevronDown, Check, Loader2, Trash2 } from 'lucide-react';

export type CompletedMapping = {
    articulo_id: number;
    nombre_tpv: string;
    recipe_id: string;
    nombre_app: string;
    factor_porcion: number;
};

export function MapeoClient({
    pendingArticles,
    recipes,
    completedMappings
}: {
    pendingArticles: TpvArticle[];
    recipes: Recipe[];
    completedMappings: CompletedMapping[];
}) {
    const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
    const [searchTerm, setSearchTerm] = useState('');
    const [isPending, startTransition] = useTransition();

    // -- PENDING STATE --
    const [rowStates, setRowStates] = useState<Record<number, {
        selectedRecipeId: string | null;
        portionFactor: string;
        isSubmitting: boolean;
        error: string | null;
    }>>({});

    const filteredPending = useMemo(() => {
        if (!searchTerm.trim()) return pendingArticles;
        const lowerSearch = searchTerm.toLowerCase();
        return pendingArticles.filter(a => a.nombre.toLowerCase().includes(lowerSearch));
    }, [pendingArticles, searchTerm]);

    const handleSelectRecipe = (articleId: number, recipeId: string) => {
        setRowStates(prev => ({
            ...prev,
            [articleId]: {
                selectedRecipeId: recipeId,
                portionFactor: prev[articleId]?.portionFactor || '1.0',
                isSubmitting: false,
                error: null
            }
        }));
    };

    const handleFactorChange = (articleId: number, value: string) => {
        setRowStates(prev => ({
            ...prev,
            [articleId]: {
                selectedRecipeId: prev[articleId]?.selectedRecipeId || null,
                portionFactor: value,
                isSubmitting: prev[articleId]?.isSubmitting || false,
                error: null
            }
        }));
    };

    const handleLink = async (articleId: number) => {
        const rowState = rowStates[articleId];
        if (!rowState || !rowState.selectedRecipeId) return;

        const factor = parseFloat(rowState.portionFactor);
        if (isNaN(factor) || factor <= 0) {
            setRowStates(prev => ({
                ...prev,
                [articleId]: { ...prev[articleId], error: 'Factor inválido' }
            }));
            return;
        }

        setRowStates(prev => ({
            ...prev,
            [articleId]: { ...prev[articleId], isSubmitting: true, error: null }
        }));

        startTransition(async () => {
            const result = await linkTpvToRecipe(articleId, rowState.selectedRecipeId!, factor);
            if (!result.success) {
                setRowStates(prev => ({
                    ...prev,
                    [articleId]: { ...prev[articleId], isSubmitting: false, error: result.error || 'Error al vincular' }
                }));
            }
        });
    };

    // -- COMPLETED STATE --
    const [unlinkingId, setUnlinkingId] = useState<number | null>(null);

    const filteredCompleted = useMemo(() => {
        if (!searchTerm.trim()) return completedMappings;
        const lowerSearch = searchTerm.toLowerCase();
        return completedMappings.filter(m =>
            m.nombre_tpv.toLowerCase().includes(lowerSearch) ||
            m.nombre_app.toLowerCase().includes(lowerSearch)
        );
    }, [completedMappings, searchTerm]);

    const handleUnlink = async (articleId: number) => {
        setUnlinkingId(articleId);
        startTransition(async () => {
            await unlinkTpvFromRecipe(articleId);
            setUnlinkingId(null);
        });
    };

    return (
        <div className="flex flex-col gap-6">
            {/* TABS + SEARCH */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                {/* Search */}
                <div className="relative w-full md:w-[350px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <input
                        type="text"
                        placeholder={activeTab === 'pending' ? 'Buscar pendiente...' : 'Buscar mapeado...'}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-12 pl-12 pr-4 bg-white border border-zinc-200 rounded-xl text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#5B8FB9] focus:border-transparent shadow-sm"
                    />
                </div>

                {/* Tabs Toggle (Arquitecto UI Kiosco) */}
                <div className="flex bg-zinc-100 p-1.5 rounded-xl w-full md:w-auto shrink-0 shadow-inner">
                    <button
                        onClick={() => setActiveTab('pending')}
                        className={cn(
                            "flex-1 md:flex-none px-6 h-[38px] rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2",
                            activeTab === 'pending' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                        )}
                    >
                        <span>Pendientes</span>
                        <span className={cn(
                            "px-2 py-0.5 rounded-full text-xs",
                            activeTab === 'pending' ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200 text-zinc-600"
                        )}>
                            {pendingArticles.length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('completed')}
                        className={cn(
                            "flex-1 md:flex-none px-6 h-[38px] rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2",
                            activeTab === 'completed' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                        )}
                    >
                        <span>Auditoría</span>
                        <span className={cn(
                            "px-2 py-0.5 rounded-full text-xs",
                            activeTab === 'completed' ? "bg-blue-100 text-[#36606F]" : "bg-zinc-200 text-zinc-600"
                        )}>
                            {completedMappings.length}
                        </span>
                    </button>
                </div>
            </div>

            {/* BENTO CONTAINER */}
            <div className="bg-white rounded-xl shadow-sm border border-zinc-100 overflow-hidden min-h-[400px]">

                {/* --- PENDING VIEW --- */}
                {activeTab === 'pending' && (
                    <>
                        {/* Header */}
                        <div className="grid grid-cols-12 gap-4 p-4 border-b border-zinc-100 bg-zinc-50/50 text-sm font-semibold text-zinc-600">
                            <div className="col-span-12 md:col-span-4">Artículo TPV</div>
                            <div className="col-span-12 md:col-span-4">Receta a Vincular</div>
                            <div className="col-span-6 md:col-span-2 text-center md:text-left">Factor</div>
                            <div className="col-span-6 md:col-span-2 text-right">Acción</div>
                        </div>

                        {/* List */}
                        <div className="divide-y divide-zinc-100">
                            {filteredPending.map((article) => {
                                const state = rowStates[article.id] || {
                                    selectedRecipeId: null,
                                    portionFactor: '1.0',
                                    isSubmitting: false,
                                    error: null
                                };

                                return (
                                    <div
                                        key={article.id}
                                        className={cn(
                                            "grid grid-cols-12 gap-4 p-4 items-center transition-colors hover:bg-zinc-50/50",
                                            state.isSubmitting && "opacity-60 pointer-events-none"
                                        )}
                                    >
                                        <div className="col-span-12 md:col-span-4 font-medium text-zinc-900">
                                            <div className="flex flex-col">
                                                <span>{article.nombre}</span>
                                                <span className="text-xs text-zinc-400 font-mono">ID: {article.id}</span>
                                            </div>
                                        </div>

                                        <div className="col-span-12 md:col-span-4">
                                            <RecipeCombobox
                                                recipes={recipes}
                                                selectedId={state.selectedRecipeId}
                                                onSelect={(rid) => handleSelectRecipe(article.id, rid)}
                                            />
                                            {state.error && <span className="text-xs text-red-500 mt-1 block">{state.error}</span>}
                                        </div>

                                        <div className="col-span-6 md:col-span-2 flex justify-center md:justify-start">
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0.01"
                                                value={state.portionFactor}
                                                onChange={(e) => handleFactorChange(article.id, e.target.value)}
                                                className="w-full max-w-[120px] h-12 px-3 text-center bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-900 font-medium focus:outline-none focus:ring-2 focus:ring-[#5B8FB9] focus:bg-white transition-all Touch-Target"
                                            />
                                        </div>

                                        <div className="col-span-6 md:col-span-2 flex justify-end">
                                            <button
                                                onClick={() => handleLink(article.id)}
                                                disabled={!state.selectedRecipeId || state.isSubmitting}
                                                className={cn(
                                                    "h-12 px-6 rounded-xl font-medium transition-all flex items-center justify-center gap-2 min-w-[110px]",
                                                    state.selectedRecipeId
                                                        ? "bg-[#36606F] hover:bg-[#2A4B57] text-white shadow-sm"
                                                        : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                                                )}
                                            >
                                                {state.isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <> <Check className="w-5 h-5" /> <span>Vincular</span> </>}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {filteredPending.length === 0 && (
                                <div className="p-12 text-center text-zinc-500">
                                    {pendingArticles.length === 0 ? "¡Felicidades! No hay artículos pendientes de mapear." : "No hay resultados para tu búsqueda."}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* --- COMPLETED (AUDIT) VIEW --- */}
                {activeTab === 'completed' && (
                    <>
                        <div className="grid grid-cols-12 gap-4 p-4 border-b border-zinc-100 bg-zinc-50/50 text-sm font-semibold text-zinc-600">
                            <div className="col-span-12 md:col-span-4">Artículo TPV</div>
                            <div className="col-span-12 md:col-span-4">Receta Vinculada (App)</div>
                            <div className="col-span-6 md:col-span-2 text-center md:text-left">Factor Porción</div>
                            <div className="col-span-6 md:col-span-2 text-right">Acción</div>
                        </div>

                        <div className="divide-y divide-zinc-100">
                            {filteredCompleted.map((mapping) => {
                                const isUnlinking = unlinkingId === mapping.articulo_id;
                                return (
                                    <div key={mapping.articulo_id} className={cn("grid grid-cols-12 gap-4 p-4 items-center transition-colors hover:bg-zinc-50/50", isUnlinking && "opacity-50 pointer-events-none")}>
                                        <div className="col-span-12 md:col-span-4 font-medium text-zinc-900">
                                            <div className="flex flex-col">
                                                <span>{mapping.nombre_tpv}</span>
                                                <span className="text-xs text-zinc-400 font-mono">ID: {mapping.articulo_id}</span>
                                            </div>
                                        </div>

                                        <div className="col-span-12 md:col-span-4 flex items-center gap-2 text-[#36606F] font-medium">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                            <span>{mapping.nombre_app}</span>
                                        </div>

                                        <div className="col-span-6 md:col-span-2 flex items-center justify-center md:justify-start">
                                            <span className="px-3 py-1 bg-zinc-100 text-zinc-700 rounded-md font-mono text-sm">
                                                x {mapping.factor_porcion}
                                            </span>
                                        </div>

                                        <div className="col-span-6 md:col-span-2 flex justify-end">
                                            <button
                                                onClick={() => handleUnlink(mapping.articulo_id)}
                                                disabled={isUnlinking}
                                                className="h-12 w-12 rounded-xl text-rose-500 bg-rose-50 hover:bg-rose-100 border border-rose-100 transition-colors flex items-center justify-center Touch-Target"
                                                title="Desvincular"
                                            >
                                                {isUnlinking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {filteredCompleted.length === 0 && (
                                <div className="p-12 text-center text-zinc-500">
                                    No hay mappings completados registrados.
                                </div>
                            )}
                        </div>
                    </>
                )}

            </div>
        </div>
    );
}

// A custom Combobox specifically for touch interfaces (Arquitecto UI Kiosco)
function RecipeCombobox({
    recipes,
    selectedId,
    onSelect
}: {
    recipes: Recipe[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selectedRecipe = useMemo(() => recipes.find(r => r.id === selectedId), [recipes, selectedId]);

    const filteredRecipes = useMemo(() => {
        if (!search.trim()) return recipes.slice(0, 50); // Show max 50 for performance
        const lowerSearch = search.toLowerCase();
        return recipes.filter(r => r.name.toLowerCase().includes(lowerSearch)).slice(0, 50);
    }, [recipes, search]);

    return (
        <div className="relative" ref={wrapperRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full h-12 px-4 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-xl flex items-center justify-between text-left transition-colors"
            >
                <span className={cn(
                    "truncate pr-2 font-medium",
                    selectedRecipe ? "text-zinc-900" : "text-zinc-400"
                )}>
                    {selectedRecipe ? selectedRecipe.name : "Seleccionar receta..."}
                </span>
                <ChevronDown className={cn("w-5 h-5 text-zinc-400 shrink-0 transition-transform", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute z-50 top-[calc(100%+8px)] left-0 w-full bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2 border-b border-zinc-100 bg-zinc-50">
                        <input
                            type="text"
                            autoFocus
                            placeholder="Buscar receta..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full h-10 px-3 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]"
                        />
                    </div>
                    <div className="max-h-[240px] overflow-y-auto">
                        {filteredRecipes.length === 0 ? (
                            <div className="p-4 text-center text-sm text-zinc-500">
                                No hay resultados
                            </div>
                        ) : (
                            <ul className="py-1">
                                {filteredRecipes.map((recipe) => (
                                    <li key={recipe.id}>
                                        <button
                                            onClick={() => {
                                                onSelect(recipe.id);
                                                setIsOpen(false);
                                                setSearch('');
                                            }}
                                            className={cn(
                                                "w-full px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-zinc-100",
                                                recipe.id === selectedId ? "bg-emerald-50 text-emerald-700" : "text-zinc-700"
                                            )}
                                        >
                                            {recipe.name}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
