'use client';

import { useState, useEffect, Suspense, useRef, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import { Trash2, Edit2, Plus, X, Save, Camera, ChevronLeft, ChevronRight, Pencil, Check, PlayCircle, AlertCircle } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { toast, Toaster } from 'sonner';
import { cn } from '@/lib/utils';
import {
    recipeLineCost,
    RECIPE_UNIT_OPTIONS,
    resolveIngredientRecipeUnit,
    formatRecipeIngredientLineCostEur,
    getRecipeIngredientLineCostAnalysis,
    recipeLineCostStatusHint,
    type IngredientPackBridgeContext,
} from '@/lib/recipe-cost';
import { SubRecipesPanel } from '@/components/recipes/SubRecipesPanel';
import { RecipeNamePhotoEditModal } from '@/components/recipes/RecipeNamePhotoEditModal';
import { IngredientCreateForm } from '@/components/ingredients/IngredientCreateForm';
import { IngredientCanonicalEditModal, type Ingredient } from '@/components/ingredients/IngredientCanonicalEditModal';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/SearchField';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { CatalogSquare } from '@/components/catalog/CatalogTile';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { TABLE_COMPONENT_ID } from '@/lib/design-system';
import { PetroleumSegmented } from '@/components/ui/PetroleumSegmented';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { namedEntitySummary } from '@/lib/usage/modal-apply';
import {
    type MenuCategoryRow,
    denormalizedRecipeCategoryName,
    isMenusPackCategory,
    labelMenuCategoryForRecipesEs,
    menuCategoryFromUrlParam,
    sortMenuCategoriesForRecipes,
} from '@/lib/recipe-menu-categories';
import {
    getRecipeFoodCostStatus,
    parseFoodCostFilterParam,
    RECIPE_FOOD_COST_SELECT,
} from '@/lib/recipe-food-cost';
import {
    elaborationUnitCost,
    formatElaborationCostEur,
    formatYieldQuantity,
    isInternalRecipe,
    recipeCostV2StatusLabel,
} from '@/lib/recipe-elaboration';
import {
    canAddRecipeComponent,
    compatibleComponentUnits,
    directIngredientLineCost,
    directSubrecipeLineCost,
    ingredientRowCostSource,
    isValidComponentQuantity,
    sheetCostSource,
    subrecipeWriteErrorMessage,
    type RecipeCostComponentNode,
} from '@/lib/recipe-components';

interface ViewState {
    location: 'pvp' | 'pavello';
    size: 'full' | 'half';
}

interface IngredientRow extends Ingredient {
    pack_unit_size_qty?: number | null;
    pack_unit_size_unit?: string | null;
}

interface RecipeIngredientRow {
    id: string;
    recipe_id: string;
    ingredient_id: string;
    quantity_gross: number;
    quantity_half?: number | null;
    unit: string | null;
    ingredients: IngredientRow | null;
}

interface RecipeRow {
    id: string;
    name: string;
    category: string | null;
    menu_category_id: string | null;
    sale_price: number | null;
    sales_price_pavello: number | null;
    sale_price_half: number | null;
    sale_price_half_pavello: number | null;
    is_sellable: boolean;
    yield_quantity: number | null;
    yield_unit: string | null;
    target_food_cost_pct: number | null;
    elaboration: string | null;
    presentation: string | null;
    photo_url: string | null;
    elaboration_video_url: string | null;
    servings: number | null;
    recipe_ingredients?: RecipeIngredientRow[] | null;
}

type RecipeCostV2View = {
    ok?: boolean;
    total_cost_eur?: number | null;
    errors?: { status?: string }[] | null;
    components?: RecipeCostComponentNode[] | null;
};

type RecipeComponentChild = {
    id: string;
    name: string;
    photo_url: string | null;
    is_sellable: boolean;
    yield_quantity: number | null;
    yield_unit: string | null;
};

type RecipeSubrecipeLine = {
    id: string;
    parent_recipe_id: string;
    child_recipe_id: string;
    quantity: number;
    unit: string;
    child: RecipeComponentChild;
};

interface RecipeListItem {
    id: string;
    name: string;
    category: string | null;
    menu_category_id: string | null;
}

type EditablePriceProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'className'> & {
    value: number;
    onChange: (val: number) => void;
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
    className?: string;
};

function buildElaborationVideoFileName(cleanBase: string, ext: string): string {
    return `${Date.now()}-${cleanBase || 'elaboracion'}.${ext}`;
}

function RecipeDetailContent() {
    const params = useParams();
    const router = useRouter();
    const recipeId = params.id as string;
    const supabaseRef = useRef(createClient());
    const supabase = supabaseRef.current;
    const elaborationVideoInputRef = useRef<HTMLInputElement | null>(null);

    // --- 1. ESTADOS ---
    const [recipe, setRecipe] = useState<RecipeRow | null>(null);
    const [loading, setLoading] = useState(true);

    const [view, setView] = useState<ViewState>({ location: 'pvp', size: 'full' });

    const [ingredients, setIngredients] = useState<RecipeIngredientRow[]>([]);
    const [availableIngredients, setAvailableIngredients] = useState<IngredientRow[]>([]);
    const [allRecipes, setAllRecipes] = useState<RecipeListItem[]>([]);
    const [currentRecipeIndex, setCurrentRecipeIndex] = useState<number>(-1);

    const [backendCost, setBackendCost] = useState<{ total_cost: number; lines: { line_id: string; ingredient_name: string; line_cost: number }[] } | null>(null);
    const [elaborationCost, setElaborationCost] = useState<RecipeCostV2View | null>(null);
    const [subrecipes, setSubrecipes] = useState<RecipeSubrecipeLine[]>([]);
    const [subrecipesLoaded, setSubrecipesLoaded] = useState(false);
    const [componentKind, setComponentKind] = useState<'ingredient' | 'elaboration'>('ingredient');
    const [recipeCandidates, setRecipeCandidates] = useState<RecipeComponentChild[]>([]);
    const [deleteSubrecipeId, setDeleteSubrecipeId] = useState<string | null>(null);
    const [deletingSubrecipe, setDeletingSubrecipe] = useState(false);
    const [subrecipeEpoch, setSubrecipeEpoch] = useState(0);
    const subrecipesRef = useRef<RecipeSubrecipeLine[]>([]);
    const recipeRef = useRef<RecipeRow | null>(null);
    const viewSizeRef = useRef<'full' | 'half'>('full');
    const subrecipesOwnerRef = useRef<string | null>(null);
    const [simulatedPrice, setSimulatedPrice] = useState(0);
    const [savingPrice, setSavingPrice] = useState(false);
    const [applyingSimulation, setApplyingSimulation] = useState(false);
    const [targetFC, setTargetFC] = useState(30);

    const [isEditingElaboration, setIsEditingElaboration] = useState(false);
    const [elaborationSteps, setElaborationSteps] = useState<string[]>([]);

    const [isEditingPresentation, setIsEditingPresentation] = useState(false);
    const [presentationSteps, setPresentationSteps] = useState<string[]>([]);
    const [savingElaboration, setSavingElaboration] = useState(false);
    const [savingPresentation, setSavingPresentation] = useState(false);

    const [showIngredientModal, setShowIngredientModal] = useState(false);
    const [addIngredientUnit, setAddIngredientUnit] = useState<string>('kg');
    const [forceAddIngredientUnit, setForceAddIngredientUnit] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [userRole, setUserRole] = useState<string | null>(null);
    const [isEditingPrice, setIsEditingPrice] = useState(false);
    const [priceDraft, setPriceDraft] = useState('');
    const [uploadingElaborationVideo, setUploadingElaborationVideo] = useState(false);
    const [isPhotoLightboxOpen, setIsPhotoLightboxOpen] = useState(false);
    const [simulatorExpanded, setSimulatorExpanded] = useState(false);
    const [recipeMetaModalOpen, setRecipeMetaModalOpen] = useState(false);
    const [recipeIngredientEditTarget, setRecipeIngredientEditTarget] = useState<Ingredient | null>(null);
    const [deleteRecipeOpen, setDeleteRecipeOpen] = useState(false);
    const [deletingRecipe, setDeletingRecipe] = useState(false);
    const [deleteIngredientId, setDeleteIngredientId] = useState<string | null>(null);
    const [deletingIngredient, setDeletingIngredient] = useState(false);
    const [menuCategoryRows, setMenuCategoryRows] = useState<MenuCategoryRow[]>([]);
    const [mcoEsByCategoryId, setMcoEsByCategoryId] = useState<Map<string, string | null>>(() => new Map());

    const trackRecipeCategory = useTrackModalApply('recipe-category', 'Categoría receta');
    const trackRecipeAddIngredient = useTrackModalApply('recipe-add-ingredient', 'Añadir ingrediente receta');
    const trackRecipeIngredientCreate = useTrackModalApply('recipe-ingredient-create', 'Crear ingrediente receta');

    const searchParams = useSearchParams();
    const isStaffView = searchParams.get('view') === 'staff';
    const catFilter = searchParams.get('cat');
    const foodCostFilter = parseFoodCostFilterParam(searchParams.get('fc'));

    /** Lista: misma `cat` / `fc` / `view` que en la ficha; sin params si el detalle no traía filtro (entrada directa u otra ruta). */
    const recipesListHref = useMemo(() => {
        const qs = new URLSearchParams();
        const cat = searchParams.get('cat');
        const fc = searchParams.get('fc');
        if (cat) qs.set('cat', cat);
        if (fc) qs.set('fc', fc);
        if (searchParams.get('view') === 'staff') qs.set('view', 'staff');
        const s = qs.toString();
        return s ? `/recipes?${s}` : '/recipes';
    }, [searchParams]);

    const fullEditHref = useMemo(() => {
        const qs = new URLSearchParams(searchParams.toString());
        qs.delete('view');
        const s = qs.toString();
        return s ? `/recipes/${recipeId}?${s}` : `/recipes/${recipeId}`;
    }, [searchParams, recipeId]);

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
    }, []);

    const sortedMenuCategoryRows = useMemo(() => sortMenuCategoriesForRecipes(menuCategoryRows), [menuCategoryRows]);

    const menusPackCategoryId = useMemo(
        () => menuCategoryRows.find((r) => r.slug === 'menus-packs')?.id ?? null,
        [menuCategoryRows],
    );

    const isMenuRecipe = useMemo(
        () => isMenusPackCategory(recipe ?? {}, menusPackCategoryId),
        [recipe, menusPackCategoryId],
    );

    const currentQueryString = searchParams.toString();
    const buildDetailHref = (id: string) => (currentQueryString ? `/recipes/${id}?${currentQueryString}` : `/recipes/${id}`);

    // --- 2. FUNCIONES DE CARGA ---
    const fetchAvailableIngredients = async () => {
        const { data } = await supabase.from('ingredients').select('*').is('archived_at', null).order('name');
        if (data) setAvailableIngredients(data);
    };

    recipeRef.current = recipe;
    viewSizeRef.current = view.size;

    const rememberSubrecipes = (lines: RecipeSubrecipeLine[]) => {
        subrecipesRef.current = lines;
        setSubrecipes(lines);
    };

    const fetchLegacyCost = async (portion: 'full' | 'half') => {
        const { data, error } = await supabase.rpc('get_recipe_cost', {
            p_recipe_id: recipeId,
            p_use_half_ration: portion === 'half',
        });
        if (!error && data) setBackendCost(data as { total_cost: number; lines: { line_id: string; ingredient_name: string; line_cost: number }[] });
        else setBackendCost(null);
    };

    const fetchRecursiveCost = async () => {
        const { data, error } = await supabase.rpc('get_recipe_cost_v2', { p_recipe_id: recipeId });
        if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
            setElaborationCost({ ok: false, total_cost_eur: null, errors: [{ status: 'RECIPE_NOT_FOUND' }], components: [] });
            return;
        }
        setElaborationCost(data as RecipeCostV2View);
    };

    const refreshSheetCost = async () => {
        const current = recipeRef.current;
        const source = sheetCostSource({
            isSellable: current ? current.is_sellable !== false : true,
            hasSubrecipes: subrecipesRef.current.length > 0,
            portion: viewSizeRef.current,
        });
        if (source === 'legacy') {
            await fetchLegacyCost(viewSizeRef.current);
            return;
        }
        if (source === 'recursive') {
            await fetchRecursiveCost();
        }
    };

    const fetchRecipeSubrecipes = async (): Promise<RecipeSubrecipeLine[]> => {
        const { data, error } = await supabase
            .from('recipe_subrecipes')
            .select('id, parent_recipe_id, child_recipe_id, quantity, unit, child:recipes!recipe_subrecipes_child_recipe_id_fkey (id, name, photo_url, is_sellable, yield_quantity, yield_unit)')
            .eq('parent_recipe_id', recipeId);
        if (error) {
            toast.error('No se pudieron cargar las elaboraciones');
            return subrecipesRef.current;
        }
        const lines = (data ?? []).flatMap((row) => {
            const embedded = row.child;
            const child = Array.isArray(embedded) ? embedded[0] : embedded;
            if (!child) return [];
            return [{
                id: row.id,
                parent_recipe_id: row.parent_recipe_id,
                child_recipe_id: row.child_recipe_id,
                quantity: Number(row.quantity),
                unit: row.unit,
                child,
            }];
        }).sort((a, b) => a.child.name.localeCompare(b.child.name, 'es'));
        rememberSubrecipes(lines);
        subrecipesOwnerRef.current = recipeId;
        setSubrecipesLoaded(true);
        return lines;
    };

    const fetchRecipe = async () => {
        try {
            const { data, error } = await supabase
                .from('recipes')
                .select(`*, recipe_ingredients (*, ingredients (*))`)
                .eq('id', recipeId)
                .single();

            if (error) throw error;
            recipeRef.current = data;
            setRecipe(data);
            if (subrecipesOwnerRef.current !== recipeId) {
                subrecipesRef.current = [];
                setSubrecipes([]);
                setSubrecipesLoaded(false);
            }
            await fetchRecipeSubrecipes();

            const sortedIngs = (data.recipe_ingredients || []).sort((a: RecipeIngredientRow, b: RecipeIngredientRow) =>
                (a.ingredients?.name || '').localeCompare(b.ingredients?.name || '')
            );
            setIngredients(sortedIngs);

            setElaborationSteps(data.elaboration ? (data.elaboration.includes('\n') ? data.elaboration.split('\n') : [data.elaboration]) : []);
            setPresentationSteps(data.presentation ? (data.presentation.includes('\n') ? data.presentation.split('\n') : [data.presentation]) : []);

            if (data.target_food_cost_pct) setTargetFC(data.target_food_cost_pct);
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar receta');
        } finally {
            setLoading(false);
        }
    };

    const fetchAllRecipes = async () => {
        // Ramas separadas: un ternario en .select() rompe el parser de tipos de Supabase.
        if (foodCostFilter) {
            let q = supabase.from('recipes').select(RECIPE_FOOD_COST_SELECT).order('name');
            if (catFilter && catFilter !== '__none__') {
                const row = menuCategoryRows.length ? menuCategoryFromUrlParam(catFilter, menuCategoryRows) : null;
                if (row) q = q.eq('menu_category_id', row.id);
                else q = q.eq('category', catFilter);
            } else if (catFilter === '__none__') {
                q = q.is('menu_category_id', null);
            }
            const { data } = await q;
            if (data) {
                const list = data.filter(
                    (r) => !isInternalRecipe(r.is_sellable) && getRecipeFoodCostStatus(r) === foodCostFilter,
                );
                setAllRecipes(list);
                setCurrentRecipeIndex(list.findIndex((r) => r.id === recipeId));
            }
            return;
        }

        let q = supabase.from('recipes').select('id, name, category, menu_category_id').order('name');
        if (catFilter && catFilter !== '__none__') {
            const row = menuCategoryRows.length ? menuCategoryFromUrlParam(catFilter, menuCategoryRows) : null;
            if (row) q = q.eq('menu_category_id', row.id);
            else q = q.eq('category', catFilter);
        } else if (catFilter === '__none__') {
            q = q.eq('is_sellable', true).is('menu_category_id', null);
        }
        const { data } = await q;
        if (data) {
            setAllRecipes(data);
            setCurrentRecipeIndex(data.findIndex((r) => r.id === recipeId));
        }
    };

    const getCurrentPrice = () => {
        if (!recipe) return 0;
        if (view.size === 'full') {
            return view.location === 'pvp' ? recipe.sale_price : recipe.sales_price_pavello;
        } else {
            return view.location === 'pvp' ? recipe.sale_price_half : recipe.sale_price_half_pavello;
        }
    };

    // --- 3. EFFECTS ---
    useEffect(() => {
        fetchRecipe();
        fetchAvailableIngredients();
        fetchAllRecipes();
        const checkRole = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
                if (data) setUserRole(data.role);
            }
        };
        checkRole();
    }, [recipeId, catFilter, foodCostFilter, menuCategoryRows]);

    const [simulatorRecipeId, setSimulatorRecipeId] = useState(recipeId);
    if (recipeId !== simulatorRecipeId) {
        setSimulatorRecipeId(recipeId);
        setSimulatorExpanded(false);
    }

    const isRestricted = isStaffView || (userRole !== 'manager' && userRole !== 'supervisor' && userRole !== null);
    const canOpenFullEdit = isStaffView && (userRole === 'manager' || userRole === 'supervisor');
    const canManageRecipeVideo = !isStaffView && userRole === 'manager';

    const [simulationRecipe, setSimulationRecipe] = useState<RecipeRow | null>(null);
    const [simulationView, setSimulationView] = useState<ViewState | null>(null);
    if (recipe !== simulationRecipe || view !== simulationView) {
        setSimulationRecipe(recipe);
        setSimulationView(view);
        if (recipe) setSimulatedPrice(getCurrentPrice() || 0);
    }

    useEffect(() => {
        if (!recipeId || !recipe || !subrecipesLoaded) return;
        void refreshSheetCost();
    }, [recipeId, view.size, recipe?.is_sellable, subrecipes.length, subrecipesLoaded]);

    // --- 4. LÓGICA DE NEGOCIO ---

    const getIngredientQuantity = (ing: RecipeIngredientRow) => {
        return view.size === 'full' ? (ing.quantity_gross || 0) : (ing.quantity_half || 0);
    };

    const ingredientPackBridge = (ing: RecipeIngredientRow): IngredientPackBridgeContext | undefined => {
        const i = ing?.ingredients;
        if (!i) return undefined;
        return {
            pack_unit_size_qty: i.pack_unit_size_qty,
            pack_unit_size_unit: i.pack_unit_size_unit,
        };
    };

    const calculateIngredientCost = (ing: RecipeIngredientRow) => {
        const qty = getIngredientQuantity(ing);
        const price = ing.ingredients?.current_price ?? 0;
        const purchaseUnit = ing.ingredients?.purchase_unit ?? 'kg';
        const recipeUnit = ing.unit ?? 'kg';
        return recipeLineCost(qty, recipeUnit, purchaseUnit, price, ingredientPackBridge(ing));
    };

    const totalCostClient = ingredients.reduce((sum, ing) => sum + calculateIngredientCost(ing), 0);
    const sheetCostMode = subrecipesLoaded && recipe
        ? sheetCostSource({
            isSellable: recipe.is_sellable !== false,
            hasSubrecipes: subrecipes.length > 0,
            portion: view.size,
        })
        : null;
    const sheetCostEur: number | null = (() => {
        if (sheetCostMode === 'legacy') return backendCost != null ? backendCost.total_cost : totalCostClient;
        if (
            sheetCostMode === 'recursive'
            && elaborationCost?.ok === true
            && typeof elaborationCost.total_cost_eur === 'number'
            && Number.isFinite(elaborationCost.total_cost_eur)
        ) {
            return elaborationCost.total_cost_eur;
        }
        return null;
    })();
    const sheetCostKnown = sheetCostEur != null;
    const totalCost = sheetCostEur ?? 0;

    const recipeIngredientCostIssueCount = useMemo(() => {
        if (isRestricted) return 0;
        let n = 0;
        for (const ing of ingredients) {
            const qty = view.size === 'full' ? ing.quantity_gross || 0 : ing.quantity_half || 0;
            if (!Number.isFinite(qty) || qty <= 0) continue;
            const st = getRecipeIngredientLineCostAnalysis(
                qty,
                ing.unit ?? 'kg',
                ing.ingredients?.purchase_unit ?? 'kg',
                ing.ingredients?.current_price,
                ingredientPackBridge(ing)
            ).status;
            if (st !== 'ok') n += 1;
        }
        return n;
    }, [ingredients, isRestricted, view.size]);
    const VAT_RATE = 1.10;
    const currentPrice = getCurrentPrice() || 0;
    const basePrice = currentPrice > 0 ? currentPrice / VAT_RATE : 0;
    const foodCost = basePrice > 0 ? (totalCost / basePrice) * 100 : 0;
    const margin = basePrice - totalCost;

    const activeTargetFC = view.location === 'pavello' ? 35 : targetFC;
    const recommendedPrice = activeTargetFC > 0 ? (totalCost / (activeTargetFC / 100)) * VAT_RATE : 0;

    const simulatedBasePrice = simulatedPrice > 0 ? simulatedPrice / VAT_RATE : 0;
    const simulatedFoodCost = simulatedBasePrice > 0 ? (totalCost / simulatedBasePrice) * 100 : 0;
    const simulatedMargin = simulatedPrice > 0 ? (simulatedPrice / VAT_RATE) - totalCost : 0;

    // --- 5. UPDATES ---
    const updateRecipeField = async (field: string, value: string | number) => {
        const { error } = await supabase.from('recipes').update({ [field]: value }).eq('id', recipeId);
        if (error) {
            toast.error(`No se pudo guardar (${field}): ${error.message}`);
            throw error;
        }
        setRecipe(recipe ? { ...recipe, [field]: value } : recipe);
        toast.success('Guardado');
    };

    async function handleElaborationVideoSelected(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        // permitir re-seleccionar el mismo archivo
        e.target.value = '';
        if (!file) return;
        if (!canManageRecipeVideo) return;

        try {
            setUploadingElaborationVideo(true);

            const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
            const cleanBase = file.name
                .toLowerCase()
                .replace(/\.[^/.]+$/, '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 60);

            const fileName = buildElaborationVideoFileName(cleanBase, ext);
            const path = `${recipeId}/${fileName}`;

            const up = await supabase.storage.from('recipe_videos').upload(path, file, {
                upsert: true,
                contentType: file.type || undefined,
            });
            if (up.error) throw up.error;

            const { data: publicUrl } = supabase.storage.from('recipe_videos').getPublicUrl(path);
            const url = publicUrl?.publicUrl;
            if (!url) throw new Error('No se pudo obtener URL pública del vídeo.');

            await updateRecipeField('elaboration_video_url', url);
            await fetchRecipe();
            toast.success('Vídeo de elaboración guardado');
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'Error subiendo vídeo');
        } finally {
            setUploadingElaborationVideo(false);
        }
    }

    const handlePriceUpdate = async (newPrice: string) => {
        const num = parseFloat(String(newPrice ?? '').replace(',', '.'));
        if (isNaN(num)) return;
        setSavingPrice(true);
        let field = 'sale_price';
        if (view.size === 'full') field = view.location === 'pvp' ? 'sale_price' : 'sales_price_pavello';
        else field = view.location === 'pvp' ? 'sale_price_half' : 'sale_price_half_pavello';

        await updateRecipeField(field, num);
        setSavingPrice(false);
    };

    const startEditPrice = () => {
        const v = Number(currentPrice || 0);
        setPriceDraft(v > 0 ? String(v).replace('.', ',') : '');
        setIsEditingPrice(true);
    };

    const cancelEditPrice = () => {
        setIsEditingPrice(false);
        setPriceDraft('');
    };

    const confirmEditPrice = async () => {
        const raw = String(priceDraft ?? '').trim();
        const parsed = raw === '' ? 0 : parseFloat(raw.replace(',', '.'));
        if (!Number.isFinite(parsed) || parsed < 0) {
            toast.error('Precio inválido');
            return;
        }
        await handlePriceUpdate(String(parsed));
        setIsEditingPrice(false);
    };

    const handleQuantityChange = async (ingredientId: string, newQuantity: number) => {
        const column = view.size === 'full' ? 'quantity_gross' : 'quantity_half';
        await supabase.from('recipe_ingredients').update({ [column]: newQuantity }).eq('id', ingredientId);
        setIngredients(ingredients.map(ing => ing.id === ingredientId ? { ...ing, [column]: newQuantity } : ing));
        void refreshSheetCost();
    };

    const handleCategoryUpdate = async (menuCat: MenuCategoryRow) => {
        const categoryDb = denormalizedRecipeCategoryName(menuCat);
        const { error } = await supabase
            .from('recipes')
            .update({ menu_category_id: menuCat.id, category: categoryDb })
            .eq('id', recipeId);
        if (error) {
            toast.error(`No se pudo guardar categoría: ${error.message}`);
            throw error;
        }
        setRecipe(recipe ? { ...recipe, menu_category_id: menuCat.id, category: categoryDb } : recipe);
        trackRecipeCategory(namedEntitySummary(labelMenuCategoryForRecipesEs(menuCat, sortedMenuCategoryRows, mcoEsByCategoryId)));
        toast.success('Guardado');
        void fetchAllRecipes();
    };

    const applySimulatedPrice = async () => {
        setApplyingSimulation(true);
        let field = 'sale_price';
        if (view.size === 'full') field = view.location === 'pvp' ? 'sale_price' : 'sales_price_pavello';
        else field = view.location === 'pvp' ? 'sale_price_half' : 'sale_price_half_pavello';
        await updateRecipeField(field, simulatedPrice);
        setApplyingSimulation(false);
    };

    // --- 6. UTILS ---
    const handlePreviousRecipe = () => {
        if (currentRecipeIndex > 0) router.push(buildDetailHref(allRecipes[currentRecipeIndex - 1].id));
    };
    const handleNextRecipe = () => {
        if (currentRecipeIndex < allRecipes.length - 1) router.push(buildDetailHref(allRecipes[currentRecipeIndex + 1].id));
    };

    const handleDelete = async () => {
        setDeletingRecipe(true);
        try {
            await supabase.from('recipes').delete().eq('id', recipeId);
            setDeleteRecipeOpen(false);
            router.push(recipesListHref);
        } finally {
            setDeletingRecipe(false);
        }
    };

    const closeAddIngredientModal = () => {
        setShowIngredientModal(false);
        setForceAddIngredientUnit(false);
        setSearchTerm('');
    };

    const openAddIngredientModal = () => {
        setForceAddIngredientUnit(false);
        setAddIngredientUnit('kg');
        setComponentKind('ingredient');
        setSearchTerm('');
        setShowIngredientModal(true);
    };

    const loadRecipeCandidates = async () => {
        const { data, error } = await supabase
            .from('recipes')
            .select('id, name, photo_url, is_sellable, yield_quantity, yield_unit')
            .neq('id', recipeId)
            .order('name');
        if (error) {
            toast.error('No se pudieron buscar recetas');
            return;
        }
        setRecipeCandidates(data ?? []);
    };

    const handleAddSubrecipe = async (child: RecipeComponentChild) => {
        if (!canAddRecipeComponent({ yieldQuantity: child.yield_quantity, yieldUnit: child.yield_unit }) || !child.yield_unit) return;
        const { error } = await supabase.from('recipe_subrecipes').insert({
            parent_recipe_id: recipeId,
            child_recipe_id: child.id,
            quantity: 1,
            unit: child.yield_unit,
        });
        if (error) {
            toast.error(subrecipeWriteErrorMessage(error, 'add'));
            return;
        }
        toast.success('Elaboración añadida');
        await fetchRecipeSubrecipes();
        await refreshSheetCost();
        closeAddIngredientModal();
        setComponentKind('ingredient');
    };

    const handleSubrecipeQuantityChange = async (line: RecipeSubrecipeLine, quantity: number) => {
        if (!isValidComponentQuantity(quantity)) {
            toast.error('La cantidad tiene que ser mayor que cero');
            setSubrecipeEpoch((epoch) => epoch + 1);
            return;
        }
        const previous = subrecipesRef.current;
        rememberSubrecipes(previous.map((row) => (row.id === line.id ? { ...row, quantity } : row)));
        const { error } = await supabase.from('recipe_subrecipes').update({ quantity }).eq('id', line.id);
        if (error) {
            toast.error(subrecipeWriteErrorMessage(error, 'save'));
            rememberSubrecipes(previous);
            setSubrecipeEpoch((epoch) => epoch + 1);
            return;
        }
        await refreshSheetCost();
    };

    const handleSubrecipeUnitChange = async (line: RecipeSubrecipeLine, unit: string) => {
        const allowed = compatibleComponentUnits(line.child.yield_unit);
        if (!allowed.includes(unit)) {
            toast.error('Esa unidad no convierte con el rendimiento');
            setSubrecipeEpoch((epoch) => epoch + 1);
            return;
        }
        const previous = subrecipesRef.current;
        rememberSubrecipes(previous.map((row) => (row.id === line.id ? { ...row, unit } : row)));
        const { error } = await supabase.from('recipe_subrecipes').update({ unit }).eq('id', line.id);
        if (error) {
            toast.error(subrecipeWriteErrorMessage(error, 'save'));
            rememberSubrecipes(previous);
            setSubrecipeEpoch((epoch) => epoch + 1);
            return;
        }
        await refreshSheetCost();
    };

    const handleDeleteSubrecipe = async (id: string) => {
        setDeletingSubrecipe(true);
        try {
            const { error } = await supabase.from('recipe_subrecipes').delete().eq('id', id);
            if (error) {
                toast.error(subrecipeWriteErrorMessage(error, 'save'));
                return;
            }
            toast.success('Elaboración quitada');
            setDeleteSubrecipeId(null);
            await fetchRecipeSubrecipes();
            await refreshSheetCost();
        } finally {
            setDeletingSubrecipe(false);
        }
    };

    const handleAddIngredient = async (ingredientId: string, unit: string, ingredientName?: string) => {
        await supabase.from('recipe_ingredients').insert({
            recipe_id: recipeId,
            ingredient_id: ingredientId,
            quantity_gross: 1,
            quantity_half: 0.5,
            unit: unit || 'kg'
        });
        trackRecipeAddIngredient(namedEntitySummary(ingredientName ?? ingredientId));
        await fetchRecipe();
        void refreshSheetCost();
        closeAddIngredientModal();
    };

    const handleDeleteIngredient = async (id: string) => {
        setDeletingIngredient(true);
        setIngredients(prev => prev.filter(ing => ing.id !== id));
        try {
            const { error, count } = await supabase
                .from('recipe_ingredients')
                .delete({ count: 'exact' })
                .eq('id', id);

            if (error) {
                console.error('Error al eliminar ingrediente:', error);
                toast.error('Error al eliminar ingrediente');
                await fetchRecipe();
                return;
            }

            if (count === 0) {
                console.warn('DELETE no eliminó ninguna fila. id:', id, '| count:', count);
                toast.error('No se pudo eliminar el ingrediente');
                await fetchRecipe();
                return;
            }

            toast.success('Ingrediente eliminado');
            void refreshSheetCost();
            setDeleteIngredientId(null);
        } finally {
            setDeletingIngredient(false);
        }
    };

    const updateTextDB = async (field: 'elaboration' | 'presentation', steps: string[]) => {
        await updateRecipeField(field, steps.join('\n'));
    };

    const handleAddElaborationStep = () => setElaborationSteps([...elaborationSteps, '']);
    const handleUpdateElaborationStep = (index: number, value: string) => {
        const n = [...elaborationSteps]; n[index] = value; setElaborationSteps(n);
    };

    const handleAddPresentationStep = () => setPresentationSteps([...presentationSteps, '']);
    const handleUpdatePresentationStep = (index: number, value: string) => {
        const n = [...presentationSteps]; n[index] = value; setPresentationSteps(n);
    };

    const handleSaveElaboration = async () => {
        if (isRestricted) return;
        setSavingElaboration(true);
        try {
            await updateTextDB('elaboration', elaborationSteps);
        } finally {
            setSavingElaboration(false);
        }
    };

    const handleSavePresentation = async () => {
        if (isRestricted) return;
        setSavingPresentation(true);
        try {
            await updateTextDB('presentation', presentationSteps);
        } finally {
            setSavingPresentation(false);
        }
    };

    const getHealthIndicator = (fc: number) => {
        const safeFC = fc || 0;
        if (safeFC < 30) return { color: 'text-green-600', label: '● Óptimo', bg: 'bg-green-50' };
        if (safeFC < 35) return { color: 'text-amber-500', label: '● Alerta', bg: 'bg-yellow-50' };
        return { color: 'text-red-600', label: '● Crítico', bg: 'bg-red-50' };
    };

    const healthIndicator = sheetCostKnown
        ? getHealthIndicator(foodCost)
        : { color: 'text-gray-400', label: '', bg: '' };
    const simulatedHealthIndicator = getHealthIndicator(simulatedFoodCost);

    const themeColors = view.location === 'pvp'
        ? { toggle: 'bg-blue-600 text-white', toggleInactive: 'bg-gray-100 text-gray-600', border: 'border-blue-500' }
        : { toggle: 'bg-orange-600 text-white', toggleInactive: 'bg-gray-100 text-gray-600', border: 'border-orange-500' };

    const filteredIngredients = availableIngredients.filter(ing => ing.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const QuantityInput = ({ initialValue, onSave, positiveOnly = false, onReject }: { initialValue: number; onSave: (val: number) => void; positiveOnly?: boolean; onReject?: () => void }) => {
        const [localValue, setLocalValue] = useState<string>(initialValue ? initialValue.toString() : '');
        useEffect(() => { setLocalValue(initialValue ? initialValue.toString() : ''); }, [initialValue]);
        const handleCommit = () => {
            const parsed = parseFloat(localValue.replace(',', '.'));
            const accepted = Number.isFinite(parsed) && (positiveOnly ? parsed > 0 : parsed >= 0);
            if (accepted) onSave(parsed);
            else {
                setLocalValue(initialValue.toString());
                onReject?.();
            }
        };
        return <input type="text" inputMode="decimal" value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={handleCommit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="w-10 max-w-full px-0.5 py-0.5 border rounded text-center text-[10px] font-bold tabular-nums" />;
    };

    const EditablePrice = ({ value, onChange, onBlur, className, ...props }: EditablePriceProps) => {
        const [localValue, setLocalValue] = useState(value ? value.toFixed(2) : "");
        useEffect(() => {
            if (value !== undefined && Math.abs(value - parseFloat(localValue)) > 0.001) {
                setLocalValue(value.toFixed(2));
            }
        }, [value]);
        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            setLocalValue(e.target.value);
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) onChange(val);
        };
        const handleBlurLocal = (e: React.FocusEvent<HTMLInputElement>) => {
            const val = parseFloat(localValue);
            if (!isNaN(val)) { setLocalValue(val.toFixed(2)); onBlur(e); }
            else { setLocalValue(value.toFixed(2)); }
        };
        return <input {...props} type="number" step="0.01" className={className} value={localValue} onChange={handleChange} onBlur={handleBlurLocal} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center text-white"><LoadingSpinner size="xl" className="text-white" /></div>;
    if (!recipe) return <div className="min-h-screen flex items-center justify-center text-white">No encontrada</div>;

    const internalRecipe = isInternalRecipe(recipe.is_sellable);
    const yieldLabel =
        recipe.yield_quantity != null && recipe.yield_unit
            ? `${formatYieldQuantity(Number(recipe.yield_quantity))} ${recipe.yield_unit}`
            : '—';
    const elaborationOk = elaborationCost?.ok === true;
    const lotCostAmount =
        elaborationOk && typeof elaborationCost?.total_cost_eur === 'number'
            ? elaborationCost.total_cost_eur
            : null;
    const unitCostAmount = elaborationOk
        ? elaborationUnitCost(lotCostAmount, recipe.yield_quantity == null ? null : Number(recipe.yield_quantity))
        : null;
    const elaborationErrors = (elaborationCost?.errors ?? [])
        .map((error) => error.status)
        .filter((status): status is string => Boolean(status));

    return (
        <>
            <Toaster position="top-right" />
            <ImageLightbox
                open={isPhotoLightboxOpen}
                src={recipe?.photo_url}
                alt={recipe?.name}
                onClose={() => setIsPhotoLightboxOpen(false)}
            />

            <DashboardDetailLayout
                title={recipe.name}
                titleFace="display"
                titleAlign="center"
                showBackButton
                backHref={recipesListHref}
                template="detail"
                work="catalog"
                maxWidthClass="max-w-6xl"
                contentClassName="p-0 flex flex-col min-h-0"
                rightSlot={
                    !isRestricted ? (
                        <Button
                            type="button"
                            variant="tertiary"
                            instance="recipe-editar-nombre-imagen"
                            onClick={() => setRecipeMetaModalOpen(true)}
                            aria-label="Editar receta"
                            icon={<Pencil className="h-5 w-5" strokeWidth={2.2} />}
                            className="shrink-0"
                        />
                    ) : canOpenFullEdit ? (
                        <Button
                            type="button"
                            variant="tertiary"
                            instance="recipe-full-edit"
                            onClick={() => router.push(fullEditHref)}
                            aria-label="Abrir ficha de edición completa"
                            icon={<Edit2 className="h-5 w-5" strokeWidth={2.5} />}
                            className="shrink-0"
                        />
                    ) : null
                }
                leadSlot={
                    <div data-element="photo-nav" className="flex w-full shrink-0 items-center justify-center gap-4 py-1 sm:gap-6">
                        <Button
                            type="button"
                            variant="tertiary"
                            instance="recipe-prev"
                            icon={<ChevronLeft />}
                            aria-label="Receta anterior"
                            disabled={currentRecipeIndex <= 0}
                            onClick={handlePreviousRecipe}
                        />

                        <div className="w-[min(34vw,9rem)] shrink-0">
                            {recipe.photo_url ? (
                                <button
                                    type="button"
                                    onClick={() => setIsPhotoLightboxOpen(true)}
                                    className={cn(
                                        'w-full cursor-zoom-in border-0 bg-transparent p-0',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-marca/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                                    )}
                                    aria-label="Ver foto ampliada"
                                >
                                    <CatalogSquare
                                        imageSrc={recipe.photo_url}
                                        imageAlt={recipe.name}
                                        price={internalRecipe ? null : recipe.sale_price}
                                        priceClassName={!isRestricted && !internalRecipe && sheetCostKnown ? healthIndicator.color : undefined}
                                    />
                                </button>
                            ) : (
                                <CatalogSquare
                                    imageAlt={recipe.name}
                                    fallback={<Camera className="h-8 w-8 text-gray-300 md:h-10 md:w-10" />}
                                    price={internalRecipe ? null : recipe.sale_price}
                                    priceClassName={!isRestricted && !internalRecipe && sheetCostKnown ? healthIndicator.color : undefined}
                                />
                            )}
                        </div>

                        <Button
                            type="button"
                            variant="tertiary"
                            instance="recipe-next"
                            icon={<ChevronRight />}
                            aria-label="Receta siguiente"
                            disabled={currentRecipeIndex >= allRecipes.length - 1}
                            onClick={handleNextRecipe}
                        />
                    </div>
                }
            >

                <div className="grid grid-cols-1 content-start gap-4 p-4 md:grid-cols-2 md:p-5">
                    {/* Misma puerta que el panel Precio: la vista restringida no ve importes. No se abre el coste a staff. */}
                    {!isRestricted && internalRecipe && (
                        <div data-element="recipe-panel" className="h-full flex flex-col">
                            <div data-element="block-header">
                                <h2 data-element="title">Coste de elaboración</h2>
                            </div>
                            <div className="grid grid-cols-3 gap-2 p-3 text-center">
                                <div>
                                    <div className="text-lg font-black tabular-nums text-gray-800">
                                        {formatElaborationCostEur(lotCostAmount)}
                                    </div>
                                    <div data-element="field-label">Coste del lote</div>
                                </div>
                                <div>
                                    <div className="text-lg font-black tabular-nums text-gray-800">{yieldLabel}</div>
                                    <div data-element="field-label">Rendimiento</div>
                                </div>
                                <div>
                                    <div className="text-lg font-black tabular-nums text-gray-800">
                                        {formatElaborationCostEur(unitCostAmount)}
                                    </div>
                                    <div data-element="field-label">
                                        Coste / {recipe.yield_unit || 'unidad'}
                                    </div>
                                </div>
                            </div>
                            {elaborationCost && !elaborationOk ? (
                                <div
                                    className="mx-3 mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900"
                                    role="status"
                                >
                                    {elaborationErrors.length > 0
                                        ? elaborationErrors.map((status, index) => (
                                              <div key={`${status}-${index}`} data-cost-status={status}>
                                                  {recipeCostV2StatusLabel(status)}
                                              </div>
                                          ))
                                        : 'No se puede calcular el coste'}
                                </div>
                            ) : null}
                        </div>
                    )}
                    {!isRestricted && !internalRecipe && (
                        <div data-element="recipe-panel" className="h-full flex flex-col">
                            <div data-element="block-header">
                                <h2 data-element="title">Precio</h2>
                            </div>
                            <div className="flex flex-col">
                                {/* Sección 1: precio actual + KPIs */}
                                <div className="p-3 flex flex-col shrink-0">
                                    <div className="flex gap-4 justify-center mb-2 shrink-0">
                                        <PetroleumSegmented
                                            instance="recipe-price-location"
                                            density="compact"
                                            aria-label="Ubicación de precio"
                                            value={view.location}
                                            onChange={(location) =>
                                                setView((v) => ({
                                                    ...v,
                                                    location: location as 'pvp' | 'pavello',
                                                }))
                                            }
                                            options={[
                                                { value: 'pvp', label: 'PVP' },
                                                { value: 'pavello', label: 'Pabellón' },
                                            ]}
                                        />
                                        <PetroleumSegmented
                                            instance="recipe-price-size"
                                            density="compact"
                                            aria-label="Tamaño de ración"
                                            value={view.size}
                                            onChange={(size) =>
                                                setView((v) => ({
                                                    ...v,
                                                    size: size as 'full' | 'half',
                                                }))
                                            }
                                            options={[
                                                { value: 'full', label: 'Entero' },
                                                { value: 'half', label: 'Medio' },
                                            ]}
                                        />
                                    </div>
                                    {sheetCostMode === 'unavailable' ? (
                                        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[10px] font-bold leading-snug text-amber-900" role="status">
                                            La composición de media ración no está modelada para las elaboraciones. El PVP puede editarse, pero el coste y el margen no se calculan.
                                        </p>
                                    ) : null}

                                    <div className="my-2 flex items-start gap-1 shrink-0">
                                        <div className="min-w-0 flex-1 text-center">
                                            {!isEditingPrice ? (
                                                <button
                                                    type="button"
                                                    onClick={startEditPrice}
                                                    aria-label="Editar precio"
                                                    className="w-full"
                                                >
                                                    <div className="text-lg font-black tabular-nums text-gray-800 md:text-xl">
                                                        {(currentPrice || 0).toFixed(2)}€
                                                    </div>
                                                </button>
                                            ) : (
                                                <div className="flex items-center justify-center gap-1">
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={priceDraft}
                                                        onChange={(e) => setPriceDraft(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') confirmEditPrice();
                                                            if (e.key === 'Escape') cancelEditPrice();
                                                        }}
                                                        autoFocus
                                                        placeholder="0"
                                                        className={cn(
                                                            "w-16 bg-transparent text-center text-lg font-black tabular-nums text-gray-800 outline-none border-b-2 md:text-xl",
                                                            themeColors.border
                                                        )}
                                                    />
                                                    <span className="text-lg font-black text-gray-800 md:text-xl">€</span>
                                                    <Button
                                                        type="button"
                                                        variant="primary"
                                                        instance="recipe-confirmar-precio"
                                                        onClick={confirmEditPrice}
                                                        disabled={savingPrice}
                                                        loading={savingPrice}
                                                        aria-label="Confirmar"
                                                        icon={<Check className="w-5 h-5" />}
                                                        className="shrink-0"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        instance="recipe-cancelar-precio"
                                                        onClick={cancelEditPrice}
                                                        disabled={savingPrice}
                                                        aria-label="Cancelar"
                                                        icon={<X className="w-5 h-5" />}
                                                        className="shrink-0"
                                                    />
                                                </div>
                                            )}
                                            <div data-element="field-label">Precio</div>
                                        </div>
                                        <div className="min-w-0 flex-1 text-center">
                                            <div className={cn('text-sm font-black tabular-nums', healthIndicator.color)}>{sheetCostKnown ? `${(foodCost || 0).toFixed(0)}%` : '—'}</div>
                                            <div data-element="field-label">FC</div>
                                        </div>
                                        <div className="min-w-0 flex-1 text-center">
                                            <div className="text-sm font-black tabular-nums text-gray-800">{(basePrice || 0).toFixed(2)}€</div>
                                            <div data-element="field-label">Base</div>
                                        </div>
                                        <div className="min-w-0 flex-1 text-center">
                                            <div className="text-sm font-black tabular-nums text-gray-800">{sheetCostKnown ? `${(margin || 0).toFixed(2)}€` : '—'}</div>
                                            <div data-element="field-label">Margen</div>
                                        </div>
                                    </div>

                                    <div className="mt-2 flex items-center gap-2 px-1 shrink-0">
                                        <span data-element="field-label" className="mb-0 min-w-0">
                                            Recomendado ({activeTargetFC}%)
                                        </span>
                                        <span className="shrink-0 text-xs font-black tabular-nums text-blue-600">
                                            {sheetCostKnown ? `${(recommendedPrice || 0).toFixed(2)}€` : '—'}
                                        </span>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            instance="recipe-simulador"
                                            onClick={() => setSimulatorExpanded((v) => !v)}
                                            className="ml-auto shrink-0"
                                        >
                                            Simulador
                                        </Button>
                                    </div>
                                </div>

                                {simulatorExpanded ? (
                                <div className="border-t border-gray-100 p-3 shrink-0">
                                    <div data-surface="accent" className="overflow-hidden rounded-xl bg-purple-600 text-white">
                                        <div className="flex justify-end px-3 pt-3">
                                            <Button
                                                type="button"
                                                variant="primary"
                                                instance="recipe-aplicar-precio-simulado"
                                                onClick={async () => {
                                                    try {
                                                        await applySimulatedPrice();
                                                    } catch {
                                                        // applySimulatedPrice ya emite toast en caso de fallo vía updateRecipeField
                                                    }
                                                }}
                                                disabled={applyingSimulation || isRestricted}
                                                loading={applyingSimulation}
                                                loadingLabel="Aplicando…"
                                                aria-label="Aplicar precio simulado"
                                                className="shrink-0"
                                            >
                                                Aplicar
                                            </Button>
                                        </div>
                                        <div className="flex flex-col gap-4 p-3">
                                            <div className="px-1 text-center">
                                                <span className="text-3xl font-black text-white">
                                                    {(simulatedPrice || 0).toFixed(2)}€
                                                </span>
                                            </div>
                                            <input
                                                type="range"
                                                min={Math.floor(currentPrice * 0.5 * 10) / 10}
                                                max={Math.ceil(currentPrice * 2 * 10) / 10 || 20}
                                                step={0.1}
                                                value={simulatedPrice}
                                                onChange={(e) =>
                                                    setSimulatedPrice(Math.round(parseFloat(e.target.value) * 10) / 10)
                                                }
                                                className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/25 accent-white"
                                            />
                                            <div className="grid grid-cols-3 gap-2 text-center">
                                                <div>
                                                    <div data-element="field-label" className="mb-0">
                                                        FC
                                                    </div>
                                                    <div className="text-lg font-black text-white">
                                                        {sheetCostKnown ? `${(simulatedFoodCost || 0).toFixed(0)}%` : '—'}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div data-element="field-label" className="mb-0">
                                                        Base
                                                    </div>
                                                    <div className="text-lg font-black text-white">
                                                        {(simulatedBasePrice || 0).toFixed(2)}€
                                                    </div>
                                                </div>
                                                <div>
                                                    <div data-element="field-label" className="mb-0">
                                                        Margen
                                                    </div>
                                                    <div className="text-lg font-black text-white">
                                                        {sheetCostKnown ? `${(simulatedMargin || 0).toFixed(2)}€` : '—'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                ) : null}
                            </div>
                        </div>
                    )}
                    <div data-element="recipe-panel" className={`flex flex-col ${!isRestricted ? 'h-full min-h-0' : 'h-fit'}`}>
                        {!isRestricted && recipeIngredientCostIssueCount > 0 && (
                            <div
                                className="flex items-start gap-1.5 border-b border-amber-100 bg-amber-50 px-3 py-1.5 text-[9px] font-bold leading-snug text-amber-900"
                                role="status"
                            >
                                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                                <span>
                                    {recipeIngredientCostIssueCount === 1
                                        ? '1 ingrediente sin coste calculado: pasa el ratón por «—» en Coste o revisa precio y unidades.'
                                        : `${recipeIngredientCostIssueCount} ingredientes sin coste calculado: revisa precio en el artículo y que la unidad de la línea sea compatible (masa / volumen / ud).`}
                                </span>
                            </div>
                        )}
                        <div className="custom-scrollbar relative">
                            <table data-component={TABLE_COMPONENT_ID} data-instance="recipe-ingredients" className="w-full text-left">
                                <colgroup>
                                    <col />
                                    <col className="w-11" />
                                    <col className="w-11" />
                                    {!isRestricted ? <col className="w-14" /> : null}
                                    <col className="w-7" />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th scope="col">Componentes</th>
                                        <th className="text-center">Cant</th>
                                        <th className="text-center">Ud</th>
                                        {!isRestricted && <th className="text-right">Coste</th>}
                                        <th className="w-7"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ingredients.map((ing) => {
                                        const qty = getIngredientQuantity(ing);
                                        const costAnalysis = getRecipeIngredientLineCostAnalysis(
                                            qty,
                                            ing.unit ?? 'kg',
                                            ing.ingredients?.purchase_unit ?? 'kg',
                                            ing.ingredients?.current_price,
                                            ingredientPackBridge(ing)
                                        );
                                        const costDisplayOk = costAnalysis.status === 'ok';
                                        const ingredientCostFromV2 = sheetCostMode != null && ingredientRowCostSource(sheetCostMode) === 'v2';
                                        const v2IngredientCost = ingredientCostFromV2
                                            ? directIngredientLineCost(elaborationCost?.components, ing.id)
                                            : null;
                                        return (
                                            <tr key={ing.id} className="transition-colors hover:bg-gray-50/80">
                                                <td className="py-1 pe-2">
                                                    {!isRestricted && ing.ingredients ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setRecipeIngredientEditTarget(ing.ingredients as Ingredient)}
                                                            className={cn(
                                                                'w-full py-0.5 text-left text-[10px] font-bold leading-tight text-[#36606F] underline-offset-2 hover:underline',
                                                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/25 focus-visible:ring-offset-1',
                                                            )}
                                                            title="Ver / editar ingrediente"
                                                        >
                                                            {ing.ingredients?.name}
                                                        </button>
                                                    ) : (
                                                        <span className="text-[10px] font-bold leading-tight text-gray-800">{ing.ingredients?.name}</span>
                                                    )}
                                                </td>
                                                <td className="px-0.5 py-1 text-center align-middle">
                                                    {isRestricted ? (
                                                        <span className="font-bold text-gray-700">{qty}</span>
                                                    ) : (
                                                        <QuantityInput initialValue={qty} onSave={(val) => handleQuantityChange(ing.id, val)} />
                                                    )}
                                                </td>
                                                <td className="px-0.5 py-1 text-center align-middle">
                                                    {isRestricted ? (
                                                        <span className="font-bold text-gray-400">{ing.unit}</span>
                                                    ) : (
                                                        <select value={ing.unit || 'kg'} onChange={e => { const u = e.target.value; supabase.from('recipe_ingredients').update({ unit: u }).eq('id', ing.id).then(() => { setIngredients(prev => prev.map(i => i.id === ing.id ? { ...i, unit: u } : i)); void refreshSheetCost(); }); }} className="max-w-full rounded border border-gray-100 bg-white px-0.5 py-0.5 text-[10px] font-bold outline-none focus:border-[#36606F]">
                                                            {RECIPE_UNIT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                        </select>
                                                    )}
                                                </td>
                                                {!isRestricted && (
                                                    <td className="px-2 py-1 text-right align-middle">
                                                        {ingredientCostFromV2 ? (
                                                            v2IngredientCost?.costEur != null ? (
                                                                <span className="font-black text-gray-700">
                                                                    {formatElaborationCostEur(v2IngredientCost.costEur)}
                                                                </span>
                                                            ) : (
                                                                <span
                                                                    className="inline-flex items-center justify-end gap-0.5 font-black text-amber-700"
                                                                    title={v2IngredientCost?.status ? recipeCostV2StatusLabel(v2IngredientCost.status) : undefined}
                                                                >
                                                                    {v2IngredientCost?.status ? <AlertCircle className="h-3 w-3 shrink-0 opacity-80" aria-hidden /> : null}
                                                                    —
                                                                </span>
                                                            )
                                                        ) : costDisplayOk ? (
                                                            <span className="font-black text-gray-700">
                                                                {formatRecipeIngredientLineCostEur(costAnalysis.eur)}€
                                                            </span>
                                                        ) : qty > 0 ? (
                                                            <span
                                                                className="inline-flex items-center justify-end gap-0.5 font-black text-amber-700"
                                                                title={recipeLineCostStatusHint(costAnalysis.status)}
                                                            >
                                                                <AlertCircle className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                                                                —
                                                            </span>
                                                        ) : (
                                                            <span className="font-black text-gray-400">{formatRecipeIngredientLineCostEur(0)}€</span>
                                                        )}
                                                    </td>
                                                )}
                                                <td className="py-1 text-center align-middle">
                                                    {!isRestricted && (
                                                        <button type="button" onClick={() => setDeleteIngredientId(ing.id)} className="rounded p-0.5 text-gray-300 transition-colors hover:bg-rose-50 hover:text-rose-500">
                                                            <Trash2 size={12} strokeWidth={3} />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {subrecipes.length > 0 ? (
                                        <tr>
                                            <td colSpan={isRestricted ? 4 : 5} className="px-2 pt-2 text-[9px] font-bold uppercase tracking-wide text-zinc-400">
                                                Elaboraciones
                                            </td>
                                        </tr>
                                    ) : null}
                                    {subrecipes.map((line) => {
                                        const fullPortion = internalRecipe || view.size === 'full';
                                        const lineCost = fullPortion && sheetCostMode === 'recursive'
                                            ? directSubrecipeLineCost(elaborationCost?.components, line.id)
                                            : { status: '', costEur: null };
                                        const unitOptions = compatibleComponentUnits(line.child.yield_unit);
                                        const unitChoices = unitOptions.includes(line.unit) ? unitOptions : [line.unit, ...unitOptions];
                                        const yieldText = line.child.yield_quantity != null && line.child.yield_unit
                                            ? `${formatYieldQuantity(Number(line.child.yield_quantity))} ${line.child.yield_unit}`
                                            : null;
                                        return (
                                            <tr key={`${line.id}-${subrecipeEpoch}`} className="transition-colors hover:bg-gray-50/80">
                                                <td className="py-1 pe-2">
                                                    <div className="text-[10px] font-bold leading-tight text-gray-800">{line.child.name}</div>
                                                    <div className="text-[8px] font-semibold uppercase tracking-wide text-zinc-400">
                                                        {isInternalRecipe(line.child.is_sellable) ? 'Elaboración' : 'Vendible'}
                                                        {yieldText ? ` · ${yieldText}` : ''}
                                                        {!fullPortion ? ' · receta completa' : ''}
                                                    </div>
                                                </td>
                                                <td className="px-0.5 py-1 text-center align-middle">
                                                    {isRestricted ? (
                                                        <span className="font-bold text-gray-700">{line.quantity}</span>
                                                    ) : (
                                                        <QuantityInput
                                                            initialValue={line.quantity}
                                                            positiveOnly
                                                            onReject={() => toast.error('La cantidad tiene que ser mayor que cero')}
                                                            onSave={(val) => { void handleSubrecipeQuantityChange(line, val); }}
                                                        />
                                                    )}
                                                </td>
                                                <td className="px-0.5 py-1 text-center align-middle">
                                                    {isRestricted ? (
                                                        <span className="font-bold text-gray-400">{line.unit}</span>
                                                    ) : (
                                                        <select
                                                            value={line.unit}
                                                            onChange={(e) => { void handleSubrecipeUnitChange(line, e.target.value); }}
                                                            className="max-w-full rounded border border-gray-100 bg-white px-0.5 py-0.5 text-[10px] font-bold outline-none focus:border-[#36606F]"
                                                        >
                                                            {unitChoices.map((unit) => (
                                                                <option key={unit} value={unit}>{unit === 'l' ? 'L' : unit}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </td>
                                                {!isRestricted && (
                                                    <td className="px-2 py-1 text-right align-middle">
                                                        {lineCost.costEur != null ? (
                                                            <span className="font-black text-gray-700">{formatElaborationCostEur(lineCost.costEur)}</span>
                                                        ) : (
                                                            <span
                                                                className="inline-flex items-center justify-end gap-0.5 font-black text-amber-700"
                                                                title={lineCost.status ? recipeCostV2StatusLabel(lineCost.status) : undefined}
                                                            >
                                                                {lineCost.status ? <AlertCircle className="h-3 w-3 shrink-0 opacity-80" aria-hidden /> : null}
                                                                —
                                                            </span>
                                                        )}
                                                    </td>
                                                )}
                                                <td className="py-1 text-center align-middle">
                                                    {!isRestricted && (
                                                        <button type="button" onClick={() => setDeleteSubrecipeId(line.id)} className="rounded p-0.5 text-gray-300 transition-colors hover:bg-rose-50 hover:text-rose-500" aria-label={`Quitar ${line.child.name}`}>
                                                            <Trash2 size={12} strokeWidth={3} />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {!isRestricted && (
                                        <>
                                        <tr
                                            className="cursor-pointer border-t border-gray-50 hover:bg-zinc-50/80"
                                            onClick={openAddIngredientModal}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    openAddIngredientModal();
                                                }
                                            }}
                                            tabIndex={0}
                                            role="button"
                                            aria-label="Añadir componente"
                                        >
                                            <td className="py-1.5">
                                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold italic tracking-normal text-zinc-400">
                                                    Añadir
                                                    <Plus className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                                                </span>
                                            </td>
                                            <td></td>
                                            <td></td>
                                            <td></td>
                                            <td></td>
                                        </tr>
                                        <tr className="sticky bottom-0 border-t border-gray-100 bg-[#5B8FB9]/5 font-black text-[10px]">
                                            <td className="px-2 py-1.5 text-gray-800" colSpan={3}>
                                                <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0">
                                                    <span>Costo total</span>
                                                    {Number(recipe.servings) > 1 ? (
                                                        <span className="text-[9px] font-semibold italic tracking-normal text-zinc-500">
                                                            {Number(recipe.servings)} raciones
                                                        </span>
                                                    ) : null}
                                                </span>
                                            </td>
                                            <td className="px-2 py-1.5 text-right text-[#5B8FB9]">
                                                {sheetCostKnown
                                                    ? (sheetCostMode === 'legacy' ? `${totalCost.toFixed(2)}€` : formatElaborationCostEur(sheetCostEur))
                                                    : '—'}
                                            </td>
                                            <td></td>
                                        </tr>
                                        </>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div data-element="recipe-panel" className={`flex flex-col ${!isRestricted ? 'h-full min-h-0' : 'h-fit'}`}>
                        <div data-element="block-header" className="relative justify-between">
                            <h2 data-element="title">Elaboración</h2>
                            {!isRestricted && (
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 shrink-0">
                                    {canManageRecipeVideo && (
                                        <>
                                            <Button
                                                type="button"
                                                variant="tertiary"
                                                instance="recipe-añadir-video-elaboracion"
                                                onClick={() => elaborationVideoInputRef.current?.click()}
                                                disabled={uploadingElaborationVideo}
                                                loading={uploadingElaborationVideo}
                                                aria-label="Añadir vídeo de elaboración"
                                                icon={<PlayCircle className="w-4 h-4" />}
                                            />
                                            <input
                                                ref={elaborationVideoInputRef}
                                                type="file"
                                                accept="video/*"
                                                className="hidden"
                                                onChange={handleElaborationVideoSelected}
                                            />
                                        </>
                                    )}
                                    <Button
                                        type="button"
                                        variant="tertiary"
                                        instance="recipe-editar-elaboracion"
                                        onClick={() => setIsEditingElaboration(!isEditingElaboration)}
                                        aria-label="Editar"
                                        icon={<Edit2 size={13} />}
                                    />
                                </div>
                            )}
                        </div>
                        <div className="p-3">
                            <div className="custom-scrollbar">
                                {isEditingElaboration ? (
                                    <div className="space-y-1.5">
                                        {elaborationSteps.map((s, i) => (
                                            <div key={i} className="flex gap-1.5 items-center">
                                                <input value={s} onChange={e => handleUpdateElaborationStep(i, e.target.value)} className="flex-1 border border-gray-100 rounded-lg px-2 py-1.5 text-[10px] focus:ring-1 focus:ring-blue-500 outline-none" />
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    instance={`recipe-eliminar-paso-${i}`}
                                                    onClick={() => {
                                                        const n = [...elaborationSteps];
                                                        n.splice(i, 1);
                                                        setElaborationSteps(n);
                                                        void updateTextDB('elaboration', n);
                                                    }}
                                                    aria-label="Eliminar paso"
                                                    icon={<X size={14} />}
                                                />
                                            </div>
                                        ))}
                                        <Button
                                            type="button"
                                            variant="tertiary"
                                            instance="recipe-añadir-paso"
                                            onClick={handleAddElaborationStep}
                                        >
                                            + Añadir paso
                                        </Button>
                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                            <button
                                                type="button"
                                                onClick={handleSaveElaboration}
                                                disabled={savingElaboration}
                                                className="h-12 w-full bg-white text-blue-700 border border-blue-200 text-sm font-bold rounded-xl shadow-sm hover:bg-blue-50 active:scale-[0.99] disabled:opacity-60"
                                            >
                                                <span className="inline-flex items-center justify-center gap-2">
                                                    <Save className="w-4 h-4" />
                                                    {savingElaboration ? 'Guardando…' : 'Guardar'}
                                                </span>
                                            </button>
                                            <Button
                                                type="button"
                                                variant="primary"
                                                instance="recipe-cerrar-guardar-elaboracion"
                                                onClick={async () => {
                                                    try {
                                                        await handleSaveElaboration();
                                                        setIsEditingElaboration(false);
                                                    } catch {
                                                        // si falla, mantenemos modo edición para que el usuario no pierda control
                                                    }
                                                }}
                                                disabled={savingElaboration}
                                                loading={savingElaboration}
                                                loadingLabel="Cerrar (Guardar)"
                                            >
                                                Cerrar (Guardar)
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <ul className="space-y-2">
                                            {elaborationSteps.map((s, i) => (
                                                <li key={i} className="flex gap-3 text-gray-600 text-[10px] leading-relaxed">
                                                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black text-[8px]">{i + 1}</span>
                                                    <span>{s}</span>
                                                </li>
                                            ))}
                                        </ul>

                                        {recipe?.elaboration_video_url && (
                                            <video
                                                controls
                                                preload="metadata"
                                                src={recipe.elaboration_video_url}
                                                className="w-full rounded-2xl bg-black"
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div data-element="recipe-panel" className={`flex flex-col ${!isRestricted ? 'h-full min-h-0' : 'h-fit'}`}>
                        <div data-element="block-header" className="relative justify-between">
                            <h2 data-element="title">Presentación</h2>
                            {!isRestricted && (
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 shrink-0">
                                    <Button
                                        type="button"
                                        variant="tertiary"
                                        instance="recipe-editar-presentacion"
                                        onClick={() => setIsEditingPresentation(!isEditingPresentation)}
                                        aria-label="Editar"
                                        icon={<Edit2 size={13} />}
                                    />
                                </div>
                            )}
                        </div>
                        <div className="p-3 bg-zinc-50/30">
                            <div className="custom-scrollbar">
                                {isEditingPresentation ? (
                                    <div className="space-y-1.5">
                                        {presentationSteps.map((s, i) => (
                                            <div key={i} className="flex gap-1.5 items-center">
                                                <input value={s} onChange={e => handleUpdatePresentationStep(i, e.target.value)} className="flex-1 border border-gray-100 rounded-lg px-2 py-1.5 text-[10px] focus:ring-1 focus:ring-emerald-500 outline-none" />
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    instance={`recipe-eliminar-nota-${i}`}
                                                    onClick={() => {
                                                        const n = [...presentationSteps];
                                                        n.splice(i, 1);
                                                        setPresentationSteps(n);
                                                        void updateTextDB('presentation', n);
                                                    }}
                                                    aria-label="Eliminar nota"
                                                    icon={<X size={14} />}
                                                />
                                            </div>
                                        ))}
                                        <Button
                                            type="button"
                                            variant="tertiary"
                                            instance="recipe-añadir-nota"
                                            onClick={handleAddPresentationStep}
                                        >
                                            + Añadir nota
                                        </Button>
                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                            <button
                                                type="button"
                                                onClick={handleSavePresentation}
                                                disabled={savingPresentation}
                                                className="h-12 w-full bg-white text-emerald-700 border border-emerald-200 text-sm font-bold rounded-xl shadow-sm hover:bg-emerald-50 active:scale-[0.99] disabled:opacity-60"
                                            >
                                                <span className="inline-flex items-center justify-center gap-2">
                                                    <Save className="w-4 h-4" />
                                                    {savingPresentation ? 'Guardando…' : 'Guardar'}
                                                </span>
                                            </button>
                                            <Button
                                                type="button"
                                                variant="primary"
                                                instance="recipe-cerrar-guardar-presentacion"
                                                onClick={async () => {
                                                    try {
                                                        await handleSavePresentation();
                                                        setIsEditingPresentation(false);
                                                    } catch {
                                                        // si falla, mantenemos modo edición para que el usuario no pierda control
                                                    }
                                                }}
                                                disabled={savingPresentation}
                                                loading={savingPresentation}
                                                loadingLabel="Cerrar (Guardar)"
                                            >
                                                Cerrar (Guardar)
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <ul className="space-y-2">
                                        {presentationSteps.map((s, i) => (
                                            <li key={i} className="flex gap-3 text-gray-600 text-[10px] leading-relaxed">
                                                <X className="rotate-45 w-2 h-2 text-emerald-500 mt-1 flex-shrink-0" strokeWidth={5} />
                                                <span>{s}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>
                    {!isRestricted && isMenuRecipe && (
                        <SubRecipesPanel recipeId={recipeId} />
                    )}
                </div>
            </DashboardDetailLayout>

            {/* MODALES */}
            <Modal
                open={showIngredientModal}
                onClose={closeAddIngredientModal}
                variant="compact"
                layer="base"
                instance="recipe-add-ingredient"
                usageId="recipe-add-ingredient"
                usageLabel="Añadir componente receta"
                title="Añadir componente"
            >
                <div className="flex flex-col gap-3">
                    <PetroleumSegmented
                        instance="recipe-add-component-kind"
                        density="comfortable"
                        aria-label="Tipo de componente"
                        value={componentKind}
                        onChange={(kind) => {
                            const next = kind as 'ingredient' | 'elaboration';
                            setComponentKind(next);
                            setSearchTerm('');
                            if (next === 'elaboration') void loadRecipeCandidates();
                        }}
                        options={[
                            { value: 'ingredient', label: 'Ingrediente' },
                            { value: 'elaboration', label: 'Elaboración' },
                        ]}
                    />
                    {componentKind === 'ingredient' ? (
                    <>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-500 shrink-0">Forzar unidad:</span>
                        <select
                            value={addIngredientUnit}
                            onChange={e => {
                                setForceAddIngredientUnit(true);
                                setAddIngredientUnit(e.target.value);
                            }}
                            className="flex-1 p-2 border rounded text-xs font-medium focus:border-[#36606F] outline-none min-h-12"
                        >
                            {RECIPE_UNIT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <p className="text-[10px] text-gray-400 mb-2 leading-snug">Por defecto se usa la unidad configurada en cada ingrediente. Puedes cambiarla después en la tabla.</p>
                    <div className="mb-2">
                    <SearchField
                        instance="recipe-add-ingredient-search"
                        placeholder="Buscar..."
                        value={searchTerm}
                        onChange={setSearchTerm}
                        autoFocus
                    />
                    </div>
                    <div className="max-h-[min(50vh,20rem)] overflow-y-auto space-y-1">
                        {filteredIngredients.map(ing => {
                            const purchaseUnit = ing.purchase_unit || 'ud';
                            const effective = `${Number(ing.current_price || 0).toFixed(4)}€/${purchaseUnit}`;
                            const configuredUnit = resolveIngredientRecipeUnit(ing.recipe_unit, purchaseUnit);
                            const unitToAdd = forceAddIngredientUnit ? addIngredientUnit : configuredUnit;

                            return (
                                <button
                                    key={ing.id}
                                    type="button"
                                    onClick={() => handleAddIngredient(ing.id, unitToAdd, ing.name)}
                                    className="w-full text-left p-2 hover:bg-gray-50 flex justify-between items-center gap-2 rounded text-xs min-h-12"
                                >
                                    <span className="font-bold min-w-0 truncate">{ing.name}</span>
                                    <span className="shrink-0 font-mono text-[10px] text-gray-400">{configuredUnit}</span>
                                    <span className="text-right">
                                        <span className="font-bold text-gray-700">{effective}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    </>
                    ) : (
                    <>
                    <SearchField
                        instance="recipe-add-elaboration-search"
                        placeholder="Buscar receta..."
                        value={searchTerm}
                        onChange={setSearchTerm}
                        autoFocus
                    />
                    <div className="max-h-[min(50vh,20rem)] overflow-y-auto space-y-1">
                        {recipeCandidates
                            .filter((candidate) => candidate.name.toLowerCase().includes(searchTerm.toLowerCase()))
                            .map((candidate) => {
                                const addable = canAddRecipeComponent({
                                    yieldQuantity: candidate.yield_quantity,
                                    yieldUnit: candidate.yield_unit,
                                });
                                const yieldText = candidate.yield_quantity != null && candidate.yield_unit
                                    ? `${formatYieldQuantity(Number(candidate.yield_quantity))} ${candidate.yield_unit}`
                                    : 'Sin rendimiento';
                                return (
                                    <button
                                        key={candidate.id}
                                        type="button"
                                        disabled={!addable}
                                        onClick={() => { void handleAddSubrecipe(candidate); }}
                                        className="flex min-h-12 w-full items-center justify-between gap-2 rounded p-2 text-left text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate font-bold">{candidate.name}</span>
                                            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                                                {isInternalRecipe(candidate.is_sellable) ? 'Elaboración' : 'Vendible'}
                                            </span>
                                        </span>
                                        <span className="shrink-0 font-mono text-[10px] text-gray-500">{addable ? yieldText : 'Sin rendimiento'}</span>
                                    </button>
                                );
                            })}
                    </div>
                    </>
                    )}
                </div>
            </Modal>
            <Modal
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                variant="amplify"
                layer="base"
                instance="recipe-ingredient-create"
                usageId="recipe-ingredient-create"
                usageLabel="Crear ingrediente receta"
                title="Nuevo ingrediente"
            >
                <IngredientCreateForm
                    onClose={() => {
                        setIsModalOpen(false);
                        void fetchAvailableIngredients();
                        void fetchRecipe();
                    }}
                    onCreated={(ingredientId, meta) => {
                        trackRecipeIngredientCreate(namedEntitySummary(meta.name ?? ingredientId));
                    }}
                />
            </Modal>
            {recipeIngredientEditTarget && (
                <IngredientCanonicalEditModal
                    key={recipeIngredientEditTarget.id}
                    ingredient={recipeIngredientEditTarget}
                    onClose={() => setRecipeIngredientEditTarget(null)}
                    onSaved={() => {
                        void fetchRecipe();
                        void fetchAvailableIngredients();
                        void refreshSheetCost();
                    }}
                />
            )}

            <RecipeNamePhotoEditModal
                open={recipeMetaModalOpen && !isRestricted}
                onClose={() => setRecipeMetaModalOpen(false)}
                recipeId={recipeId}
                initialName={recipe.name}
                initialPhotoUrl={recipe.photo_url ?? null}
                initialIsSellable={recipe.is_sellable !== false}
                initialYieldQuantity={recipe.yield_quantity == null ? null : Number(recipe.yield_quantity)}
                initialYieldUnit={recipe.yield_unit}
                categoryId={recipe.menu_category_id ?? ''}
                categories={sortedMenuCategoryRows.map((row) => ({
                    id: row.id,
                    label: labelMenuCategoryForRecipesEs(row, sortedMenuCategoryRows, mcoEsByCategoryId),
                }))}
                onCategoryChange={(id) => {
                    const row = sortedMenuCategoryRows.find((item) => item.id === id);
                    if (row) void handleCategoryUpdate(row);
                }}
                onDelete={() => setDeleteRecipeOpen(true)}
                onSaved={(payload) => {
                    setRecipe((r) => (r ? { ...r, ...payload } : r));
                    void fetchAllRecipes();
                    setRecipeMetaModalOpen(false);
                }}
            />
            <ConfirmModal
                open={deleteRecipeOpen}
                onClose={() => { if (!deletingRecipe) setDeleteRecipeOpen(false); }}
                title="Eliminar receta"
                confirmLabel="Eliminar"
                instance="recipe-delete-confirm"
                usageLabel="Confirmar eliminar receta"
                confirming={deletingRecipe}
                onConfirm={() => { void handleDelete(); }}
            >
                {`¿Seguro que quieres eliminar "${recipe.name}"? Esta acción no se puede deshacer.`}
            </ConfirmModal>
            <ConfirmModal
                open={!!deleteIngredientId}
                onClose={() => { if (!deletingIngredient) setDeleteIngredientId(null); }}
                title="Quitar ingrediente"
                confirmLabel="Quitar"
                instance="recipe-ingredient-delete-confirm"
                usageLabel="Confirmar quitar ingrediente de receta"
                confirming={deletingIngredient}
                onConfirm={() => {
                    if (deleteIngredientId) void handleDeleteIngredient(deleteIngredientId);
                }}
            >
                {`¿Quitar "${ingredients.find((ing) => ing.id === deleteIngredientId)?.ingredients?.name ?? 'este ingrediente'}" de la receta?`}
            </ConfirmModal>
            <ConfirmModal
                open={!!deleteSubrecipeId}
                onClose={() => { if (!deletingSubrecipe) setDeleteSubrecipeId(null); }}
                title="Quitar elaboración"
                confirmLabel="Quitar"
                instance="recipe-subrecipe-delete-confirm"
                usageLabel="Confirmar quitar elaboración de receta"
                confirming={deletingSubrecipe}
                onConfirm={() => {
                    if (deleteSubrecipeId) void handleDeleteSubrecipe(deleteSubrecipeId);
                }}
            >
                {`¿Quitar "${subrecipes.find((line) => line.id === deleteSubrecipeId)?.child.name ?? 'esta elaboración'}" de la receta? La elaboración no se borra.`}
            </ConfirmModal>
        </>
    );
}

export default function RecipeDetailPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen"></div>
        }>
            <RecipeDetailContent />
        </Suspense>
    );
}
