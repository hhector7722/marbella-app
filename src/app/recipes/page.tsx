'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import { ChefHat, Search, Plus, Trash2, X, ChevronDown, Users, Camera, Edit2, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import CreateModal from '@/components/CreateRecipeModal';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn } from '@/lib/utils';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import {
    type MenuCategoryRow,
    denormalizedRecipeCategoryName,
    labelMenuCategoryForRecipesEs,
    menuCategoryFromUrlParam,
    menuCategoryToUrlParam,
    sortMenuCategoriesForRecipes,
} from '@/lib/recipe-menu-categories';
import { resolveIngredientRecipeUnit } from '@/lib/recipe-cost';
import {
    FOOD_COST_FILTER_OPTIONS,
    type FoodCostStatus,
    getRecipeFoodCostStatus,
    parseFoodCostFilterParam,
    RECIPE_FOOD_COST_SELECT,
} from '@/lib/recipe-food-cost';
import { ImageLightbox } from '@/components/ui/ImageLightbox';

interface Recipe {
    id: string;
    name: string;
    category: string;
    menu_category_id?: string | null;
    sale_price: number;
    photo_url: string | null;
    servings?: number;
    recipe_ingredients?: {
        quantity_gross: number;
        unit: string | null;
        ingredients: { current_price: number; purchase_unit?: string; supplier_pricing_mode?: string; pack_unit_size_qty?: number | null; pack_unit_size_unit?: string | null } | { current_price: number; purchase_unit?: string; supplier_pricing_mode?: string; pack_unit_size_qty?: number | null; pack_unit_size_unit?: string | null }[] | null;
    }[];
}

