'use client';

import { useState, useEffect, Suspense, useRef, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import { Trash2, Users, Edit2, Plus, X, Save, Camera, ChevronLeft, ChevronRight, ChevronDown, Import, Pencil, Check, PlayCircle, AlertCircle } from 'lucide-react';
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
import { IngredientWizard } from '@/components/ingredients/IngredientWizard';
import { IngredientEditModal, type Ingredient } from '@/components/ingredients/IngredientEditModal';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { TABLE_COMPONENT_ID } from '@/lib/design-system';
import { PetroleumSegmented } from '@/components/ui/PetroleumSegmented';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { namedEntitySummary } from '@/lib/usage/modal-apply';
import * as XLSX from 'xlsx';
import { importRecipes } from '@/app/actions/import-legacy';
import { translateCaToEsTextAction } from '@/app/actions/translate-ca-es';
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

interface ViewState {
    location: 'pvp' | 'pavello';
    size: 'full' | 'half';
}

function RecipeDetailContent() {
    const params = useParams();
    const router = useRouter();
    const recipeId = params.id as string;
    const supabaseRef = useRef(createClient());
    const supabase = supabaseRef.current;
    const importInputRef = useRef<HTMLInputElement | null>(null);
    const elaborationVideoInputRef = useRef<HTMLInputElement | null>(null);
    const [importScope, setImportScope] = useState<'all' | 'elaboration' | 'presentation'>('all');

    // --- 1. ESTADOS ---
    const [recipe, setRecipe] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [view, setView] = useState<ViewState>({ location: 'pvp', size: 'full' });

    const [ingredients, setIngredients] = useState<any[]>([]);
    const [availableIngredients, setAvailableIngredients] = useState<any[]>([]);
    const [allRecipes, setAllRecipes] = useState<any[]>([]);
    const [currentRecipeIndex, setCurrentRecipeIndex] = useState<number>(-1);

    const [backendCost, setBackendCost] = useState<{ total_cost: number; lines: { line_id: string; ingredient_name: string; line_cost: number }[] } | null>(null);
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
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [importingRecipe, setImportingRecipe] = useState(false);
    const [isEditingPrice, setIsEditingPrice] = useState(false);
    const [priceDraft, setPriceDraft] = useState('');
    const [uploadingElaborationVideo, setUploadingElaborationVideo] = useState(false);
    const [isPhotoLightboxOpen, setIsPhotoLightboxOpen] = useState(false);
    const [simulatorExpanded, setSimulatorExpanded] = useState(false);
    const [recipeMetaModalOpen, setRecipeMetaModalOpen] = useState(false);
    const [recipeIngredientEditTarget, setRecipeIngredientEditTarget] = useState<Ingredient | null>(null);
    const [menuCategoryRows, setMenuCategoryRows] = useState<MenuCategoryRow[]>([]);
    const [mcoEsByCategoryId, setMcoEsByCategoryId] = useState<Map<string, string | null>>(() => new Map());

    const trackRecipeCategory = useTrackModalApply('recipe-category', 'Categoría receta');
    const trackRecipeAddIngredient = useTrackModalApply('recipe-add-ingredient', 'Añadir ingrediente receta');
    const trackRecipeIngredientWizard = useTrackModalApply('recipe-ingredient-wizard', 'Asistente ingrediente receta');

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

    const recipeCategoryLabel = useMemo(() => {
        if (!recipe) return '';
        if (!recipe.menu_category_id) return String(recipe.category ?? '').trim();
        const row = menuCategoryRows.find((x: MenuCategoryRow) => x.id === recipe.menu_category_id);
        if (!row) return String(recipe.category ?? '').trim();
        return labelMenuCategoryForRecipesEs(row, sortedMenuCategoryRows, mcoEsByCategoryId);
    }, [recipe, menuCategoryRows, sortedMenuCategoryRows, mcoEsByCategoryId]);

    const isMenuRecipe = useMemo(
        () => isMenusPackCategory(recipe ?? {}, menusPackCategoryId),
        [recipe, menusPackCategoryId],
    );

    const currentQueryString = searchParams.toString();
    const buildDetailHref = (id: string) => (currentQueryString ? `/recipes/${id}?${currentQueryString}` : `/recipes/${id}`);

    // --- 2. FUNCIONES DE CARGA ---
    const fetchAvailableIngredients = async () => {
        const { data } = await supabase.from('ingredients').select('*').order('name');
        if (data) setAvailableIngredients(data);
    };

    const fetchBackendCost = async () => {
        const useHalf = view.size === 'half';
        const { data, error } = await supabase.rpc('get_recipe_cost', { p_recipe_id: recipeId, p_use_half_ration: useHalf });
        if (!error && data) setBackendCost(data as { total_cost: number; lines: { line_id: string; ingredient_name: string; line_cost: number }[] });
        else setBackendCost(null);
    };

    const fetchRecipe = async () => {
        try {
            const { data, error } = await supabase
                .from('recipes')
                .select(`*, recipe_ingredients (*, ingredients (*))`)
                .eq('id', recipeId)
                .single();

            if (error) throw error;
            setRecipe(data);

            const sortedIngs = (data.recipe_ingredients || []).sort((a: any, b: any) =>
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
                const list = data.filter((r) => getRecipeFoodCostStatus(r) === foodCostFilter);
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
            q = q.is('menu_category_id', null);
        }
        const { data } = await q;
        if (data) {
            setAllRecipes(data);
            setCurrentRecipeIndex(data.findIndex((r) => r.id === recipeId));
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

    useEffect(() => {
        setSimulatorExpanded(false);
    }, [recipeId]);

    const isRestricted = isStaffView || (userRole !== 'manager' && userRole !== 'supervisor' && userRole !== null);
    const canImportRecipe = !isStaffView && userRole === 'manager';
    const canManageRecipeVideo = !isStaffView && userRole === 'manager';

    async function sha256Hex(buf: ArrayBuffer): Promise<string> {
        const hash = await crypto.subtle.digest('SHA-256', buf);
        const bytes = new Uint8Array(hash);
        return Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }

    function looksLikeRecipeFichaCsv(text: string): boolean {
        const t = text.toLowerCase();
        return t.includes('ingredients;') && (t.includes('elaboració') || t.includes('elaboracio')) && t.includes('presentació');
    }

    function parseRecipeFichaCsvToImportRows(text: string): any[] {
        const lines = text
            .split(/\r?\n/)
            .map((l) => l.trimEnd())
            .filter((l) => l.length > 0);

        const rows = lines.map((l) => l.split(';'));

        // Nombre receta = primera celda no vacía que no sea cabecera "Ingredients"
        const firstNameRow = rows.find((r) => {
            const c0 = (r[0] ?? '').trim();
            if (!c0) return false;
            const c0n = c0.toLowerCase();
            return c0n !== 'ingredients' && c0n !== 'ingredientes';
        });
        const recipeName = (firstNameRow?.[0] ?? '').trim();

        const headerIdx = rows.findIndex((r) => (r[0] ?? '').trim().toLowerCase() === 'ingredients');
        if (!recipeName || headerIdx === -1) return [];

        // Ingredientes: desde después de cabecera hasta antes de "Elaboració"
        const elaborIdx = rows.findIndex((r) => (r[0] ?? '').trim().toLowerCase().startsWith('elabor'));
        const ingStart = headerIdx + 1;
        const ingEnd = elaborIdx === -1 ? rows.length : elaborIdx;
        const ingredientRows: Array<{ ingrediente_nombre: string; cantidad: string; unidad: string }> = [];

        for (let i = ingStart; i < ingEnd; i++) {
            const r = rows[i];
            const name = (r[0] ?? '').trim();
            const unit = (r[1] ?? '').trim();
            const qty = (r[2] ?? '').trim();
            if (!name) continue;
            // saltar filas separadoras
            if (name.toLowerCase() === 'ingredients') continue;
            ingredientRows.push({ ingrediente_nombre: name, unidad: unit, cantidad: qty });
        }

        // Elaboración / Presentación: filas con bullets tras el separador
        let elaboration = '';
        let presentation = '';
        if (elaborIdx !== -1) {
            const elabLines: string[] = [];
            const presLines: string[] = [];
            for (let i = elaborIdx + 1; i < rows.length; i++) {
                const r = rows[i];
                const e = (r[0] ?? '').trim();
                const p = (r[4] ?? '').trim();
                if (e) elabLines.push(e.replace(/^[•‣\-\s]+/, '').trim());
                if (p) presLines.push(p.replace(/^[•‣\-\s]+/, '').trim());
            }
            elaboration = elabLines.filter(Boolean).join('\n');
            presentation = presLines.filter(Boolean).join('\n');
        }

        const base = {
            nombre_receta: recipeName,
            // claves que importRecipes ya reconoce
            'elaboración': elaboration,
            'presentación': presentation,
        };

        if (ingredientRows.length === 0) {
            return [base];
        }

        return ingredientRows.map((ir, idx) => ({
            ...base,
            ingrediente_nombre: ir.ingrediente_nombre,
            cantidad: ir.cantidad,
            unidad: ir.unidad,
            // solo por ahorrar payload; pero seguimos poniendo el texto en la primera fila del grupo
            ...(idx === 0 ? {} : { 'elaboración': '', 'presentación': '' }),
        }));
    }

    function normalizeKey(s: string) {
        return s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function getRowRecipeName(row: Record<string, any>): string {
        const keys = Object.keys(row ?? {});
        const candidates = [
            'nombre_receta',
            'nombre receta',
            'receta',
            'recipe_name',
            'nombre_plato',
            'nombre',
            'name',
        ];
        for (const c of candidates) {
            const nk = normalizeKey(c);
            const found = keys.find((k) => normalizeKey(k) === nk);
            if (found && row[found] != null && String(row[found]).trim() !== '') {
                return String(row[found]).trim();
            }
        }
        return '';
    }

    function getRowTextByKey(row: Record<string, any>, candidates: string[]): string {
        const keys = Object.keys(row ?? {});
        for (const c of candidates) {
            const nk = normalizeKey(c);
            const found = keys.find((k) => normalizeKey(k) === nk);
            if (found && row[found] != null) {
                const v = String(row[found]).trim();
                if (v) return v;
            }
        }
        return '';
    }

    async function parseImportFileToRows(file: File): Promise<Record<string, any>[]> {
        if (file.name.toLowerCase().endsWith('.csv')) {
            const txt = await file.text();
            if (looksLikeRecipeFichaCsv(txt)) {
                return parseRecipeFichaCsvToImportRows(txt) as any;
            }
            // XLSX también puede leer CSV; usamos el mismo fallback que dashboard/import
            const wb = XLSX.read(txt, { type: 'string' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            return XLSX.utils.sheet_to_json(ws) as any;
        }

        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        return XLSX.utils.sheet_to_json(ws) as any;
    }

    async function handleImportIconClick() {
        if (!canImportRecipe) return;
        if (!recipe?.name) {
            toast.error('No se puede importar: receta sin nombre cargado.');
            return;
        }
        setImportScope('all');
        importInputRef.current?.click();
    }

    async function handleImportSectionClick(scope: 'elaboration' | 'presentation') {
        if (!canImportRecipe) return;
        if (!recipe?.name) {
            toast.error('No se puede importar: receta sin nombre cargado.');
            return;
        }
        setImportScope(scope);
        importInputRef.current?.click();
    }

    async function handleImportFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        // permitir re-seleccionar el mismo archivo
        e.target.value = '';
        if (!file) return;
        if (!canImportRecipe) return;
        if (!recipe?.name) {
            toast.error('No se puede importar: receta sin nombre cargado.');
            return;
        }

        setImportingRecipe(true);
        try {
            const fileRows = await parseImportFileToRows(file);

            if (!Array.isArray(fileRows) || fileRows.length === 0) {
                toast.error('Archivo vacío o no interpretable.');
                return;
            }

            const expected = String(recipe.name).trim().toLowerCase();
            const filtered = fileRows.filter((r) => getRowRecipeName(r).trim().toLowerCase() === expected);

            if (filtered.length === 0) {
                toast.error(`El archivo no contiene filas para "${recipe.name}" (por nombre_receta).`);
                return;
            }

            if (importScope === 'elaboration' || importScope === 'presentation') {
                const keyCandidates = importScope === 'elaboration' ? ['elaboración', 'elaboracion', 'elaboration'] : ['presentación', 'presentacion', 'presentation'];
                const sectionText =
                    filtered.map((r) => getRowTextByKey(r, keyCandidates)).find((t) => String(t ?? '').trim() !== '') ??
                    '';
                if (!String(sectionText).trim()) {
                    toast.error(`El archivo no trae ${importScope === 'elaboration' ? 'elaboración' : 'presentación'} para esta receta.`);
                    return;
                }
                const translated = await translateCaToEsTextAction({ text: sectionText });
                if (translated.warning) toast(translated.warning);
                await updateRecipeField(importScope === 'elaboration' ? 'elaboration' : 'presentation', translated.text);
                toast.success(
                    `Importación OK (solo ${importScope === 'elaboration' ? 'elaboración' : 'presentación'}${translated.translated ? ', traducido' : ''})`
                );
                await fetchRecipe();
                return;
            }

            const ok = confirm(`Vas a IMPORTAR y SOBREESCRIBIR la receta actual:\n\n"${recipe.name}"\n\n¿Continuar?`);
            if (!ok) return;

            const buf = await file.arrayBuffer();
            const fileHashSha256 = await sha256Hex(buf).catch(() => null);

            const res = await importRecipes(filtered, { fileName: file.name, fileHashSha256: fileHashSha256 ?? undefined }, { overwriteExisting: true });

            if (!res.success) {
                toast.error(res.message || 'Error importando receta');
                if (res.errors?.length) {
                    for (const err of res.errors.slice(0, 3)) toast.error(err);
                }
                return;
            }

            toast.success(`Importación OK: ${res.message}`);
            if (res.errors?.length) {
                // avisos no fatales
                for (const warn of res.errors.slice(0, 3)) toast(warn);
            }

            await fetchRecipe();
            fetchBackendCost();
        } catch (err: any) {
            console.error(err);
            toast.error(err?.message || 'Error inesperado importando receta');
        } finally {
            setImportingRecipe(false);
            setImportScope('all');
        }
    }

    useEffect(() => {
        if (!recipe) return;
        const price = getCurrentPrice();
        setSimulatedPrice(price || 0);
    }, [view, recipe]);

    useEffect(() => {
        if (!recipeId) return;
        const useHalf = view.size === 'half';
        supabase.rpc('get_recipe_cost', { p_recipe_id: recipeId, p_use_half_ration: useHalf })
            .then(({ data, error }) => {
                if (!error && data) setBackendCost(data as { total_cost: number; lines: { line_id: string; ingredient_name: string; line_cost: number }[] });
                else setBackendCost(null);
            });
    }, [recipeId, view.size]);

    // --- 4. LÓGICA DE NEGOCIO ---
    const getCurrentPrice = () => {
        if (!recipe) return 0;
        if (view.size === 'full') {
            return view.location === 'pvp' ? recipe.sale_price : recipe.sales_price_pavello;
        } else {
            return view.location === 'pvp' ? recipe.sale_price_half : recipe.sale_price_half_pavello;
        }
    };

    const getIngredientQuantity = (ing: any) => {
        return view.size === 'full' ? (ing.quantity_gross || 0) : (ing.quantity_half || 0);
    };

    const ingredientPackBridge = (ing: any): IngredientPackBridgeContext | undefined => {
        const i = ing?.ingredients;
        if (!i) return undefined;
        return {
            supplier_pricing_mode: i.supplier_pricing_mode,
            pack_unit_size_qty: i.pack_unit_size_qty,
            pack_unit_size_unit: i.pack_unit_size_unit,
            pack_price: i.pack_price,
            pack_units: i.pack_units,
            purchase_unit: i.purchase_unit,
        };
    };

    const calculateIngredientCost = (ing: any) => {
        const qty = getIngredientQuantity(ing);
        const price = ing.ingredients?.current_price ?? 0;
        const purchaseUnit = ing.ingredients?.purchase_unit ?? 'kg';
        const recipeUnit = ing.unit ?? 'kg';
        return recipeLineCost(qty, recipeUnit, purchaseUnit, price, ingredientPackBridge(ing));
    };

    const totalCostClient = ingredients.reduce((sum, ing) => sum + calculateIngredientCost(ing), 0);
    const totalCost = backendCost != null ? backendCost.total_cost : totalCostClient;

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
    const updateRecipeField = async (field: string, value: any) => {
        const { error } = await supabase.from('recipes').update({ [field]: value }).eq('id', recipeId);
        if (error) {
            toast.error(`No se pudo guardar (${field}): ${error.message}`);
            throw error;
        }
        setRecipe({ ...recipe, [field]: value });
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

            const fileName = `${Date.now()}-${cleanBase || 'elaboracion'}.${ext}`;
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
        } catch (err: any) {
            console.error(err);
            toast.error(err?.message || 'Error subiendo vídeo');
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
        fetchBackendCost();
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
        setRecipe({ ...recipe, menu_category_id: menuCat.id, category: categoryDb });
        trackRecipeCategory(namedEntitySummary(labelMenuCategoryForRecipesEs(menuCat, sortedMenuCategoryRows, mcoEsByCategoryId)));
        setShowCategoryModal(false);
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
        if (!confirm('¿Eliminar?')) return;
        await supabase.from('recipes').delete().eq('id', recipeId);
        router.push(recipesListHref);
    };

    const closeAddIngredientModal = () => {
        setShowIngredientModal(false);
        setForceAddIngredientUnit(false);
        setSearchTerm('');
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
        fetchBackendCost();
        closeAddIngredientModal();
    };

    const handleDeleteIngredient = async (id: string) => {
        if (!confirm('¿Eliminar?')) return;
        
        // Optimistic update
        setIngredients(prev => prev.filter(ing => ing.id !== id));
        
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
            // Supabase no borró nada (RLS silencioso u otro problema)
            console.warn('DELETE no eliminó ninguna fila. id:', id, '| count:', count);
            toast.error('No se pudo eliminar el ingrediente');
            await fetchRecipe();
            return;
        }
        
        toast.success('Ingrediente eliminado');
        fetchBackendCost();
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

    const healthIndicator = getHealthIndicator(foodCost);
    const simulatedHealthIndicator = getHealthIndicator(simulatedFoodCost);

    const themeColors = view.location === 'pvp'
        ? { toggle: 'bg-blue-600 text-white', toggleInactive: 'bg-gray-100 text-gray-600', border: 'border-blue-500' }
        : { toggle: 'bg-orange-600 text-white', toggleInactive: 'bg-gray-100 text-gray-600', border: 'border-orange-500' };

    const filteredIngredients = availableIngredients.filter(ing => ing.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const recipeIngredientNavigationList = useMemo(
        () => ingredients.map((ri: any) => ri.ingredients).filter(Boolean) as Ingredient[],
        [ingredients]
    );

    const QuantityInput = ({ initialValue, onSave }: { initialValue: number; onSave: (val: number) => void }) => {
        const [localValue, setLocalValue] = useState<string>(initialValue ? initialValue.toString() : '');
        useEffect(() => { setLocalValue(initialValue ? initialValue.toString() : ''); }, [initialValue]);
        const handleCommit = () => {
            const parsed = parseFloat(localValue.replace(',', '.'));
            if (!isNaN(parsed) && parsed >= 0) onSave(parsed);
            else setLocalValue(initialValue.toString());
        };
        return <input type="text" inputMode="decimal" value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={handleCommit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="w-14 px-1 py-0.5 border rounded text-center text-xs" />;
    };

    const EditablePrice = ({ value, onChange, onBlur, className, ...props }: any) => {
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
                showBackButton
                backHref={recipesListHref}
                template="detail"
                maxWidthClass="max-w-6xl"
                contentClassName="p-0 flex flex-col min-h-0"
                rightSlot={
                    <div className="flex shrink-0 items-center justify-end gap-2">
                        {!isRestricted && (
                            <Button
                                type="button"
                                variant="tertiary"
                                instance="recipe-editar-nombre-imagen"
                                onClick={() => setRecipeMetaModalOpen(true)}
                                aria-label="Editar nombre e imagen"
                                icon={<Pencil className="h-5 w-5" strokeWidth={2.2} />}
                                className="shrink-0"
                            />
                        )}
                        {canImportRecipe && (
                            <Button
                                type="button"
                                variant="tertiary"
                                instance="recipe-importar"
                                onClick={handleImportIconClick}
                                disabled={importingRecipe}
                                loading={importingRecipe}
                                aria-label="Importar (sobrescribe esta receta)"
                                icon={<Import className="h-5 w-5" />}
                                className="shrink-0"
                            />
                        )}
                    </div>
                }
            >
                    {canImportRecipe && (
                        <input
                            ref={importInputRef}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            className="hidden"
                            onChange={handleImportFileSelected}
                        />
                    )}

                    <div className="relative mt-1 flex w-full shrink-0 items-center justify-center py-2">
                        <button
                            type="button"
                            onClick={handlePreviousRecipe}
                            disabled={currentRecipeIndex <= 0}
                            className="absolute left-2 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center text-ds-marca/50 transition hover:text-ds-marca disabled:pointer-events-none disabled:opacity-0"
                            aria-label="Receta anterior"
                        >
                            <ChevronLeft className="h-8 w-8" />
                        </button>

                        <div className="bg-white rounded-xl p-0.5 shadow-sm">
                            <div className="group relative flex h-20 w-32 items-center justify-center overflow-hidden rounded-lg border border-gray-100/50 bg-white">
                                {recipe.photo_url ? (
                                    <button
                                        type="button"
                                        onClick={() => setIsPhotoLightboxOpen(true)}
                                        className={cn(
                                            'absolute inset-0 h-full w-full cursor-zoom-in',
                                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-marca/40',
                                        )}
                                        aria-label="Ver foto ampliada"
                                    >
                                        <img src={recipe.photo_url} alt={recipe.name} className="h-full w-full object-contain" />
                                    </button>
                                ) : (
                                    <Camera className="h-6 w-6 text-gray-300" />
                                )}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleNextRecipe}
                            disabled={currentRecipeIndex >= allRecipes.length - 1}
                            className="absolute right-2 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center text-ds-marca/50 transition hover:text-ds-marca disabled:pointer-events-none disabled:opacity-0"
                            aria-label="Receta siguiente"
                        >
                            <ChevronRight className="h-8 w-8" />
                        </button>
                    </div>

                    <div className="flex items-center justify-center gap-4 mt-1 mb-2 text-zinc-600">
                        {isRestricted ? (
                            <span className="px-2 py-0.5 bg-zinc-100 rounded-full font-medium uppercase tracking-wider text-[9px]">{recipeCategoryLabel}</span>
                        ) : (
                            <button onClick={() => setShowCategoryModal(true)} className="px-2 py-0.5 bg-zinc-100 hover:bg-zinc-200 rounded-full font-medium uppercase tracking-wider text-[9px] transition-colors min-h-12">{recipeCategoryLabel}</button>
                        )}
                        <div className="flex items-center gap-1.5 text-[9px] font-bold">
                            <Users className="w-3.5 h-3.5" />
                            <span>{recipe.servings || 1} rac</span>
                        </div>
                        {!isRestricted && (
                            <Button
                                type="button"
                                variant="destructive"
                                instance="recipe-eliminar"
                                onClick={handleDelete}
                            >
                                ELIMINAR
                            </Button>
                        )}
                    </div>

                {/* CUERPO: fondo blanco roto */}
                <div className="bg-[#fafafa] p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 gap-4 content-start">
                    {!isRestricted && (
                        <div className="bg-white rounded-xl shadow-lg overflow-hidden h-full flex flex-col">
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

                                    <div className="flex items-center justify-center gap-1 my-2 shrink-0">
                                        <span className="text-lg font-bold text-gray-800">€</span>
                                        {!isEditingPrice ? (
                                            <div className="flex items-center gap-2">
                                                <div className="text-3xl font-black text-center text-gray-800 tabular-nums">
                                                    {(currentPrice || 0).toFixed(2)}
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="tertiary"
                                                    instance="recipe-editar-precio"
                                                    onClick={startEditPrice}
                                                    aria-label="Editar precio"
                                                    icon={<Pencil className="w-4 h-4" />}
                                                    className="shrink-0"
                                                />
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
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
                                                        "text-3xl font-black text-center text-gray-800 border-b-2 outline-none w-28 bg-transparent tabular-nums",
                                                        themeColors.border
                                                    )}
                                                />
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
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 text-center shrink-0">
                                        <div><div className="text-sm font-bold text-gray-500">FC</div><div className={`text-xl font-black ${healthIndicator.color}`}>{(foodCost || 0).toFixed(0)}%</div></div>
                                        <div><div className="text-sm font-bold text-gray-500">Base</div><div className="text-xl font-black text-gray-800">{(basePrice || 0).toFixed(2)}</div></div>
                                        <div><div className="text-sm font-bold text-gray-500">Margen</div><div className="text-xl font-black text-gray-800">{(margin || 0).toFixed(2)}</div></div>
                                    </div>

                                    <div className="flex justify-between items-center mt-2 px-2 shrink-0">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Recomendado ({activeTargetFC}%)</span>
                                        <span className="text-xs font-black text-blue-600">{(recommendedPrice || 0).toFixed(2)}€</span>
                                    </div>
                                </div>

                                {/* Sección 2: simulador (plegado por defecto) */}
                                <div className="border-t border-gray-100 p-3 shrink-0">
                                    <div className="rounded-xl bg-purple-600 text-white overflow-hidden">
                                        <div
                                            className={cn(
                                                'flex items-stretch gap-2 px-3 shrink-0',
                                                simulatorExpanded && 'border-b border-white/15',
                                            )}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setSimulatorExpanded((v) => !v)}
                                                aria-expanded={simulatorExpanded}
                                                className={cn(
                                                    'flex flex-1 items-center justify-between gap-2 min-h-12 py-3 text-left',
                                                    'transition-colors hover:bg-white/10 active:bg-white/15',
                                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-inset',
                                                )}
                                            >
                                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Simulador</span>
                                                <ChevronDown
                                                    className={cn(
                                                        'h-5 w-5 shrink-0 text-white/80 transition-transform duration-200',
                                                        simulatorExpanded && 'rotate-180',
                                                    )}
                                                    aria-hidden
                                                />
                                            </button>
                                            {simulatorExpanded && (
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
                                                    className="shrink-0 self-center"
                                                >
                                                    Aplicar
                                                </Button>
                                            )}
                                        </div>

                                        {simulatorExpanded && (
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
                                                        <div className="text-[9px] font-bold uppercase tracking-widest text-white/80">
                                                            FC
                                                        </div>
                                                        <div className="text-lg font-black text-white">
                                                            {(simulatedFoodCost || 0).toFixed(0)}%
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[9px] font-bold uppercase tracking-widest text-white/80">
                                                            Base
                                                        </div>
                                                        <div className="text-lg font-black text-white">
                                                            {(simulatedBasePrice || 0).toFixed(2)}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[9px] font-bold uppercase tracking-widest text-white/80">
                                                            Margen
                                                        </div>
                                                        <div className="text-lg font-black text-white">
                                                            {(simulatedMargin || 0).toFixed(2)}€
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className={`bg-white rounded-xl shadow-lg overflow-hidden flex flex-col ${!isRestricted ? 'h-full min-h-0' : 'h-fit'}`}>
                        <div data-element="block-header" className="h-9">
                            <h2 data-element="title" className="min-w-0 flex-1">
                                Ingredientes <span className="opacity-50">({ingredients.length})</span>
                            </h2>
                            {!isRestricted && (
                                <div className="flex shrink-0 items-center gap-1.5">
                                    <Button
                                        type="button"
                                        variant="primary"
                                        instance="recipe-añadir-ingrediente"
                                        onClick={() => {
                                            setForceAddIngredientUnit(false);
                                            setAddIngredientUnit('kg');
                                            setShowIngredientModal(true);
                                        }}
                                        aria-label="Añadir ingrediente"
                                        className="shrink-0"
                                    >
                                        + Añadir
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="tertiary"
                                        instance="recipe-nuevo-ingrediente"
                                        onClick={() => setIsModalOpen(true)}
                                        aria-label="Nuevo ingrediente"
                                        className="shrink-0"
                                    >
                                        + Nuevo
                                    </Button>
                                </div>
                            )}
                        </div>
                        <div className="custom-scrollbar relative">
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
                            <table data-component={TABLE_COMPONENT_ID} data-instance="recipe-ingredients" className="w-full text-left">
                                <thead>
                                    <tr>
                                        <th>Ingrediente</th>
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
                                        return (
                                            <tr key={ing.id} className="transition-colors hover:bg-gray-50/80">
                                                <td className="max-w-[120px] truncate px-3 py-1">
                                                    {!isRestricted && ing.ingredients ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setRecipeIngredientEditTarget(ing.ingredients as Ingredient)}
                                                            className={cn(
                                                                'w-full truncate py-0.5 text-left text-[10px] font-bold leading-tight text-[#36606F] underline-offset-2 hover:underline',
                                                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/25 focus-visible:ring-offset-1',
                                                            )}
                                                            title="Ver / editar ingrediente"
                                                        >
                                                            {ing.ingredients?.name}
                                                        </button>
                                                    ) : (
                                                        <span className="truncate text-[10px] font-bold leading-tight text-gray-800">{ing.ingredients?.name}</span>
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
                                                        <select value={ing.unit || 'kg'} onChange={e => { const u = e.target.value; supabase.from('recipe_ingredients').update({ unit: u }).eq('id', ing.id).then(() => { setIngredients(prev => prev.map(i => i.id === ing.id ? { ...i, unit: u } : i)); fetchBackendCost(); }); }} className="rounded border border-gray-100 bg-white px-1 py-0.5 text-[10px] font-bold outline-none focus:border-[#36606F]">
                                                            {RECIPE_UNIT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                        </select>
                                                    )}
                                                </td>
                                                {!isRestricted && (
                                                    <td className="px-2 py-1 text-right align-middle">
                                                        {costDisplayOk ? (
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
                                                        <button type="button" onClick={() => handleDeleteIngredient(ing.id)} className="rounded p-0.5 text-gray-300 transition-colors hover:bg-rose-50 hover:text-rose-500">
                                                            <Trash2 size={12} strokeWidth={3} />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {!isRestricted && (
                                        <tr className="sticky bottom-0 border-t border-gray-100 bg-[#5B8FB9]/5 font-black text-[10px]">
                                            <td className="px-3 py-1.5 text-gray-800" colSpan={3}>COSTO TOTAL</td>
                                            <td className="px-2 py-1.5 text-right text-[#5B8FB9]">{totalCost.toFixed(2)}€</td>
                                            <td></td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className={`bg-white rounded-xl shadow-lg overflow-hidden flex flex-col ${!isRestricted ? 'h-full min-h-0' : 'h-fit'}`}>
                        <div data-element="block-header" className="relative justify-between">
                            <h2 data-element="title">Elaboración</h2>
                            {!isRestricted && (
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 shrink-0">
                                    {canImportRecipe && (
                                        <Button
                                            type="button"
                                            variant="tertiary"
                                            instance="recipe-importar-elaboracion"
                                            onClick={() => handleImportSectionClick('elaboration')}
                                            disabled={importingRecipe}
                                            loading={importingRecipe}
                                            aria-label="Importar (solo elaboración)"
                                            icon={<Import className="w-4 h-4" />}
                                        />
                                    )}
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
                                                className="h-12 w-full bg-white text-blue-700 border border-blue-200 text-[10px] font-black uppercase tracking-widest rounded-xl shadow-sm hover:bg-blue-50 active:scale-[0.99] disabled:opacity-60"
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

                    <div className={`bg-white rounded-xl shadow-lg overflow-hidden flex flex-col ${!isRestricted ? 'h-full min-h-0' : 'h-fit'}`}>
                        <div data-element="block-header" className="relative justify-between">
                            <h2 data-element="title">Presentación</h2>
                            {!isRestricted && (
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 shrink-0">
                                    {canImportRecipe && (
                                        <Button
                                            type="button"
                                            variant="tertiary"
                                            instance="recipe-importar-presentacion"
                                            onClick={() => handleImportSectionClick('presentation')}
                                            disabled={importingRecipe}
                                            loading={importingRecipe}
                                            aria-label="Importar (solo presentación)"
                                            icon={<Import className="w-4 h-4" />}
                                        />
                                    )}
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
                                                className="h-12 w-full bg-white text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase tracking-widest rounded-xl shadow-sm hover:bg-emerald-50 active:scale-[0.99] disabled:opacity-60"
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
                usageLabel="Añadir ingrediente receta"
                title="Añadir ingrediente"
            >
                <div className="flex flex-col">
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
                    <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-2 border rounded text-xs mb-2" autoFocus />
                    <div className="max-h-[min(50vh,20rem)] overflow-y-auto space-y-1">
                        {filteredIngredients.map(ing => {
                            const purchaseUnit = ing.purchase_unit || 'ud';
                            const effective = `${Number(ing.current_price || 0).toFixed(4)}€/${purchaseUnit}`;
                            const packInfo =
                                ing.supplier_pricing_mode === 'per_pack'
                                    ? `${Number(ing.pack_price || 0).toFixed(2)}€/pack`
                                    : null;

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
                                        {packInfo && <span className="block text-[10px] text-gray-400">{packInfo}</span>}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </Modal>
            <Modal
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                variant="amplify"
                layer="base"
                instance="recipe-ingredient-wizard"
                usageId="recipe-ingredient-wizard"
                usageLabel="Asistente ingrediente receta"
                title="Nuevo ingrediente"
                hideHeader // Wizard dibuja su propia navegación interna (PricingStepHeader + cierre propio)
                scrollContent
            >
                <IngredientWizard
                    onClose={() => {
                        setIsModalOpen(false);
                        void fetchAvailableIngredients();
                        void fetchRecipe();
                    }}
                    onSaved={(ingredientId, meta) => {
                        trackRecipeIngredientWizard(namedEntitySummary(meta?.name ?? ingredientId));
                    }}
                />
            </Modal>
            <Modal
                open={showCategoryModal}
                onClose={() => setShowCategoryModal(false)}
                variant="compact"
                layer="base"
                instance="recipe-category"
                usageId="recipe-category"
                usageLabel="Categoría receta"
                title="Categoría"
            >
                <div className="grid max-h-[min(60vh,24rem)] grid-cols-2 gap-2 overflow-y-auto">
                    {sortedMenuCategoryRows.map((row) => (
                        <button
                            key={row.id}
                            type="button"
                            onClick={() => void handleCategoryUpdate(row)}
                            className={`rounded-lg py-2 text-xs font-bold ${
                                recipe.menu_category_id === row.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                            }`}
                        >
                            {labelMenuCategoryForRecipesEs(row, sortedMenuCategoryRows, mcoEsByCategoryId)}
                        </button>
                    ))}
                </div>
            </Modal>

            {recipeIngredientEditTarget && (
                <IngredientEditModal
                    key={recipeIngredientEditTarget.id}
                    ingredient={recipeIngredientEditTarget}
                    onClose={() => setRecipeIngredientEditTarget(null)}
                    onSaved={() => {
                        void fetchRecipe();
                        void fetchAvailableIngredients();
                        fetchBackendCost();
                    }}
                    navigationIngredients={recipeIngredientNavigationList}
                />
            )}

            <RecipeNamePhotoEditModal
                open={recipeMetaModalOpen && !isRestricted}
                onClose={() => setRecipeMetaModalOpen(false)}
                recipeId={recipeId}
                initialName={recipe.name}
                initialPhotoUrl={recipe.photo_url ?? null}
                onSaved={(payload) => {
                    setRecipe((r: any) => (r ? { ...r, ...payload } : r));
                    void fetchAllRecipes();
                    setRecipeMetaModalOpen(false);
                }}
            />
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