'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import { ArrowLeft, Trash2, Users, Edit2, Plus, X, Save, Camera, Loader2, ChevronLeft, ChevronRight, Beaker } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import CreateIngredientModal from '@/components/CreateIngredientModal';

const CATEGORY_OPTIONS = ['Tapas', 'Entrantes', 'Principales', 'Postres', 'Bebidas', 'Vinos', 'Cocktails'];

interface ViewState {
    location: 'pvp' | 'pavello';
    size: 'full' | 'half';
}

export default function RecipeDetailPage() {
    const params = useParams();
    const router = useRouter();
    const recipeId = params.id as string;
    const supabase = createClient();

    // --- 1. ESTADOS ---
    const [recipe, setRecipe] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [view, setView] = useState<ViewState>({ location: 'pvp', size: 'full' });

    const [ingredients, setIngredients] = useState<any[]>([]);
    const [availableIngredients, setAvailableIngredients] = useState<any[]>([]);
    const [allRecipes, setAllRecipes] = useState<any[]>([]);
    const [currentRecipeIndex, setCurrentRecipeIndex] = useState<number>(-1);

    const [simulatedPrice, setSimulatedPrice] = useState(0);
    const [savingPrice, setSavingPrice] = useState(false);
    const [applyingSimulation, setApplyingSimulation] = useState(false);
    const [targetFC, setTargetFC] = useState(30);

    const [isEditingElaboration, setIsEditingElaboration] = useState(false);
    const [elaborationSteps, setElaborationSteps] = useState<string[]>([]);

    const [isEditingPresentation, setIsEditingPresentation] = useState(false);
    const [presentationSteps, setPresentationSteps] = useState<string[]>([]);

    const [showIngredientModal, setShowIngredientModal] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [showCategoryModal, setShowCategoryModal] = useState(false);

    // --- 2. FUNCIONES DE CARGA ---
    const fetchAvailableIngredients = async () => {
        const { data } = await supabase.from('ingredients').select('*').order('name');
        if (data) setAvailableIngredients(data);
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
    }, [recipeId]);

    useEffect(() => {
        if (!recipe) return;
        const price = getCurrentPrice();
        setSimulatedPrice(price || 0);
    }, [view, recipe]);

    // --- 4. LÓGICA DE NEGOCIO ---
    const getCurrentPrice = () => {
        if (!recipe) return 0;
        if (view.size === 'full') {
            return view.location === 'pvp' ? recipe.sale_price : recipe.sales_price_pavello;
        } else {
            return view.location === 'pvp' ? recipe.sale_price_half : recipe.price_pavello_half;
        }
    };

    const getIngredientQuantity = (ing: any) => {
        return view.size === 'full' ? (ing.quantity_gross || 0) : (ing.quantity_half || 0);
    };

    const calculateIngredientCost = (ing: any) => {
        const qty = getIngredientQuantity(ing);
        const price = ing.ingredients?.current_price || 0;
        return qty * price;
    };

    const totalCost = ingredients.reduce((sum, ing) => sum + calculateIngredientCost(ing), 0);
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
        else field = view.location === 'pvp' ? 'sale_price_half' : 'price_pavello_half';

        await updateRecipeField(field, num);
        setSavingPrice(false);
    };

    const handleQuantityChange = async (ingredientId: string, newQuantity: number) => {
        const column = view.size === 'full' ? 'quantity_gross' : 'quantity_half';
        await supabase.from('recipe_ingredients').update({ [column]: newQuantity }).eq('id', ingredientId);
        setIngredients(ingredients.map(ing => ing.id === ingredientId ? { ...ing, [column]: newQuantity } : ing));
    };

    const handleCategoryUpdate = async (cat: string) => {
        await updateRecipeField('category', cat);
        setShowCategoryModal(false);
    };

    const applySimulatedPrice = async () => {
        setApplyingSimulation(true);
        let field = 'sale_price';
        if (view.size === 'full') field = view.location === 'pvp' ? 'sale_price' : 'sales_price_pavello';
        else field = view.location === 'pvp' ? 'sale_price_half' : 'price_pavello_half';
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
            // Sanitización del nombre
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

    // --- CORRECCIÓN AQUÍ: Acepta la unidad como parámetro ---
    const handleAddIngredient = async (ingredientId: string, unit: string) => {
        await supabase.from('recipe_ingredients').insert({
            recipe_id: recipeId,
            ingredient_id: ingredientId,
            quantity_gross: 1,
            quantity_half: 0.5,
            unit: unit || 'kg' // Usamos la unidad real, fallback a kg
        });
        fetchRecipe();
        setShowIngredientModal(false);
    };

    const handleDeleteIngredient = async (id: string) => {
        if (!confirm('¿Eliminar?')) return;
        await supabase.from('recipe_ingredients').delete().eq('id', id);
        fetchRecipe();
    };

    const handleUnitChange = async (id: string, unit: string) => {
        await supabase.from('recipe_ingredients').update({ unit }).eq('id', id);
        fetchRecipe();
    };

    const updateTextDB = async (field: 'elaboration' | 'presentation', steps: string[]) => {
        await updateRecipeField(field, steps.join('\n'));
    };

    const handleAddElaborationStep = () => setElaborationSteps([...elaborationSteps, '']);
    const handleDeleteElaborationStep = (index: number) => {
        const n = elaborationSteps.filter((_, i) => i !== index); setElaborationSteps(n); updateTextDB('elaboration', n);
    };
    const handleUpdateElaborationStep = (index: number, value: string) => {
        const n = [...elaborationSteps]; n[index] = value; setElaborationSteps(n);
    };
    const handleManualSaveElaboration = async () => {
        const success = await updateTextDB('elaboration', elaborationSteps);
        setIsEditingElaboration(false); toast.success('Guardado');
    };

    const handleAddPresentationStep = () => setPresentationSteps([...presentationSteps, '']);
    const handleDeletePresentationStep = (index: number) => {
        const n = presentationSteps.filter((_, i) => i !== index); setPresentationSteps(n); updateTextDB('presentation', n);
    };
    const handleUpdatePresentationStep = (index: number, value: string) => {
        const n = [...presentationSteps]; n[index] = value; setPresentationSteps(n);
    };
    const handleManualSavePresentation = async () => {
        const success = await updateTextDB('presentation', presentationSteps);
        setIsEditingPresentation(false); toast.success('Guardado');
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

    // --- COMPONENTES AUXILIARES ---

    const QuantityInput = ({ initialValue, onSave }: { initialValue: number; onSave: (val: number) => void }) => {
        const [localValue, setLocalValue] = useState<string>(initialValue?.toString() || '');
        useEffect(() => { setLocalValue(initialValue?.toString() || ''); }, [initialValue]);
        const handleCommit = () => {
            const parsed = parseFloat(localValue.replace(',', '.'));
            if (!isNaN(parsed) && parsed >= 0) onSave(parsed);
            else setLocalValue(initialValue.toString());
        };
        return <input type="text" inputMode="decimal" value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={handleCommit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="w-14 px-1 py-0.5 border rounded text-center text-xs" />;
    };

    const EditablePrice = ({ value, onChange, onBlur, className, ...props }: any) => {
        const [localValue, setLocalValue] = useState(value !== undefined ? value.toFixed(2) : "0.00");
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

    if (loading) return <div className="min-h-screen bg-[#5B8FB9] flex items-center justify-center text-white"><Loader2 className="animate-spin" /></div>;
    if (!recipe) return <div className="min-h-screen bg-[#5B8FB9] flex items-center justify-center text-white">No encontrada</div>;

    return (
        <div className="min-h-screen bg-[#5ea2c6] p-2 md:p-3 overflow-hidden flex flex-col">
            <Toaster position="top-right" />

            <div className="max-w-6xl mx-auto space-y-2 w-full flex-1 flex flex-col">


                {/* Image & Metadata */}
                <div className="flex items-center justify-center gap-4 shrink-0">
                    <button onClick={handlePreviousRecipe} disabled={currentRecipeIndex <= 0} className="w-8 h-8 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition disabled:opacity-30"><ChevronLeft className="w-5 h-5 text-gray-700" /></button>

                    <div className="bg-white rounded-2xl p-1 shadow-md w-fit">
                        <div className="relative group w-32 h-20 bg-white rounded-xl flex items-center justify-center overflow-hidden border border-gray-100">
                            {recipe.photo_url ? (
                                <img src={recipe.photo_url} alt={recipe.name} className="w-full h-full object-contain" />
                            ) : (
                                <Camera className="w-6 h-6 text-gray-300" />
                            )}
                            <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition cursor-pointer text-white"><Camera className="w-5 h-5" /><input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" disabled={uploadingPhoto} /></label>
                            {uploadingPhoto && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>}
                        </div>
                    </div>

                    <button onClick={handleNextRecipe} disabled={currentRecipeIndex >= allRecipes.length - 1} className="w-8 h-8 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition disabled:opacity-30"><ChevronRight className="w-5 h-5 text-gray-700" /></button>
                </div>

                {/* Datos */}
                <div className="flex justify-center items-center gap-4 shrink-0">
                    <div className="bg-white rounded-full shadow-sm px-4 py-1 flex items-center gap-4 text-xs">
                        <button onClick={() => setShowCategoryModal(true)} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium hover:bg-blue-200 transition-colors uppercase">{recipe.category}</button>
                        <div className="flex items-center gap-1.5 text-gray-600"><Users className="w-3.5 h-3.5" /><span>{recipe.servings || 1} rac</span></div>
                    </div>
                    <button onClick={handleDelete} className="px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-semibold text-xs flex items-center gap-2">
                        <Trash2 size={14} /> Eliminar
                    </button>
                </div>

                {/* GRID 2x2 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 flex-1 min-h-0">

                    {/* CARD 1: Pricing */}
                    <div className="bg-white rounded-xl shadow-md p-3 h-full flex flex-col justify-between">
                        <div>
                            <h2 className="text-xs font-bold text-gray-800 mb-2">Precios de Venta</h2>
                            <div className="flex gap-2 justify-center mb-2">
                                <button onClick={() => setView(v => ({ ...v, location: 'pvp' }))} className={`px-3 py-1 rounded text-[10px] font-bold transition ${view.location === 'pvp' ? themeColors.toggle : themeColors.toggleInactive}`}>PVP</button>
                                <button onClick={() => setView(v => ({ ...v, location: 'pavello' }))} className={`px-3 py-1 rounded text-[10px] font-bold transition ${view.location === 'pavello' ? themeColors.toggle : themeColors.toggleInactive}`}>PAV</button>
                                <div className="w-px bg-gray-300 mx-1"></div>
                                <button onClick={() => setView(v => ({ ...v, size: 'full' }))} className={`px-3 py-1 rounded text-[10px] font-bold transition ${view.size === 'full' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>1/1</button>
                                <button onClick={() => setView(v => ({ ...v, size: 'half' }))} className={`px-3 py-1 rounded text-[10px] font-bold transition ${view.size === 'half' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}>1/2</button>
                            </div>
                        </div>

                        <div className="flex items-center justify-center gap-1 my-2">
                            <span className="text-lg font-bold text-gray-800">€</span>
                            <EditablePrice
                                value={currentPrice || 0}
                                onChange={(val: number) => setRecipe({ ...recipe, [view.location === 'pvp' ? (view.size === 'full' ? 'sale_price' : 'sale_price_half') : (view.size === 'full' ? 'sales_price_pavello' : 'price_pavello_half')]: val })}
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

                    {/* CARD 2: Ingredients */}
                    <div className="bg-white rounded-xl shadow-md p-3 h-full flex flex-col min-h-0">
                        <div className="flex items-center justify-between mb-2 shrink-0">
                            <h2 className="text-xs font-bold text-blue-600">Ingredientes <span className="text-gray-400 font-normal">({ingredients.length})</span></h2>
                            <div className="flex gap-1">
                                <button onClick={() => setShowIngredientModal(true)} className="px-2 py-0.5 bg-green-500 text-white rounded text-[10px] font-bold hover:bg-green-600">+ Añadir</button>
                                <button onClick={() => setIsModalOpen(true)} className="px-2 py-0.5 bg-purple-500 text-white rounded text-[10px] font-bold hover:bg-purple-600">+ Nuevo</button>
                            </div>
                        </div>
                        <div className="overflow-y-auto flex-1 custom-scrollbar">
                            <table className="w-full text-[10px]">
                                <thead className="sticky top-0 bg-white text-gray-500 font-bold uppercase border-b">
                                    <tr><th className="text-left py-2">Ingrediente</th><th className="text-center">Cant</th><th className="text-center">Ud</th><th className="text-right">Coste</th><th className="w-5"></th></tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {ingredients.map((ing) => {
                                        const cost = calculateIngredientCost(ing);
                                        const qty = getIngredientQuantity(ing);
                                        return (
                                            <tr key={ing.id} className="hover:bg-gray-50">
                                                <td className="py-2 text-gray-800 font-medium truncate max-w-[90px]">{ing.ingredients?.name}</td>
                                                <td className="text-center py-2"><QuantityInput initialValue={qty} onSave={(val) => handleQuantityChange(ing.id, val)} /></td>
                                                <td className="text-center text-gray-400 py-2">{ing.unit}</td>
                                                <td className="text-right font-bold text-gray-700 py-2">{cost.toFixed(2)}€</td>
                                                <td className="text-right py-2"><button onClick={() => handleDeleteIngredient(ing.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={12} /></button></td>
                                            </tr>
                                        );
                                    })}
                                    <tr className="bg-green-50 font-bold text-xs"><td className="py-2 pl-2" colSpan={3}>TOTAL</td><td className="py-2 text-right text-green-700">{totalCost.toFixed(2)}€</td><td></td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* CARD 3: Simulator */}
                    <div className="bg-white rounded-xl shadow-md overflow-hidden border-2 border-purple-100 p-3 h-full flex flex-col justify-between">
                        <div className="flex items-center gap-2 border-b pb-2 mb-2">
                            <Beaker className="w-4 h-4 text-purple-600" />
                            <h2 className="text-xs font-bold text-purple-900">Simulador</h2>
                        </div>

                        <div className="flex-1 flex flex-col justify-center gap-4">
                            <div className="flex items-center justify-between px-4">
                                <span className="text-sm font-bold text-purple-400">Precio</span>
                                <span className="text-3xl font-black text-purple-600">{(simulatedPrice || 0).toFixed(2)}€</span>
                            </div>

                            <input
                                type="range"
                                min={Math.floor((currentPrice * 0.5) * 10) / 10}
                                max={Math.ceil((currentPrice * 2) * 10) / 10 || 20}
                                step={0.10}
                                value={simulatedPrice}
                                onChange={(e) => setSimulatedPrice(Math.round(parseFloat(e.target.value) * 10) / 10)}
                                className="w-full h-1.5 bg-purple-100 rounded-lg appearance-none cursor-pointer accent-purple-600"
                            />

                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div><div className="text-xs text-gray-400 font-bold uppercase">FC</div><div className={`text-lg font-black ${simulatedHealthIndicator.color}`}>{(simulatedFoodCost || 0).toFixed(0)}%</div></div>
                                <div><div className="text-xs text-gray-400 font-bold uppercase">Base</div><div className="text-lg font-black text-purple-800">{(simulatedBasePrice || 0).toFixed(2)}</div></div>
                                <div><div className="text-xs text-gray-400 font-bold uppercase">Margen</div><div className="text-lg font-black text-purple-800">{(simulatedMargin || 0).toFixed(2)}€</div></div>
                            </div>
                        </div>

                        <button onClick={applySimulatedPrice} disabled={applyingSimulation || simulatedPrice === currentPrice} className="w-full py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-bold text-xs mt-2 uppercase tracking-wide disabled:opacity-50">APLICAR CAMBIOS</button>
                    </div>

                    {/* CARD 4: Textos */}
                    <div className="bg-white rounded-xl shadow-md overflow-hidden flex flex-col h-full min-h-0">
                        {/* Elaboración */}
                        <div className="flex-1 p-3 border-b flex flex-col min-h-0 overflow-hidden">
                            <div className="flex justify-between items-center mb-1 shrink-0">
                                <h2 className="text-xs font-bold text-blue-600">Elaboración</h2>
                                <button onClick={() => setIsEditingElaboration(!isEditingElaboration)} className="text-[10px] text-blue-500 hover:bg-blue-50 px-2 py-0.5 rounded"><Edit2 size={12} /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {isEditingElaboration ? (
                                    <div className="space-y-1">{elaborationSteps.map((s, i) => (<div key={i} className="flex gap-1"><input value={s} onChange={e => { const n = [...elaborationSteps]; n[i] = e.target.value; setElaborationSteps(n) }} className="flex-1 border rounded px-1 text-[10px]" /><X size={12} onClick={() => setElaborationSteps(elaborationSteps.filter((_, x) => x !== i))} /></div>))}<button onClick={() => setElaborationSteps([...elaborationSteps, ''])} className="text-[10px] text-blue-500 w-full text-left">+ Paso</button><button onClick={() => { updateTextDB('elaboration', elaborationSteps); setIsEditingElaboration(false) }} className="block w-full bg-green-500 text-white text-[10px] rounded mt-1">Guardar</button></div>
                                ) : (
                                    <ul className="list-disc list-inside space-y-0.5">{elaborationSteps.map((s, i) => <li key={i} className="text-gray-600 text-[10px] leading-tight">{s}</li>)}</ul>
                                )}
                            </div>
                        </div>
                        {/* Presentación */}
                        <div className="flex-1 p-3 flex flex-col min-h-0 overflow-hidden">
                            <div className="flex justify-between items-center mb-1 shrink-0">
                                <h2 className="text-xs font-bold text-green-600">Presentación</h2>
                                <button onClick={() => setIsEditingPresentation(!isEditingPresentation)} className="text-[10px] text-green-500 hover:bg-green-50 px-2 py-0.5 rounded"><Edit2 size={12} /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {isEditingPresentation ? (
                                    <div className="space-y-1">{presentationSteps.map((s, i) => (<div key={i} className="flex gap-1"><input value={s} onChange={e => { const n = [...presentationSteps]; n[i] = e.target.value; setPresentationSteps(n) }} className="flex-1 border rounded px-1 text-[10px]" /><X size={12} onClick={() => setPresentationSteps(presentationSteps.filter((_, x) => x !== i))} /></div>))}<button onClick={() => setPresentationSteps([...presentationSteps, ''])} className="text-[10px] text-green-500 w-full text-left">+ Paso</button><button onClick={() => { updateTextDB('presentation', presentationSteps); setIsEditingPresentation(false) }} className="block w-full bg-green-500 text-white text-[10px] rounded mt-1">Guardar</button></div>
                                ) : (
                                    <ul className="list-disc list-inside space-y-0.5">{presentationSteps.map((s, i) => <li key={i} className="text-gray-600 text-[10px] leading-tight">{s}</li>)}</ul>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* MODALES */}
                {showIngredientModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowIngredientModal(false)}>
                        <div className="bg-white rounded-xl shadow-2xl p-4 max-w-sm w-full max-h-[60vh] flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-center mb-2"><h3 className="font-bold text-sm">Añadir</h3><button onClick={() => setShowIngredientModal(false)}><X size={16} /></button></div>
                            <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-2 border rounded text-xs mb-2" autoFocus />
                            {/* --- CORRECCIÓN AQUÍ: Pasa la unidad real del ingrediente al hacer clic --- */}
                            <div className="flex-1 overflow-y-auto space-y-1">{filteredIngredients.map(ing => (<button key={ing.id} onClick={() => handleAddIngredient(ing.id, ing.purchase_unit)} className="w-full text-left p-2 hover:bg-gray-50 flex justify-between rounded text-xs"><span className="font-bold">{ing.name}</span><span>{ing.current_price}€</span></button>))}</div>
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
        </div>
    );
}