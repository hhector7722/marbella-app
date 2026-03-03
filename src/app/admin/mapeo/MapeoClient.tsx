'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { linkTpvToRecipe } from './actions';
import type { TpvArticle, Recipe } from './page';
import { cn } from '@/lib/utils';
import { Search, ChevronDown, Check, Loader2 } from 'lucide-react';

export function MapeoClient({
    pendingArticles,
    recipes
}: {
    pendingArticles: TpvArticle[];
    recipes: Recipe[];
}) {
    const [searchTerm, setSearchTerm] = useState('');

    // State to manage individual row states (selected recipe, portion factor, loading)
    const [rowStates, setRowStates] = useState<Record<number, {
        selectedRecipeId: string | null;
        portionFactor: string; // Keep as string for better input control
        isSubmitting: boolean;
        error: string | null;
    }>>({});

    // Filter pending articles by a general search if we want (optional, but good for UX)
    const filteredArticles = useMemo(() => {
        if (!searchTerm.trim()) return pendingArticles;
        const lowerSearch = searchTerm.toLowerCase();
        return pendingArticles.filter(a => a.nombre.toLowerCase().includes(lowerSearch));
    }, [pendingArticles, searchTerm]);

    // Handle setting a recipe for a specific row
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

    // Handle Factor change
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

    // Handle Form Submit
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

        // Set loading
        setRowStates(prev => ({
            ...prev,
            [articleId]: { ...prev[articleId], isSubmitting: true, error: null }
        }));

        const result = await linkTpvToRecipe(articleId, rowState.selectedRecipeId, factor);

        if (!result.success) {
            setRowStates(prev => ({
                ...prev,
                [articleId]: { ...prev[articleId], isSubmitting: false, error: result.error || 'Error al vincular' }
            }));
        }
        // On success, Next.js revalidatePath will refresh the page and remove the row
    };

    return (
        <div className="flex flex-col gap-6">
            {/* Search Pending Articles Bar */}
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                <input
                    type="text"
                    placeholder="Buscar un artículo del TPV..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-12 pl-12 pr-4 bg-white border border-zinc-200 rounded-xl text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#5B8FB9] focus:border-transparent transition-all shadow-sm"
                />
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-zinc-100 overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-12 gap-4 p-4 border-b border-zinc-100 bg-zinc-50/50 text-sm font-semibold text-zinc-600">
                    <div className="col-span-12 md:col-span-4">Artículo TPV</div>
                    <div className="col-span-12 md:col-span-4">Receta a Vincular</div>
                    <div className="col-span-6 md:col-span-2 text-center md:text-left">Factor Porción</div>
                    <div className="col-span-6 md:col-span-2 text-right">Acción</div>
                </div>

                {/* List */}
                <div className="divide-y divide-zinc-100">
                    {filteredArticles.map((article) => {
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
                                {/* Article Name */}
                                <div className="col-span-12 md:col-span-4 font-medium text-zinc-900">
                                    <div className="flex flex-col">
                                        <span>{article.nombre}</span>
                                        <span className="text-xs text-zinc-400 font-mono">ID: {article.id}</span>
                                    </div>
                                </div>

                                {/* Recipe Selector */}
                                <div className="col-span-12 md:col-span-4">
                                    <RecipeCombobox
                                        recipes={recipes}
                                        selectedId={state.selectedRecipeId}
                                        onSelect={(rid) => handleSelectRecipe(article.id, rid)}
                                    />
                                    {state.error && (
                                        <span className="text-xs text-red-500 mt-1 block">{state.error}</span>
                                    )}
                                </div>

                                {/* Portion Factor Input */}
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

                                {/* Submit Action */}
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
                                        {state.isSubmitting ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <>
                                                <Check className="w-5 h-5" />
                                                <span>Vincular</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    {filteredArticles.length === 0 && (
                        <div className="p-12 text-center text-zinc-500">
                            No se encontraron artículos TPV que coincidan con la búsqueda.
                        </div>
                    )}
                </div>
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

    // Close on outside click is tricky to do without a full hook, but we handle it minimally
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
            {/* Trigger Button */}
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

            {/* Popover */}
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