function RecipesContent() {
    const supabase = createClient();
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showCategoryPopup, setShowCategoryPopup] = useState(false);
    const [showFoodCostSubfilter, setShowFoodCostSubfilter] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newRecipe, setNewRecipe] = useState<any>({ name: '', menu_category_id: '', category: '', sale_price: 0, ingredients: [] });
    const [isCreating, setIsCreating] = useState(false);
    const [allIngredients, setAllIngredients] = useState<any[]>([]);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
    const [fullRecipeData, setFullRecipeData] = useState<any>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [isPhotoLightboxOpen, setIsPhotoLightboxOpen] = useState(false);
    /** Lista para flechas anterior/siguiente (misma regla que `/recipes/[id]`: orden nombre, opcional filtro categoría URL). */
    const [staffNavRecipes, setStaffNavRecipes] = useState<Array<{ id: string }>>([]);

    useModalUsageTracking({
        open: !!selectedRecipeId,
        usageId: 'recipe-detail-overlay',
        usageLabel: 'Detalle receta (lista)',
    });
    const [menuCategoryRows, setMenuCategoryRows] = useState<MenuCategoryRow[]>([]);
    const [mcoEsByCategoryId, setMcoEsByCategoryId] = useState<Map<string, string | null>>(() => new Map());
    const router = useRouter();

    const searchParams = useSearchParams();
    const isStaffView = searchParams.get('view') === 'staff';
    const categoryFromUrl = searchParams.get('cat');
    const foodCostFilter = parseFoodCostFilterParam(searchParams.get('fc'));

    const buildRecipesHref = (id: string) => {
        const qs = new URLSearchParams(searchParams.toString());
        return qs.toString() ? `/recipes/${id}?${qs.toString()}` : `/recipes/${id}`;
    };

    /** Ficha completa con edición (quita `view=staff` para no forzar modo restringido en `/recipes/[id]`). */
    const buildRecipesFullEditHref = (id: string) => {
        const qs = new URLSearchParams(searchParams.toString());
        qs.delete('view');
        const s = qs.toString();
        return s ? `/recipes/${id}?${s}` : `/recipes/${id}`;
    };

    const setCategoryAndUrl = (cat: string | null) => {
        const qs = new URLSearchParams(searchParams.toString());
        if (cat) qs.set('cat', cat);
        else qs.delete('cat');
        const next = qs.toString();
        router.replace(next ? `/recipes?${next}` : '/recipes');
    };

    const setFoodCostAndUrl = (status: FoodCostStatus | null) => {
        const qs = new URLSearchParams(searchParams.toString());
        if (status) qs.set('fc', status);
        else qs.delete('fc');
        const next = qs.toString();
        router.replace(next ? `/recipes?${next}` : '/recipes');
    };

    useEffect(() => {
        void (async () => {
            const [catRes, mcoRes] = await Promise.all([
                supabase
                    .from('categories')
                    .select('id, name, slug, parent_id, sort_order')
                    .eq('scope', 'menu')
                    .order('sort_order', { ascending: true })
                    .limit(5000),
                supabase.from('menu_category_overrides').select('category_id, override_name_es').limit(5000),
            ]);
            if (!catRes.error && catRes.data) setMenuCategoryRows(catRes.data as MenuCategoryRow[]);
            const m = new Map<string, string | null>();
            for (const row of (mcoRes.data ?? []) as { category_id: string; override_name_es: string | null }[]) {
                m.set(row.category_id, row.override_name_es ?? null);
            }
            setMcoEsByCategoryId(m);
        })();
    }, [supabase]);

    useEffect(() => {
        if (menuCategoryRows.length === 0 || !categoryFromUrl) return;
        const resolved = menuCategoryFromUrlParam(categoryFromUrl, menuCategoryRows);
        if (!resolved) return;
        const canonical = menuCategoryToUrlParam(resolved);
        if (canonical !== categoryFromUrl) {
            const qs = new URLSearchParams(searchParams.toString());
            qs.set('cat', canonical);
            const next = qs.toString();
            router.replace(next ? `/recipes?${next}` : '/recipes');
        }
    }, [menuCategoryRows, categoryFromUrl, router, searchParams, supabase]);

    const sortedMenuCategoryRows = useMemo(() => sortMenuCategoriesForRecipes(menuCategoryRows), [menuCategoryRows]);

    const menuCategoryOptions = useMemo(
        () =>
            sortedMenuCategoryRows.map((r) => ({
                id: r.id,
                label: labelMenuCategoryForRecipesEs(r, sortedMenuCategoryRows, mcoEsByCategoryId),
            })),
        [sortedMenuCategoryRows, mcoEsByCategoryId],
    );

    const showUncategorizedMenuFilter = useMemo(
        () => recipes.some((r) => !r.menu_category_id),
        [recipes],
    );

    const selectedCategoryFilterLabel = useMemo(() => {
        if (!categoryFromUrl) return '';
        if (categoryFromUrl === '__none__') return 'Sin categoría menú';
        const row = menuCategoryFromUrlParam(categoryFromUrl, menuCategoryRows);
        if (row) return labelMenuCategoryForRecipesEs(row, sortedMenuCategoryRows, mcoEsByCategoryId);
        return categoryFromUrl;
    }, [categoryFromUrl, menuCategoryRows, sortedMenuCategoryRows, mcoEsByCategoryId]);

    const recipeMenuLabel = (recipe: Recipe) => {
        if (!recipe.menu_category_id) return (recipe.category || '').trim() || ' ';
        const row = menuCategoryRows.find((x) => x.id === recipe.menu_category_id);
        if (!row) return (recipe.category || '').trim() || ' ';
        return labelMenuCategoryForRecipesEs(row, sortedMenuCategoryRows, mcoEsByCategoryId);
    };

    const selectedFoodCostFilterLabel = useMemo(() => {
        if (!foodCostFilter) return '';
        return FOOD_COST_FILTER_OPTIONS.find((o) => o.status === foodCostFilter)?.label ?? '';
    }, [foodCostFilter]);

    const filteredRecipes = recipes.filter((recipe) => {
        const matchesSearch = recipe.name.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;
        if (foodCostFilter && getRecipeFoodCostStatus(recipe) !== foodCostFilter) return false;
        if (!categoryFromUrl) return true;
        if (categoryFromUrl === '__none__') return !recipe.menu_category_id;
        const row = menuCategoryFromUrlParam(categoryFromUrl, menuCategoryRows);
        if (row) return recipe.menu_category_id === row.id;
        return (recipe.category || '') === categoryFromUrl;
    });

    useEffect(() => {
        fetchRecipes();
        fetchIngredients();
        const checkRole = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
                if (data) setUserRole(data.role);
            }
        };
        checkRole();
    }, []);

    useEffect(() => {
        if (selectedRecipeId) {
            fetchRecipeDetails(selectedRecipeId);
        } else {
            setFullRecipeData(null);
        }
    }, [selectedRecipeId]);

    useEffect(() => {
        if (!isStaffView || !selectedRecipeId) return;
        void (async () => {
            const needsFc = !!foodCostFilter;
            let q = supabase
                .from('recipes')
                .select(needsFc ? RECIPE_FOOD_COST_SELECT : 'id')
                .order('name');
            const cat = categoryFromUrl;
            if (cat && cat !== '__none__') {
                const row = menuCategoryRows.length ? menuCategoryFromUrlParam(cat, menuCategoryRows) : null;
                if (row) q = q.eq('menu_category_id', row.id);
                else q = q.eq('category', cat);
            } else if (cat === '__none__') {
                q = q.is('menu_category_id', null);
            }
            const { data, error } = await q;
            if (error || !data) {
                setStaffNavRecipes([]);
                return;
            }
            const list = foodCostFilter
                ? data.filter((r) => getRecipeFoodCostStatus(r) === foodCostFilter)
                : data;
            setStaffNavRecipes(list.map((r) => ({ id: r.id })));
        })();
    }, [isStaffView, selectedRecipeId, categoryFromUrl, foodCostFilter, menuCategoryRows, supabase]);

    const staffNavIndex = staffNavRecipes.findIndex((r) => r.id === selectedRecipeId);

    const modalElaborationSteps = useMemo(() => {
        const raw = fullRecipeData?.elaboration;
        if (!raw || typeof raw !== 'string') return [] as string[];
        const lines = raw.includes('\n') ? raw.split('\n') : [raw];
        return lines.map((s) => s.trim()).filter(Boolean);
    }, [fullRecipeData?.elaboration]);

    const modalPresentationSteps = useMemo(() => {
        const raw = fullRecipeData?.presentation;
        if (!raw || typeof raw !== 'string') return [] as string[];
        const lines = raw.includes('\n') ? raw.split('\n') : [raw];
        return lines.map((s) => s.trim()).filter(Boolean);
    }, [fullRecipeData?.presentation]);

    const modalSortedIngredients = useMemo(() => {
        const list = fullRecipeData?.recipe_ingredients ?? [];
        return [...list].sort((a: any, b: any) =>
            (a.ingredients?.name || '').localeCompare(b.ingredients?.name || ''),
        );
    }, [fullRecipeData?.recipe_ingredients]);

    const isRestricted = isStaffView || (userRole !== 'manager' && userRole !== 'supervisor' && userRole !== null);
    const canEditRecipeFromModal = userRole === 'manager' || userRole === 'supervisor';

    async function fetchRecipeDetails(id: string) {
        try {
            setLoadingDetails(true);
            const { data, error } = await supabase
                .from('recipes')
                .select(`*, recipe_ingredients (*, ingredients (*))`)
                .eq('id', id)
                .single();
            if (error) throw error;
            setFullRecipeData(data);
        } catch (error) {
            console.error('Error fetching details:', error);
            toast.error('Error al cargar detalles');
        } finally {
            setLoadingDetails(false);
        }
    }

    async function fetchRecipes() {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('recipes')
                .select(
                    `id, name, category, menu_category_id, sale_price, photo_url, servings, recipe_ingredients (quantity_gross, unit, ingredients (current_price, purchase_unit, supplier_pricing_mode, pack_unit_size_qty, pack_unit_size_unit))`,
                )
                .order('name');
            if (error) throw error;
            setRecipes(data || []);
        } catch (error) { console.error('Error fetching recipes:', error); } finally { setLoading(false); }
    }

    async function fetchIngredients() {
        const { data } = await supabase.from('ingredients').select('*').order('name');
        if (data) setAllIngredients(data);
    }

    async function handleCreateRecipe() {
        if (!newRecipe.name?.trim() || !newRecipe.menu_category_id) {
            toast.error('Nombre y categoría de menú son obligatorios')
            return
        }
        const opt = menuCategoryOptions.find((o) => o.id === newRecipe.menu_category_id);
        const row = menuCategoryRows.find((r) => r.id === newRecipe.menu_category_id);
        const categoryLabel = (opt?.label ?? newRecipe.category ?? '').trim();
        if (!categoryLabel) {
            toast.error('Categoría no válida');
            return;
        }
        const categoryDb = row ? denormalizedRecipeCategoryName(row) : categoryLabel.slice(0, 100);
        try {
            setIsCreating(true);
            const { data: recipe, error: recipeError } = await supabase
                .from('recipes')
                .insert({
                    name: newRecipe.name.trim(),
                    category: categoryDb,
                    menu_category_id: newRecipe.menu_category_id,
                    sale_price: newRecipe.sale_price || null,
                    servings: newRecipe.servings || 1,
                })
                .select()
                .single();
            if (recipeError) throw recipeError;
            if (newRecipe.ingredients && newRecipe.ingredients.length > 0) {
                const ingredientsToInsert = newRecipe.ingredients.map((ing: any) => {
                    const catalog = allIngredients.find((a: { id: string }) => a.id === ing.ingredient_id);
                    const unit = ing.unit
                        ? ing.unit
                        : catalog
                          ? resolveIngredientRecipeUnit(catalog.recipe_unit, catalog.purchase_unit || 'kg')
                          : 'kg';
                    return {
                        recipe_id: recipe.id,
                        ingredient_id: ing.ingredient_id,
                        quantity_gross: ing.quantity || 0,
                        unit,
                    };
                });
                await supabase.from('recipe_ingredients').insert(ingredientsToInsert);
            }
            toast.success('Receta creada');
            await fetchRecipes();
            setShowCreateModal(false);
            const tap = menuCategoryRows.find((r) => r.slug === 'tapas');
            setNewRecipe({
                name: '',
                menu_category_id: tap?.id ?? '',
                category: tap ? denormalizedRecipeCategoryName(tap) : '',
                sale_price: 0,
                ingredients: [],
            });
        } catch (error: any) { toast.error('Error: ' + error.message); } finally { setIsCreating(false); }
    }

    const getRecipeHealthColor = (recipe: Recipe) => {
        const status = getRecipeFoodCostStatus(recipe);
        if (status === 'optimal') return 'text-green-600';
        if (status === 'alert') return 'text-amber-500';
        if (status === 'critical') return 'text-red-600';
        return 'text-gray-400';
    };

    const closeCategoryPopup = () => {
        setShowCategoryPopup(false);
        setShowFoodCostSubfilter(false);
    };

    const applyFoodCostFilter = (status: FoodCostStatus) => {
        setFoodCostAndUrl(status);
        closeCategoryPopup();
    };

    return (
        <div className="p-4 md:p-6 w-full min-h-screen pb-24">
            <Toaster position="top-right" />
            <ImageLightbox
                open={isPhotoLightboxOpen}
                src={fullRecipeData?.photo_url}
                alt={fullRecipeData?.name}
                onClose={() => setIsPhotoLightboxOpen(false)}
            />
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-row items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                        <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 md:left-4 md:h-4 md:w-4" />
                        <input
                            type="text"
                            placeholder="Buscar..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={cn(
                                'w-full rounded-xl bg-white py-2 pr-2 pl-8 text-xs font-medium text-gray-700 shadow-sm outline-none md:rounded-2xl md:py-2.5 md:pr-4 md:pl-10 md:text-sm',
                                'focus:ring-2 focus:ring-[#36606F]/25',
                            )}
                        />
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
                            {foodCostFilter ? (
                                <div className="flex max-w-[100px] items-center gap-1 rounded-xl border border-white bg-white py-1 pl-2.5 pr-1 shadow-md md:max-w-md md:rounded-2xl md:py-1.5 md:pl-4 md:pr-1.5">
                                    <span
                                        className={cn(
                                            'truncate text-[9px] font-black uppercase tracking-widest md:text-[10px]',
                                            FOOD_COST_FILTER_OPTIONS.find((o) => o.status === foodCostFilter)?.colorClass ?? 'text-zinc-800',
                                        )}
                                        title={`Food Cost: ${selectedFoodCostFilterLabel}`}
                                    >
                                        FC {selectedFoodCostFilterLabel}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setFoodCostAndUrl(null)}
                                        className="shrink-0 rounded-xl p-1 transition-colors hover:bg-zinc-100 md:p-1.5"
                                        aria-label="Quitar filtro food cost"
                                    >
                                        <X size={12} className="text-rose-500 md:w-3.5 md:h-3.5" strokeWidth={4} />
                                    </button>
                                </div>
                            ) : null}
                            {!categoryFromUrl ? (
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (showCategoryPopup) closeCategoryPopup();
                                            else setShowCategoryPopup(true);
                                        }}
                                        className="px-2.5 md:px-5 py-2 md:py-2.5 bg-white/90 hover:bg-white rounded-xl md:rounded-2xl font-black text-[9px] md:text-[10px] text-zinc-800 uppercase tracking-widest shadow-sm transition-all flex items-center gap-1 md:gap-2 border border-white/50 min-h-12"
                                    >
                                        <span className="hidden sm:inline">Categoría</span>
                                        <span className="sm:hidden">Cat.</span>
                                        <ChevronDown size={12} className="text-zinc-400 md:w-3.5 md:h-3.5" />
                                    </button>
                                    {showCategoryPopup && (
                                        <>
                                            <div className="fixed inset-0 z-30" onClick={closeCategoryPopup} />
                                            <div className="absolute top-full right-0 z-40 mt-2 max-h-[min(70vh,28rem)] w-[min(92vw,20rem)] overflow-y-auto rounded-2xl border border-gray-100 bg-white py-2 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
                                                <div className="px-4 py-2 border-b border-gray-50 mb-1">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Seleccionar</span>
                                                </div>
                                                {!isRestricted && (
                                                    <div className="border-b border-gray-50 mb-1 pb-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowFoodCostSubfilter((v) => !v)}
                                                            className="flex w-full min-h-12 items-center justify-between gap-2 px-4 py-2.5 text-left text-xs font-bold tracking-wider text-[#36606F] uppercase transition-colors hover:bg-zinc-50"
                                                            aria-expanded={showFoodCostSubfilter}
                                                        >
                                                            <span>Filtrar Food Cost</span>
                                                            <ChevronDown
                                                                size={14}
                                                                className={cn(
                                                                    'shrink-0 text-zinc-400 transition-transform',
                                                                    showFoodCostSubfilter && 'rotate-180',
                                                                )}
                                                            />
                                                        </button>
                                                        {showFoodCostSubfilter && (
                                                            <div className="divide-y divide-zinc-100 bg-zinc-50/80">
                                                                {FOOD_COST_FILTER_OPTIONS.map((opt) => (
                                                                    <button
                                                                        type="button"
                                                                        key={opt.status}
                                                                        onClick={() => applyFoodCostFilter(opt.status)}
                                                                        className={cn(
                                                                            'flex w-full min-h-12 items-center gap-2 px-6 py-2.5 text-left text-xs font-bold uppercase tracking-wider transition-colors hover:bg-zinc-100',
                                                                            opt.colorClass,
                                                                            foodCostFilter === opt.status && 'bg-zinc-100',
                                                                        )}
                                                                    >
                                                                        <span aria-hidden>●</span>
                                                                        {opt.label}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setCategoryAndUrl(null);
                                                        closeCategoryPopup();
                                                    }}
                                                    className="w-full min-h-12 px-4 py-2.5 text-left text-xs font-bold tracking-wider text-gray-700 uppercase transition-colors hover:bg-zinc-50"
                                                >
                                                    Todas
                                                </button>
                                                {showUncategorizedMenuFilter && (
                                                    <button
                                                        type="button"
                                                        key="__none__"
                                                        onClick={() => {
                                                            setCategoryAndUrl('__none__');
                                                            closeCategoryPopup();
                                                        }}
                                                        className="w-full min-h-12 px-4 py-2.5 text-left text-xs font-bold tracking-wider text-amber-800 uppercase transition-colors hover:bg-zinc-50"
                                                    >
                                                        Sin categoría menú
                                                    </button>
                                                )}
                                                {menuCategoryOptions.map((opt) => (
                                                    <button
                                                        type="button"
                                                        key={opt.id}
                                                        onClick={() => {
                                                            const row = menuCategoryRows.find((r) => r.id === opt.id);
                                                            const param = row ? menuCategoryToUrlParam(row) : opt.id;
                                                            setCategoryAndUrl(param);
                                                            closeCategoryPopup();
                                                        }}
                                                        className="w-full min-h-12 px-4 py-2.5 text-left text-xs font-bold text-gray-700 transition-colors hover:bg-zinc-50"
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="flex max-w-[100px] items-center gap-1 rounded-xl border border-white bg-white py-1 pl-2.5 pr-1 shadow-md md:max-w-md md:rounded-2xl md:py-1.5 md:pl-4 md:pr-1.5">
                                    <span className="truncate text-[9px] font-black uppercase tracking-widest text-zinc-800 md:text-[10px]" title={selectedCategoryFilterLabel}>
                                        {selectedCategoryFilterLabel}
                                    </span>
                                    <button type="button" onClick={() => setCategoryAndUrl(null)} className="shrink-0 rounded-xl p-1 transition-colors hover:bg-zinc-100 md:p-1.5"><X size={12} className="text-rose-500 md:w-3.5 md:h-3.5" strokeWidth={4} /></button>
                                </div>
                            )}
                        {!isRestricted && (
                            <button
                                type="button"
                                onClick={() => {
                                    const tap = menuCategoryRows.find((r) => r.slug === 'tapas');
                                    setNewRecipe({
                                        name: '',
                                        menu_category_id: tap?.id ?? '',
                                        category: tap ? denormalizedRecipeCategoryName(tap) : '',
                                        sale_price: 0,
                                        ingredients: [],
                                    });
                                    setShowCreateModal(true);
                                }}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg transition-all hover:scale-105 hover:bg-emerald-700 active:scale-95 md:h-12 md:w-12 md:rounded-2xl"
                            >
                                <Plus className="h-5 w-5 md:h-6 md:w-6" />
                            </button>
                        )}
                    </div>
                </div>
                {!loading && (
                    <div className="pt-4 md:pt-6">
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-6">
                            {filteredRecipes.map((recipe) => (
                                <div key={recipe.id} className="group relative overflow-hidden">
                                    <div
                                        onClick={() => {
                                            if (isStaffView) {
                                                setSelectedRecipeId(recipe.id);
                                            } else {
                                                router.push(buildRecipesHref(recipe.id));
                                            }
                                        }}
                                        className="bg-white rounded-2xl p-1.5 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer h-full flex flex-col active:scale-95"
                                    >
                                <div className="h-14 w-full bg-white rounded-lg flex items-center justify-center mb-1 overflow-hidden relative">
                                    {recipe.photo_url ? <img src={recipe.photo_url} alt="" className="h-full w-full object-contain" /> : <ChefHat className="w-5 h-5 text-gray-200" />}
                                </div>
                                <div className="flex justify-between items-center mt-auto px-0.5 gap-1">
                                    <span className="font-bold text-gray-700 text-[10px] leading-tight truncate" title={recipe.name}>{recipe.name}</span>
                                    {!isRestricted && <span className={`font-black text-[10px] shrink-0 ${getRecipeHealthColor(recipe)}`}>{recipe.sale_price?.toFixed(1)}€</span>}
                                </div>
                            </div>
                        </div>
                    ))}
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL DE DETALLE (PARA STAFF): misma composición visual que `/recipes/[id]` en modo restringido */}
            {selectedRecipeId && (
                <div
                    className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={() => setSelectedRecipeId(null)}
                >
                    <div
                        className="bg-white w-full max-w-6xl max-h-[90vh] rounded-[20px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="bg-[#36606F] px-3 md:px-5 py-2 flex flex-col shrink-0">
                            {/* Misma rejilla que `/recipes/[id]`: columnas fijas a los lados → título e imagen centrados en el mismo eje */}
                            <div className="grid w-full grid-cols-[3rem_1fr_3rem] items-center gap-2 min-h-[48px]">
                                <div className="flex items-center justify-center">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedRecipeId(null)}
                                        aria-label="Volver a la lista de recetas"
                                        className={cn(
                                            'flex h-12 w-12 shrink-0 items-center justify-center',
                                            'text-white/70 hover:text-white active:scale-95 transition',
                                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#36606F]',
                                        )}
                                    >
                                        <ArrowLeft className="w-6 h-6" />
                                    </button>
                                </div>
                                <div className="min-w-0 flex justify-center px-1">
                                    <div className="max-w-[min(72vw,20rem)] text-center text-[13px] font-black leading-tight text-white md:text-[15px]">
                                        <span className="inline-block max-w-full truncate">
                                            {fullRecipeData?.name || (loadingDetails ? 'Cargando…' : '…')}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-center">
                                    {canEditRecipeFromModal && selectedRecipeId ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const id = selectedRecipeId;
                                                setSelectedRecipeId(null);
                                                router.push(buildRecipesFullEditHref(id));
                                            }}
                                            className={cn(
                                                'flex h-10 w-10 shrink-0 items-center justify-center transition text-white/60 hover:text-white active:scale-95',
                                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#36606F]',
                                            )}
                                            aria-label="Abrir ficha de edición completa"
                                            title="Editar ingredientes, elaboración y presentación"
                                        >
                                            <Edit2 className="w-5 h-5" strokeWidth={2.5} />
                                        </button>
                                    ) : (
                                        <span className="inline-flex h-10 w-10 shrink-0" aria-hidden />
                                    )}
                                </div>
                            </div>

                            <div className="mt-1 grid w-full grid-cols-[3rem_1fr_3rem] items-center gap-2">
                                <div className="flex items-center justify-center">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (staffNavIndex > 0) setSelectedRecipeId(staffNavRecipes[staffNavIndex - 1].id);
                                        }}
                                        disabled={staffNavIndex <= 0}
                                        className="flex h-10 w-10 shrink-0 items-center justify-center transition disabled:opacity-0 text-white/50 hover:text-white"
                                        aria-label="Receta anterior"
                                    >
                                        <ChevronLeft className="w-8 h-8" />
                                    </button>
                                </div>
                                <div className="flex justify-center">
                                    <div className="rounded-xl bg-white p-0.5 shadow-sm">
                                        <div className="relative group h-14 w-24 rounded-lg border border-gray-100/50 bg-white flex items-center justify-center overflow-hidden">
                                            {fullRecipeData?.photo_url ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setIsPhotoLightboxOpen(true)}
                                                    className={cn(
                                                        'absolute inset-0 h-full w-full cursor-zoom-in',
                                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#36606F]',
                                                    )}
                                                    aria-label="Ver foto ampliada"
                                                >
                                                    <img src={fullRecipeData.photo_url} alt="" className="h-full w-full object-contain" />
                                                </button>
                                            ) : (
                                                <Camera className="h-5 w-5 text-gray-300" aria-hidden />
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-center">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (staffNavIndex >= 0 && staffNavIndex < staffNavRecipes.length - 1) {
                                                setSelectedRecipeId(staffNavRecipes[staffNavIndex + 1].id);
                                            }
                                        }}
                                        disabled={staffNavIndex < 0 || staffNavIndex >= staffNavRecipes.length - 1}
                                        className="flex h-10 w-10 shrink-0 items-center justify-center transition disabled:opacity-0 text-white/50 hover:text-white"
                                        aria-label="Receta siguiente"
                                    >
                                        <ChevronRight className="w-8 h-8" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-center gap-4 mt-2 text-white/90">
                                <span className="px-2 py-0.5 bg-white/20 rounded-full font-medium uppercase tracking-wider text-[9px]">
                                    {fullRecipeData ? recipeMenuLabel(fullRecipeData as Recipe) : ' '}
                                </span>
                                <div className="flex items-center gap-1.5 text-[9px] font-bold">
                                    <Users className="w-3.5 h-3.5" />
                                    <span>{fullRecipeData?.servings || 1} rac</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-[#fafafa]">
                            {loadingDetails ? (
                                <div className="h-64 flex flex-col items-center justify-center text-[#36606F]/60">
                                    <LoadingSpinner size="lg" className="text-[#36606F] mb-4" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">Cargando receta...</p>
                                </div>
                            ) : (
                                <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 gap-4 content-start">
                                    <div className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col h-fit">
                                        <div className="bg-[#36606F] px-4 py-2 shrink-0 flex items-center justify-between">
                                            <h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">
                                                Ingredientes{' '}
                                                <span className="opacity-50">({modalSortedIngredients.length})</span>
                                            </h2>
                                        </div>
                                        <div className="custom-scrollbar relative">
                                            <table className="w-full text-[10px] border-collapse">
                                                <thead className="sticky top-0 z-10 bg-white shadow-sm">
                                                    <tr className="text-gray-400 font-black uppercase tracking-widest text-[8px] border-b border-gray-100">
                                                        <th className="text-left py-2 px-3">Ingrediente</th>
                                                        <th className="text-center">Cant</th>
                                                        <th className="text-center">Ud</th>
                                                        <th className="w-8" />
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {modalSortedIngredients.map((ing: any) => (
                                                        <tr key={ing.id} className="hover:bg-gray-50 transition-colors">
                                                            <td className="py-2 px-3 text-gray-800 font-bold truncate max-w-[120px]">
                                                                {ing.ingredients?.name}
                                                            </td>
                                                            <td className="text-center py-2">
                                                                <span className="text-gray-700 font-bold">{ing.quantity_gross}</span>
                                                            </td>
                                                            <td className="text-center py-2">
                                                                <span className="text-gray-400 font-bold">{ing.unit}</span>
                                                            </td>
                                                            <td className="py-2" />
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col h-fit">
                                        <div className="bg-[#36606F] px-4 py-2 shrink-0 relative flex items-center justify-between">
                                            <h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Elaboración</h2>
                                        </div>
                                        <div className="p-3">
                                            <div className="custom-scrollbar space-y-3">
                                                <ul className="space-y-2">
                                                    {modalElaborationSteps.map((s, i) => (
                                                        <li key={i} className="flex gap-3 text-gray-600 text-[10px] leading-relaxed">
                                                            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black text-[8px]">
                                                                {i + 1}
                                                            </span>
                                                            <span>{s}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                                {fullRecipeData?.elaboration_video_url && (
                                                    <video
                                                        controls
                                                        preload="metadata"
                                                        src={fullRecipeData.elaboration_video_url}
                                                        className="w-full rounded-2xl bg-black"
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col h-fit">
                                        <div className="bg-[#36606F] px-4 py-2 shrink-0 relative flex items-center justify-between">
                                            <h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Presentación</h2>
                                        </div>
                                        <div className="p-3 bg-zinc-50/30">
                                            <div className="custom-scrollbar">
                                                <ul className="space-y-2">
                                                    {modalPresentationSteps.map((s, i) => (
                                                        <li key={i} className="flex gap-3 text-gray-600 text-[10px] leading-relaxed">
                                                            <X
                                                                className="rotate-45 w-2 h-2 text-emerald-500 mt-1 flex-shrink-0"
                                                                strokeWidth={5}
                                                                aria-hidden
                                                            />
                                                            <span>{s}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            <CreateModal
                showCreateModal={showCreateModal}
                setShowCreateModal={setShowCreateModal}
                newRecipe={newRecipe}
                setNewRecipe={setNewRecipe}
                isCreating={isCreating}
                menuCategoryOptions={menuCategoryOptions}
                allIngredients={allIngredients}
                handleCreateRecipe={handleCreateRecipe}
                addIngredientToRecipe={() =>
                    setNewRecipe({
                        ...newRecipe,
                        ingredients: [...newRecipe.ingredients, { ingredient_id: '', quantity: 0, unit: 'kg' }],
                    })
                }
                removeIngredientFromRecipe={(idx: number) => {
                    const updated = [...newRecipe.ingredients]
                    updated.splice(idx, 1)
                    setNewRecipe({ ...newRecipe, ingredients: updated })
                }}
                updateRecipeIngredient={(idx: number, field: string, val: any) => {
                    const updated = [...newRecipe.ingredients]
                    updated[idx] = { ...updated[idx], [field]: val }
                    setNewRecipe({ ...newRecipe, ingredients: updated })
                }}
            />
        </div>
    );
}

export default function RecipesPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen"></div>
        }>
            <RecipesContent />
        </Suspense>
    );
}