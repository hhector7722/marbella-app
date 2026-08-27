'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import { ChefHat, Plus, ChevronDown } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import CreateModal from '@/components/CreateRecipeModal';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { CatalogGrid, CatalogTile } from '@/components/catalog/CatalogTile';
import { CatalogFilterChip } from '@/components/catalog/CatalogFilterChip';
import { SearchField } from '@/components/ui/SearchField';
import { cn } from '@/lib/utils';
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

    const isRestricted = isStaffView || (userRole !== 'manager' && userRole !== 'supervisor' && userRole !== null);

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
        <>
            <Toaster position="top-right" />
            <DashboardDetailLayout
                title="Recetas"
                showBackButton={false}
                template="list"
                maxWidthClass="max-w-7xl"
                rightSlot={
                    !isRestricted ? (
                        <Button
                            type="button"
                            variant="tertiary"
                            instance="recipes-crear"
                            aria-label="Nueva receta"
                            icon={<Plus className="h-5 w-5 md:h-6 md:w-6" />}
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
                        />
                    ) : null
                }
            >
                <div className="flex flex-row items-center gap-2">
                    <div className="min-w-0 flex-1">
                        <SearchField
                            instance="recipes-search"
                            placeholder="Buscar..."
                            value={searchQuery}
                            onChange={setSearchQuery}
                        />
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
                            {foodCostFilter ? (
                                <CatalogFilterChip
                                    label="FC"
                                    value={`FC ${selectedFoodCostFilterLabel}`}
                                    onClear={() => setFoodCostAndUrl(null)}
                                    clearAriaLabel="Quitar filtro food cost"
                                    title={`Food Cost: ${selectedFoodCostFilterLabel}`}
                                    valueClassName={
                                        FOOD_COST_FILTER_OPTIONS.find((o) => o.status === foodCostFilter)?.colorClass
                                    }
                                />
                            ) : null}
                            {!categoryFromUrl ? (
                                <CatalogFilterChip
                                    label="CAT"
                                    onOpen={() => setShowCategoryPopup(true)}
                                />
                            ) : (
                                <CatalogFilterChip
                                    label="CAT"
                                    value={selectedCategoryFilterLabel}
                                    onClear={() => setCategoryAndUrl(null)}
                                    title={selectedCategoryFilterLabel}
                                />
                            )}
                    </div>
                </div>
                {!loading && (
                    <div className="pt-4 md:pt-6">
                        <CatalogGrid columns={3}>
                            {filteredRecipes.map((recipe) => (
                                <CatalogTile
                                    key={recipe.id}
                                    title={recipe.name}
                                    imageSrc={recipe.photo_url}
                                    fallback={<ChefHat className="h-8 w-8 md:h-10 md:w-10" />}
                                    subtitle={
                                        !isRestricted ? (
                                            <span className={getRecipeHealthColor(recipe)}>
                                                {recipe.sale_price?.toFixed(1)}€
                                            </span>
                                        ) : undefined
                                    }
                                    onClick={() => router.push(buildRecipesHref(recipe.id))}
                                />
                            ))}
                        </CatalogGrid>
                    </div>
                )}
    </DashboardDetailLayout>

            <Modal
                open={showCategoryPopup}
                onClose={closeCategoryPopup}
                title="Categoría"
                variant="compact"
                layer="base"
                instance="recipes-category-filter"
                usageId="recipes-category-filter"
                usageLabel="Filtro categoría recetas"
            >
                <div className="max-h-[min(70vh,28rem)] overflow-y-auto">
                    {!isRestricted ? (
                        <div className="border-b border-zinc-100 pb-1 mb-1">
                            <button
                                type="button"
                                onClick={() => setShowFoodCostSubfilter((v) => !v)}
                                className="flex w-full min-h-12 items-center justify-between gap-2 py-2.5 text-left text-xs font-bold tracking-wider text-ds-marca uppercase transition-colors hover:bg-zinc-50"
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
                            {showFoodCostSubfilter ? (
                                <div className="divide-y divide-zinc-100 bg-zinc-50/80">
                                    {FOOD_COST_FILTER_OPTIONS.map((opt) => (
                                        <button
                                            type="button"
                                            key={opt.status}
                                            onClick={() => applyFoodCostFilter(opt.status)}
                                            className={cn(
                                                'flex w-full min-h-12 items-center gap-2 py-2.5 pl-3 text-left text-xs font-bold uppercase tracking-wider transition-colors hover:bg-zinc-100',
                                                opt.colorClass,
                                                foodCostFilter === opt.status && 'bg-zinc-100',
                                            )}
                                        >
                                            <span aria-hidden>●</span>
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => {
                            setCategoryAndUrl(null);
                            closeCategoryPopup();
                        }}
                        className="w-full min-h-12 py-2.5 text-left text-xs font-bold tracking-wider text-zinc-700 uppercase transition-colors hover:bg-zinc-50"
                    >
                        Todas
                    </button>
                    {showUncategorizedMenuFilter ? (
                        <button
                            type="button"
                            onClick={() => {
                                setCategoryAndUrl('__none__');
                                closeCategoryPopup();
                            }}
                            className="w-full min-h-12 py-2.5 text-left text-xs font-bold tracking-wider text-amber-800 uppercase transition-colors hover:bg-zinc-50"
                        >
                            Sin categoría menú
                        </button>
                    ) : null}
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
                            className="w-full min-h-12 py-2.5 text-left text-xs font-bold text-zinc-700 transition-colors hover:bg-zinc-50"
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </Modal>

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
        </>
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