'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import { ArrowLeft, Trash2, Users, Edit2, Plus, X, Save, Camera, ChevronLeft, ChevronRight, Beaker, Import } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { toast, Toaster } from 'sonner';
import CreateIngredientModal from '@/components/CreateIngredientModal';
import { cn } from '@/lib/utils';
import { recipeLineCost, RECIPE_UNIT_OPTIONS } from '@/lib/recipe-cost';
import { SubRecipesPanel } from '@/components/recipes/SubRecipesPanel';
import * as XLSX from 'xlsx';
import { importRecipes } from '@/app/actions/import-legacy';

const CATEGORY_OPTIONS = ['Tapas', 'Entrantes', 'Principales', 'Postres', 'Bebidas', 'Vinos', 'Cocktails', 'Menús'];

interface ViewState {
    location: 'pvp' | 'pavello';
    size: 'full' | 'half';
}

function RecipeDetailContent() {
    const params = useParams();
    const router = useRouter();
    const recipeId = params.id as string;
    const supabase = createClient();
    const importInputRef = useRef<HTMLInputElement | null>(null);

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

    const [showIngredientModal, setShowIngredientModal] = useState(false);
    const [addIngredientUnit, setAddIngredientUnit] = useState<string>('kg');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [importingRecipe, setImportingRecipe] = useState(false);

    const searchParams = useSearchParams();
    const isStaffView = searchParams.get('view') === 'staff';

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
        const { data } = await supabase.from('recipes').select('id, name').order('name');
        if (data) {
            setAllRecipes(data);
            setCurrentRecipeIndex(data.findIndex((r: any) => r.id === recipeId));
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
    }, [recipeId]);

    const isRestricted = isStaffView || (userRole !== 'manager' && userRole !== 'supervisor' && userRole !== null);
    const canImportRecipe = !isStaffView && userRole === 'manager';

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

    async function handleImportIconClick() {
        if (!canImportRecipe) return;
        if (!recipe?.name) {
            toast.error('No se puede importar: receta sin nombre cargado.');
            return;
        }
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

        const ok = confirm(`Vas a IMPORTAR y SOBREESCRIBIR la receta actual:\n\n"${recipe.name}"\n\n¿Continuar?`);
        if (!ok) return;

        setImportingRecipe(true);
        try {
            const buf = await file.arrayBuffer();
            const fileHashSha256 = await sha256Hex(buf).catch(() => null);

            let fileRows: Record<string, any>[] = [];

            if (file.name.toLowerCase().endsWith('.csv')) {
                const txt = await file.text();
                if (looksLikeRecipeFichaCsv(txt)) {
                    fileRows = parseRecipeFichaCsvToImportRows(txt) as any;
                } else {
                    // XLSX también puede leer CSV; usamos el mismo fallback que dashboard/import
                    const wb = XLSX.read(txt, { type: 'string' });
                    const wsname = wb.SheetNames[0];
                    const ws = wb.Sheets[wsname];
                    fileRows = XLSX.utils.sheet_to_json(ws) as any;
                }
            } else {
                const wb = XLSX.read(buf, { type: 'array' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                fileRows = XLSX.utils.sheet_to_json(ws) as any;
            }

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

            const res = await importRecipes(
                filtered,
                { fileName: file.name, fileHashSha256: fileHashSha256 ?? undefined },
                { overwriteExisting: true }
            );

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

    const calculateIngredientCost = (ing: any) => {
        const qty = getIngredientQuantity(ing);
        const price = ing.ingredients?.current_price ?? 0;
        const purchaseUnit = ing.ingredients?.purchase_unit ?? 'kg';
        const recipeUnit = ing.unit ?? 'kg';
        return recipeLineCost(qty, recipeUnit, purchaseUnit, price);
    };

    const totalCostClient = ingredients.reduce((sum, ing) => sum + calculateIngredientCost(ing), 0);
    const totalCost = backendCost != null ? backendCost.total_cost : totalCostClient;
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
        await supabase.from('recipes').update({ [field]: value }).eq('id', recipeId);
        setRecipe({ ...recipe, [field]: value });
        toast.success('Actualizado');
    };

    const handlePriceUpdate = async (newPrice: string) => {
        const num = parseFloat(newPrice);
        if (isNaN(num)) return;
        setSavingPrice(true);
        let field = 'sale_price';
        if (view.size === 'full') field = view.location === 'pvp' ? 'sale_price' : 'sales_price_pavello';
        else field = view.location === 'pvp' ? 'sale_price_half' : 'sale_price_half_pavello';

        await updateRecipeField(field, num);
        setSavingPrice(false);
    };

    const handleQuantityChange = async (ingredientId: string, newQuantity: number) => {
        const column = view.size === 'full' ? 'quantity_gross' : 'quantity_half';
        await supabase.from('recipe_ingredients').update({ [column]: newQuantity }).eq('id', ingredientId);
        setIngredients(ingredients.map(ing => ing.id === ingredientId ? { ...ing, [column]: newQuantity } : ing));
        fetchBackendCost();
    };

    const handleCategoryUpdate = async (cat: string) => {
        await updateRecipeField('category', cat);
        setShowCategoryModal(false);
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
        if (currentRecipeIndex > 0) router.push(`/recipes/${allRecipes[currentRecipeIndex - 1].id}`);
    };
    const handleNextRecipe = () => {
        if (currentRecipeIndex < allRecipes.length - 1) router.push(`/recipes/${allRecipes[currentRecipeIndex + 1].id}`);
    };

    const handleDelete = async () => {
        if (!confirm('¿Eliminar?')) return;
        await supabase.from('recipes').delete().eq('id', recipeId);
        router.push('/recipes');
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            toast.error("La imagen es muy grande (Máx 5MB)");
            return;
        }

        setUploadingPhoto(true);
        try {
            const fileExt = file.name.split('.').pop();
            const cleanName = file.name
                .toLowerCase()
                .replace(/\.[^/.]+$/, "")
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]/g, "_");

            const fileName = `${Date.now()}-${cleanName}.${fileExt}`;

            await supabase.storage.from('recipes').upload(fileName, file, { upsert: true });
            const { data } = supabase.storage.from('recipes').getPublicUrl(fileName);
            await updateRecipeField('photo_url', data.publicUrl);
            toast.success('Foto actualizada');
        } catch (e) { toast.error('Error foto'); }
        finally { setUploadingPhoto(false); }
    };

    const handleAddIngredient = async (ingredientId: string, unit: string) => {
        await supabase.from('recipe_ingredients').insert({
            recipe_id: recipeId,
            ingredient_id: ingredientId,
            quantity_gross: 1,
            quantity_half: 0.5,
            unit: unit || 'kg'
        });
        await fetchRecipe();
        fetchBackendCost();
        setShowIngredientModal(false);
    };

    const handleDeleteIngredient = async (id: string) => {
        if (!confirm('¿Eliminar?')) return;
        await supabase.from('recipe_ingredients').delete().eq('id', id);
        await fetchRecipe();
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

    const getHealthIndicator = (fc: number) => {
        const safeFC = fc || 0;
        if (safeFC < 30) return { color: 'text-green-600', label: '● Óptimo', bg: 'bg-green-50' };
        if (safeFC < 35) return { color: 'text-amber-500', label: '● Alerta', bg: 'bg-yellow-50' };
        return { color: 'text-red-600', label: '● Crítico', bg: 'bg-red-50' };
    };

    const healthIndicator = getHealthIndicator(foodCost);
    const simulatedHealthIndicator = getHealthIndicator(simulatedFoodCost);
    const isMenuRecipe = recipe?.category === 'Menús';

    const themeColors = view.location === 'pvp'
        ? { toggle: 'bg-blue-600 text-white', toggleInactive: 'bg-gray-100 text-gray-600', border: 'border-blue-500' }
        : { toggle: 'bg-orange-600 text-white', toggleInactive: 'bg-gray-100 text-gray-600', border: 'border-orange-500' };

    const filteredIngredients = availableIngredients.filter(ing => ing.name.toLowerCase().includes(searchTerm.toLowerCase()));

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

    if (loading) return <div className="min-h-screen bg-[#5B8FB9] flex items-center justify-center text-white"><LoadingSpinner size="xl" className="text-white" /></div>;
    if (!recipe) return <div className="min-h-screen bg-[#5B8FB9] flex items-center justify-center text-white">No encontrada</div>;

    return (
        <div className={`min-h-screen bg-[#5B8FB9] p-4 md:p-6 flex flex-col ${isRestricted ? 'overflow-y-auto pb-8' : 'overflow-hidden'}`}>
            <Toaster position="top-right" />

            {/* CONTENEDOR GRANDE: cabecera petróleo + fondo blanco roto */}
            <div className={`max-w-6xl mx-auto w-full flex-1 flex flex-col bg-white rounded-[20px] shadow-xl overflow-hidden ${!isRestricted ? 'min-h-0' : ''}`}>
                {/* CABECERA COLOR PETRÓLEO - COMPACTA */}
                <div className="bg-[#36606F] px-4 md:px-6 py-2 flex flex-col items-center justify-center shrink-0">
                    <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
                        {/* Zona izquierda: nombre receta */}
                        <div className="min-w-0">
                            <div className="text-white font-black text-[13px] md:text-[15px] leading-tight truncate">
                                {recipe.name}
                            </div>
                        </div>

                        {/* Centro: foto + navegación */}
                        <div className="relative flex items-center justify-center w-fit shrink-0">
                        <button 
                            onClick={handlePreviousRecipe} 
                            disabled={currentRecipeIndex <= 0} 
                            className="absolute -left-12 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center transition disabled:opacity-0 text-white/50 hover:text-white"
                        >
                            <ChevronLeft className="w-8 h-8" />
                        </button>
                        
                        <div className="bg-white rounded-xl p-0.5 shadow-sm">
                            <div className="relative group w-24 h-14 bg-white rounded-lg flex items-center justify-center overflow-hidden border border-gray-100/50">
                                {recipe.photo_url ? (
                                    <img src={recipe.photo_url} alt={recipe.name} className="w-full h-full object-contain" />
                                ) : (
                                    <Camera className="w-5 h-5 text-gray-300" />
                                )}
                                {!isRestricted && (
                                    <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition cursor-pointer text-white">
                                        <Camera className="w-4 h-4" />
                                        <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" disabled={uploadingPhoto} />
                                    </label>
                                )}
                                {uploadingPhoto && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><LoadingSpinner size="sm" className="text-blue-600" /></div>}
                            </div>
                        </div>

                        <button 
                            onClick={handleNextRecipe} 
                            disabled={currentRecipeIndex >= allRecipes.length - 1} 
                            className="absolute -right-12 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center transition disabled:opacity-0 text-white/50 hover:text-white"
                        >
                            <ChevronRight className="w-8 h-8" />
                        </button>
                    </div>

                        {/* Zona derecha: reserva (mantiene centrado) */}
                        <div className="min-w-0 flex items-center justify-end">
                            {canImportRecipe && (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleImportIconClick}
                                        disabled={importingRecipe}
                                        title="Importar (sobrescribe esta receta)"
                                        className={cn(
                                            "w-10 h-10 flex items-center justify-center transition text-white/60 hover:text-white active:scale-95",
                                            importingRecipe ? "opacity-40 pointer-events-none" : ""
                                        )}
                                    >
                                        <Import className="w-5 h-5" />
                                    </button>
                                    <input
                                        ref={importInputRef}
                                        type="file"
                                        accept=".xlsx,.xls,.csv"
                                        className="hidden"
                                        onChange={handleImportFileSelected}
                                    />
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-center gap-4 mt-2 text-white/90">
                        {isRestricted ? (
                            <span className="px-2 py-0.5 bg-white/20 rounded-full font-medium uppercase tracking-wider text-[9px]">{recipe.category}</span>
                        ) : (
                            <button onClick={() => setShowCategoryModal(true)} className="px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded-full font-medium uppercase tracking-wider text-[9px] transition-colors">{recipe.category}</button>
                        )}
                        <div className="flex items-center gap-1.5 text-[9px] font-bold">
                            <Users className="w-3.5 h-3.5" />
                            <span>{recipe.servings || 1} rac</span>
                        </div>
                        {!isRestricted && (
                            <button onClick={handleDelete} className="px-2 py-0.5 bg-rose-500/20 hover:bg-rose-500/40 text-rose-100 border border-rose-500/30 rounded-full transition font-black text-[9px] flex items-center gap-1.5 active:scale-95">
                                <Trash2 size={11} strokeWidth={3} /> ELIMINAR
                            </button>
                        )}
                    </div>
                </div>

                {/* CUERPO: fondo blanco roto */}
                <div className={`bg-[#fafafa] p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 ${!isRestricted ? 'min-h-0' : ''}`}>
                    {!isRestricted && (
                        <div className="bg-white rounded-xl shadow-lg overflow-hidden h-full flex flex-col">
                            <div className="bg-[#36606F] px-4 py-2 shrink-0">
                                <h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Escandallos y Precios</h2>
                            </div>
                            <div className="p-3 flex-1 flex flex-col justify-between">
                                <div>
                                    <div className="flex gap-4 justify-center mb-2">
                                        {/* Toggle PVP / PAV */}
                                        <div className="inline-flex rounded-lg overflow-hidden border border-[#36606F] shadow-sm shrink-0">
                                            <button 
                                                onClick={() => setView(v => ({ ...v, location: 'pvp' }))} 
                                                className={cn(
                                                    "px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-colors outline-none",
                                                    view.location === 'pvp' ? "bg-[#36606F] text-white" : "bg-white text-[#36606F] hover:bg-[#36606F]/5"
                                                )}
                                            >
                                                PVP
                                            </button>
                                            <button 
                                                onClick={() => setView(v => ({ ...v, location: 'pavello' }))} 
                                                className={cn(
                                                    "px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-colors outline-none",
                                                    view.location === 'pavello' ? "bg-[#36606F] text-white" : "bg-white text-[#36606F] hover:bg-[#36606F]/5"
                                                )}
                                            >
                                                PAV
                                            </button>
                                        </div>

                                        {/* Toggle 1 / 1/2 */}
                                        <div className="inline-flex rounded-lg overflow-hidden border border-[#36606F] shadow-sm shrink-0">
                                            <button 
                                                onClick={() => setView(v => ({ ...v, size: 'full' }))} 
                                                className={cn(
                                                    "px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-colors outline-none",
                                                    view.size === 'full' ? "bg-[#36606F] text-white" : "bg-white text-[#36606F] hover:bg-[#36606F]/5"
                                                )}
                                            >
                                                1
                                            </button>
                                            <button 
                                                onClick={() => setView(v => ({ ...v, size: 'half' }))} 
                                                className={cn(
                                                    "px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-colors outline-none",
                                                    view.size === 'half' ? "bg-[#36606F] text-white" : "bg-white text-[#36606F] hover:bg-[#36606F]/5"
                                                )}
                                            >
                                                1/2
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-center gap-1 my-2">
                                    <span className="text-lg font-bold text-gray-800">€</span>
                                    <EditablePrice
                                        value={currentPrice || 0}
                                        onChange={(val: number) =>
                                            setRecipe({
                                                ...recipe,
                                                [view.location === 'pvp'
                                                    ? view.size === 'full'
                                                        ? 'sale_price'
                                                        : 'sale_price_half'
                                                    : view.size === 'full'
                                                      ? 'sales_price_pavello'
                                                      : 'sale_price_half_pavello']: val,
                                            })
                                        }
                                        onBlur={(e: any) => handlePriceUpdate(e.target.value)}
                                        className={`text-3xl font-black text-center text-gray-800 border-b-2 focus:${themeColors.border} outline-none w-28 bg-transparent`}
                                    />
                                </div>
                                <div className="rounded-lg p-2 grid grid-cols-3 gap-2 text-center bg-gray-50">
                                    <div><div className="text-sm font-bold text-gray-500">FC</div><div className={`text-xl font-black ${healthIndicator.color}`}>{(foodCost || 0).toFixed(0)}%</div></div>
                                    <div><div className="text-sm font-bold text-gray-500">Base</div><div className="text-xl font-black text-gray-800">{(basePrice || 0).toFixed(2)}</div></div>
                                    <div><div className="text-sm font-bold text-gray-500">Margen</div><div className="text-xl font-black text-gray-800">{(margin || 0).toFixed(2)}</div></div>
                                </div>
                                <div className="flex justify-between items-center mt-2 px-2">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Recomendado (Target {activeTargetFC}%)</span>
                                    <span className="text-xs font-black text-blue-600">{(recommendedPrice || 0).toFixed(2)}€</span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className={`bg-white rounded-xl shadow-lg overflow-hidden flex flex-col ${!isRestricted ? 'h-full min-h-0' : 'h-fit'}`}>
                        <div className="bg-[#36606F] px-4 py-2 shrink-0 flex items-center justify-between">
                            <h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Ingredientes <span className="opacity-50">({ingredients.length})</span></h2>
                            {!isRestricted && (
                                <div className="flex gap-1">
                                    <button onClick={() => setShowIngredientModal(true)} className="px-2 py-0.5 bg-green-500 text-white rounded text-[8px] font-black uppercase tracking-wider hover:bg-green-600">+ Añadir</button>
                                    <button onClick={() => setIsModalOpen(true)} className="px-2 py-0.5 bg-purple-500 text-white rounded text-[8px] font-black uppercase tracking-wider hover:bg-purple-600">+ Nuevo</button>
                                </div>
                            )}
                        </div>
                        <div className="overflow-y-auto flex-1 custom-scrollbar relative">
                            <table className="w-full text-[10px] border-collapse">
                                <thead className="sticky top-0 z-10 bg-white shadow-sm">
                                    <tr className="text-gray-400 font-black uppercase tracking-widest text-[8px] border-b border-gray-100">
                                        <th className="text-left py-2 px-3">Ingrediente</th>
                                        <th className="text-center">Cant</th>
                                        <th className="text-center">Ud</th>
                                        {!isRestricted && <th className="text-right">Coste</th>}
                                        <th className="w-8"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {ingredients.map((ing) => {
                                        const cost = calculateIngredientCost(ing);
                                        const qty = getIngredientQuantity(ing);
                                        return (
                                            <tr key={ing.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="py-2 px-3 text-gray-800 font-bold truncate max-w-[120px]">{ing.ingredients?.name}</td>
                                                <td className="text-center py-2">
                                                    {isRestricted ? (
                                                        <span className="text-gray-700 font-bold">{qty}</span>
                                                    ) : (
                                                        <QuantityInput initialValue={qty} onSave={(val) => handleQuantityChange(ing.id, val)} />
                                                    )}
                                                </td>
                                                <td className="text-center py-2">
                                                    {isRestricted ? (
                                                        <span className="text-gray-400 font-bold">{ing.unit}</span>
                                                    ) : (
                                                        <select value={ing.unit || 'kg'} onChange={e => { const u = e.target.value; supabase.from('recipe_ingredients').update({ unit: u }).eq('id', ing.id).then(() => { setIngredients(prev => prev.map(i => i.id === ing.id ? { ...i, unit: u } : i)); fetchBackendCost(); }); }} className="text-[10px] font-bold border border-gray-100 rounded px-1 py-0.5 bg-white focus:border-[#36606F] outline-none">
                                                            {RECIPE_UNIT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                        </select>
                                                    )}
                                                </td>
                                                {!isRestricted && <td className="text-right font-black text-gray-700 py-2">{cost.toFixed(2)}€</td>}
                                                <td className="text-center py-2">
                                                    {!isRestricted && (
                                                        <button onClick={() => handleDeleteIngredient(ing.id)} className="p-1 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                                                            <Trash2 size={12} strokeWidth={3} />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {!isRestricted && (
                                        <tr className="bg-[#5B8FB9]/5 font-black text-[10px] sticky bottom-0">
                                            <td className="py-2 px-3 text-gray-800" colSpan={3}>COSTO TOTAL</td>
                                            <td className="py-2 text-right text-[#5B8FB9] pr-1">{totalCost.toFixed(2)}€</td>
                                            <td></td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    {!isRestricted && (
                        <div className="bg-white rounded-xl shadow-lg overflow-hidden h-full flex flex-col">
                            <div className="bg-[#36606F] px-4 py-2 shrink-0 flex items-center gap-2">
                                <Beaker className="w-3.5 h-3.5 text-white/70" />
                                <h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Simulador de Margen</h2>
                            </div>
                            <div className="p-3 flex-1 flex flex-col justify-between">
                                <div className="flex flex-col justify-center gap-4">
                                    <div className="flex items-center justify-between px-4">
                                        <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Simulado</span>
                                        <span className="text-3xl font-black text-purple-600">{(simulatedPrice || 0).toFixed(2)}€</span>
                                    </div>
                                    <input type="range" min={Math.floor((currentPrice * 0.5) * 10) / 10} max={Math.ceil((currentPrice * 2) * 10) / 10 || 20} step={0.10} value={simulatedPrice} onChange={(e) => setSimulatedPrice(Math.round(parseFloat(e.target.value) * 10) / 10)} className="w-full h-1.5 bg-purple-100 rounded-lg appearance-none cursor-pointer accent-purple-600" />
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        <div><div className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">FC</div><div className={`text-lg font-black ${simulatedHealthIndicator.color}`}>{(simulatedFoodCost || 0).toFixed(0)}%</div></div>
                                        <div><div className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Base</div><div className="text-lg font-black text-purple-800">{(simulatedBasePrice || 0).toFixed(2)}</div></div>
                                        <div><div className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Margen</div><div className="text-lg font-black text-purple-800">{(simulatedMargin || 0).toFixed(2)}€</div></div>
                                    </div>
                                </div>
                                <button onClick={applySimulatedPrice} disabled={applyingSimulation || simulatedPrice === currentPrice} className="w-full py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition font-black text-[10px] mt-2 uppercase tracking-[0.2em] shadow-lg shadow-purple-600/20 disabled:opacity-50">APLICAR CAMBIOS</button>
                            </div>
                        </div>
                    )}
                    <div className={`bg-white rounded-xl shadow-lg overflow-hidden flex flex-col ${!isRestricted ? 'h-full min-h-0' : 'h-fit'}`}>
                        <div className="bg-[#36606F] px-4 py-2 shrink-0"><h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Elaboración y Notas</h2></div>
                        <div className="flex-1 p-3 border-b flex flex-col min-h-0 overflow-hidden">
                            <div className="flex justify-between items-center mb-2 shrink-0">
                                <h2 className="text-[10px] font-black text-blue-600 uppercase tracking-wider">Metodología</h2>
                                {!isRestricted && (
                                    <button onClick={() => setIsEditingElaboration(!isEditingElaboration)} className="text-xs text-blue-500 hover:bg-blue-50 p-1.5 rounded-lg transition-colors">
                                        <Edit2 size={14} />
                                    </button>
                                )}
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {isEditingElaboration ? (
                                    <div className="space-y-1.5">
                                        {elaborationSteps.map((s, i) => (
                                            <div key={i} className="flex gap-1.5 items-center">
                                                <input value={s} onChange={e => handleUpdateElaborationStep(i, e.target.value)} className="flex-1 border border-gray-100 rounded-lg px-2 py-1.5 text-[10px] focus:ring-1 focus:ring-blue-500 outline-none" />
                                                <button onClick={() => { const n = [...elaborationSteps]; n.splice(i, 1); setElaborationSteps(n); updateTextDB('elaboration', n); }} className="p-1 text-gray-300 hover:text-rose-500"><X size={14} /></button>
                                            </div>
                                        ))}
                                        <button onClick={handleAddElaborationStep} className="text-[10px] font-bold text-blue-500 w-full py-2 hover:bg-blue-50 rounded-lg transition-colors border border-dashed border-blue-200">+ Añadir paso</button>
                                        <button onClick={() => setIsEditingElaboration(false)} className="block w-full bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest py-2 rounded-xl mt-2 shadow-lg shadow-blue-600/20">Cerrar Edición</button>
                                    </div>
                                ) : (
                                    <ul className="space-y-2">
                                        {elaborationSteps.map((s, i) => (
                                            <li key={i} className="flex gap-3 text-gray-600 text-[10px] leading-relaxed">
                                                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black text-[8px]">{i + 1}</span>
                                                <span>{s}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 p-3 flex flex-col min-h-0 overflow-hidden bg-zinc-50/30">
                            <div className="flex justify-between items-center mb-2 shrink-0">
                                <h2 className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Presentación</h2>
                                {!isRestricted && (
                                    <button onClick={() => setIsEditingPresentation(!isEditingPresentation)} className="text-xs text-emerald-500 hover:bg-emerald-50 p-1.5 rounded-lg transition-colors">
                                        <Edit2 size={14} />
                                    </button>
                                )}
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {isEditingPresentation ? (
                                    <div className="space-y-1.5">
                                        {presentationSteps.map((s, i) => (
                                            <div key={i} className="flex gap-1.5 items-center">
                                                <input value={s} onChange={e => handleUpdatePresentationStep(i, e.target.value)} className="flex-1 border border-gray-100 rounded-lg px-2 py-1.5 text-[10px] focus:ring-1 focus:ring-emerald-500 outline-none" />
                                                <button onClick={() => { const n = [...presentationSteps]; n.splice(i, 1); setPresentationSteps(n); updateTextDB('presentation', n); }} className="p-1 text-gray-300 hover:text-rose-500"><X size={14} /></button>
                                            </div>
                                        ))}
                                        <button onClick={handleAddPresentationStep} className="text-[10px] font-bold text-emerald-500 w-full py-2 hover:bg-emerald-50 rounded-lg transition-colors border border-dashed border-emerald-200">+ Añadir nota</button>
                                        <button onClick={() => setIsEditingPresentation(false)} className="block w-full bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest py-2 rounded-xl mt-2 shadow-lg shadow-emerald-600/20">Cerrar Edición</button>
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
            </div>

            {/* MODALES */}
            {showIngredientModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowIngredientModal(false)}>
                    <div className="bg-white rounded-xl shadow-2xl p-4 max-w-sm w-full max-h-[60vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-2"><h3 className="font-bold text-sm">Añadir ingrediente</h3><button onClick={() => setShowIngredientModal(false)}><X size={16} /></button></div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold text-gray-500 shrink-0">Unidad en receta:</span>
                            <select value={addIngredientUnit} onChange={e => setAddIngredientUnit(e.target.value)} className="flex-1 p-2 border rounded text-xs font-medium focus:border-[#36606F] outline-none">
                                {RECIPE_UNIT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-2 border rounded text-xs mb-2" autoFocus />
                        <div className="flex-1 overflow-y-auto space-y-1">
                            {filteredIngredients.map(ing => {
                                const purchaseUnit = ing.purchase_unit || 'ud';
                                const effective = `${Number(ing.current_price || 0).toFixed(4)}€/${purchaseUnit}`;
                                const packInfo =
                                    ing.supplier_pricing_mode === 'per_pack'
                                        ? `${Number(ing.pack_price || 0).toFixed(2)}€/pack`
                                        : null;

                                return (
                                    <button
                                        key={ing.id}
                                        onClick={() => handleAddIngredient(ing.id, addIngredientUnit)}
                                        className="w-full text-left p-2 hover:bg-gray-50 flex justify-between rounded text-xs"
                                    >
                                        <span className="font-bold">{ing.name}</span>
                                        <span className="text-right">
                                            <span className="font-bold text-gray-700">{effective}</span>
                                            {packInfo && <span className="block text-[10px] text-gray-400">{packInfo}</span>}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
            <CreateIngredientModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={() => { fetchAvailableIngredients(); fetchRecipe(); }} />
            {showCategoryModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCategoryModal(false)}>
                    <div className="bg-white rounded-xl p-4 max-w-xs w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="grid grid-cols-2 gap-2">{CATEGORY_OPTIONS.map(cat => (<button key={cat} onClick={() => { handleCategoryUpdate(cat); }} className={`py-2 rounded-lg font-bold text-xs ${recipe.category === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{cat}</button>))}</div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function RecipeDetailPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#5B8FB9]"></div>
        }>
            <RecipeDetailContent />
        </Suspense>
    );
}