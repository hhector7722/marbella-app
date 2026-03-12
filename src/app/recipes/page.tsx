'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import Link from 'next/link';
import { ChefHat, Search, Plus, Trash2, X, ChevronDown, Users, BookOpen, UtensilsCrossed, Beaker, Camera, Edit2 } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import CreateModal from '@/components/CreateRecipeModal';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn } from '@/lib/utils';
import { recipeLineCost } from '@/lib/recipe-cost';

interface Recipe {
    id: string;
    name: string;
    category: string;
    sale_price: number;
    photo_url: string | null;
    servings?: number;
    recipe_ingredients?: {
        quantity_gross: number;
        unit: string | null;
        ingredients: { current_price: number; purchase_unit?: string } | { current_price: number; purchase_unit?: string }[] | null;
    }[];
}

function RecipesContent() {
    const supabase = createClient();
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [showCategoryPopup, setShowCategoryPopup] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newRecipe, setNewRecipe] = useState<any>({ name: '', category: 'Tapas', sale_price: 0, ingredients: [] });
    const [isCreating, setIsCreating] = useState(false);
    const [allIngredients, setAllIngredients] = useState<any[]>([]);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
    const [fullRecipeData, setFullRecipeData] = useState<any>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const router = useRouter();

    const searchParams = useSearchParams();
    const isStaffView = searchParams.get('view') === 'staff';

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

    const isRestricted = isStaffView || (userRole !== 'manager' && userRole !== 'supervisor' && userRole !== null);

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
            const { data, error } = await supabase.from('recipes').select(`id, name, category, sale_price, photo_url, servings, recipe_ingredients (quantity_gross, unit, ingredients (current_price, purchase_unit))`).order('name');
            if (error) throw error;
            setRecipes(data || []);
        } catch (error) { console.error('Error fetching recipes:', error); } finally { setLoading(false); }
    }

    async function fetchIngredients() {
        const { data } = await supabase.from('ingredients').select('*').order('name');
        if (data) setAllIngredients(data);
    }

    async function handleCreateRecipe() {
        if (!newRecipe.name || !newRecipe.category) { toast.error('Nombre y categoría son obligatorios'); return; }
        try {
            setIsCreating(true);
            const { data: recipe, error: recipeError } = await supabase.from('recipes').insert({ name: newRecipe.name, category: newRecipe.category, sale_price: newRecipe.sale_price || null, servings: newRecipe.servings || 1 }).select().single();
            if (recipeError) throw recipeError;
            if (newRecipe.ingredients && newRecipe.ingredients.length > 0) {
                const ingredientsToInsert = newRecipe.ingredients.map((ing: any) => ({ recipe_id: recipe.id, ingredient_id: ing.ingredient_id, quantity_gross: ing.quantity || 0, unit: ing.unit || 'kg' }));
                await supabase.from('recipe_ingredients').insert(ingredientsToInsert);
            }
            toast.success('Receta creada');
            await fetchRecipes(); setShowCreateModal(false); setNewRecipe({ ingredients: [] });
        } catch (error: any) { toast.error('Error: ' + error.message); } finally { setIsCreating(false); }
    }

    const getRecipeHealthColor = (recipe: Recipe) => {
        if (!recipe.recipe_ingredients || !recipe.sale_price) return 'text-gray-400';
        const totalCost = recipe.recipe_ingredients.reduce((sum, item) => {
            const ingredient = Array.isArray(item.ingredients) ? item.ingredients[0] : item.ingredients;
            const price = ingredient?.current_price ?? 0;
            const purchaseUnit = ingredient?.purchase_unit ?? 'kg';
            const recipeUnit = item.unit ?? 'kg';
            return sum + recipeLineCost(item.quantity_gross, recipeUnit, purchaseUnit, price);
        }, 0);
        const basePrice = recipe.sale_price / 1.10;
        const foodCost = basePrice > 0 ? (totalCost / basePrice) * 100 : 0;
        if (foodCost < 30) return 'text-green-600';
        if (foodCost < 35) return 'text-amber-500';
        return 'text-red-600';
    };

    const uniqueDbCategories = Array.from(new Set(recipes.map(r => r.category).filter(Boolean))) as string[];

    const filteredRecipes = recipes.filter(recipe => {
        const matchesSearch = recipe.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = !selectedCategory || recipe.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="p-4 md:p-6 w-full bg-[#5B8FB9] min-h-screen pb-24">
            <Toaster position="top-right" />
            {/* CONTENEDOR GRANDE: cabecera petróleo + fondo blanco roto */}
            <div className="max-w-7xl mx-auto bg-[#8BA4AD] rounded-[20px] shadow-xl overflow-hidden">
                <div className="bg-[#36606F] px-4 md:px-6 py-4 md:py-5">
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                        <div className="relative w-full sm:max-w-xs">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70" />
                            <input
                                type="text"
                                placeholder="Buscar receta..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-white/95 rounded-2xl shadow-sm outline-none text-sm font-medium text-gray-700 focus:ring-2 focus:ring-white/30"
                            />
                        </div>
                        <div className="flex gap-2 items-center relative flex-1 justify-between w-full">
                            <div className="flex gap-2 items-center">
                                {!selectedCategory ? (
                                    <div className="relative">
                                        <button onClick={() => setShowCategoryPopup(!showCategoryPopup)} className="px-5 py-2.5 bg-white/90 hover:bg-white rounded-2xl font-black text-[10px] text-zinc-800 uppercase tracking-widest shadow-sm transition-all flex items-center gap-2 border border-white/50">Categoría <ChevronDown size={14} className="text-zinc-400" /></button>
                                        {showCategoryPopup && (
                                            <>
                                                <div className="fixed inset-0 z-30" onClick={() => setShowCategoryPopup(false)}></div>
                                                <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-40 animate-in fade-in slide-in-from-top-2 duration-200">
                                                    <div className="px-4 py-2 border-b border-gray-50 mb-1"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Seleccionar</span></div>
                                                    <button onClick={() => { setSelectedCategory(null); setShowCategoryPopup(false); }} className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-zinc-50 transition-colors uppercase tracking-wider">Todas</button>
                                                    {uniqueDbCategories.map(cat => (
                                                        <button key={cat} onClick={() => { setSelectedCategory(cat); setShowCategoryPopup(false); }} className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-zinc-50 transition-colors uppercase tracking-wider">{cat}</button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1 bg-white rounded-2xl pl-4 pr-1.5 py-1.5 shadow-md border border-white">
                                        <span className="text-zinc-800 font-black text-[10px] uppercase tracking-widest">{selectedCategory}</span>
                                        <button onClick={() => setSelectedCategory(null)} className="p-1.5 hover:bg-zinc-100 rounded-2xl transition-colors"><X size={14} className="text-rose-500" strokeWidth={4} /></button>
                                    </div>
                                )}
                            </div>
                            {!isRestricted && (
                                <button onClick={() => setShowCreateModal(true)} className="bg-[#5E35B1] text-white w-12 h-12 rounded-2xl shadow-lg hover:bg-[#4d2c91] transition-all flex items-center justify-center hover:scale-105 active:scale-95 shrink-0"><Plus className="w-6 h-6" /></button>
                            )}
                        </div>
                    </div>
                </div>
                {!loading && (
                    <div className="bg-[#8BA4AD] p-4 md:p-6">
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-6">
                            {filteredRecipes.map((recipe) => (
                                <div key={recipe.id} className="group relative overflow-hidden">
                                    <div
                                        onClick={() => {
                                            if (isStaffView) {
                                                setSelectedRecipeId(recipe.id);
                                            } else {
                                                router.push(`/recipes/${recipe.id}`);
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

            {/* MODAL DE DETALLE (PARA STAFF) */}
            {selectedRecipeId && (
                <div
                    className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={() => setSelectedRecipeId(null)}
                >
                    <div
                        className="bg-[#fafafa] w-full max-w-4xl max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header del Modal */}
                        <div className="bg-[#36606F] px-8 py-5 flex justify-between items-center shrink-0 border-b border-white/10">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 bg-white rounded-2xl shadow-inner flex items-center justify-center overflow-hidden shrink-0 p-1">
                                    {fullRecipeData?.photo_url ? (
                                        <img src={fullRecipeData.photo_url} alt="" className="w-full h-full object-contain" />
                                    ) : (
                                        <ChefHat className="w-8 h-8 text-zinc-200" />
                                    )}
                                </div>
                                <div className="flex flex-col">
                                    <h3 className="text-white text-lg font-black uppercase tracking-widest leading-tight whitespace-nowrap overflow-hidden text-ellipsis max-w-[250px] md:max-w-[400px]">
                                        {fullRecipeData?.name || 'Cargando...'}
                                    </h3>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">{fullRecipeData?.category}</span>
                                        <div className="flex items-center gap-1.5 text-white/50 text-[10px] font-bold">
                                            <Users className="w-3 h-3" />
                                            <span>{fullRecipeData?.servings || 1} raciones</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedRecipeId(null)}
                                className="h-12 w-12 flex items-center justify-center bg-white/10 rounded-full hover:bg-white/20 text-white transition-all active:scale-90"
                            >
                                <X size={20} strokeWidth={3} />
                            </button>
                        </div>

                        {/* Contenido Scrollable */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
                            {loadingDetails ? (
                                <div className="h-64 flex flex-col items-center justify-center text-[#36606F]/60">
                                    <LoadingSpinner size="lg" className="text-[#36606F] mb-4" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">Cargando receta...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col h-fit">
                                        <div className="bg-[#36606F] px-5 py-3 flex items-center justify-between shrink-0">
                                            <div className="flex items-center gap-2">
                                                <UtensilsCrossed size={14} className="text-white/70" />
                                                <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Ingredientes</h4>
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-y-auto">
                                            <table className="w-full text-left">
                                                <tbody className="divide-y divide-zinc-50">
                                                    {fullRecipeData?.recipe_ingredients?.map((ing: any) => (
                                                        <tr key={ing.id} className="hover:bg-zinc-50/50 transition-colors">
                                                            <td className="px-4 py-3 text-xs font-bold text-zinc-800">{ing.ingredients?.name}</td>
                                                            <td className="px-4 py-3 text-xs font-black text-zinc-600 text-right">{ing.quantity_gross || 0}</td>
                                                            <td className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{ing.unit}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Columna Derecha: Elaboración y Presentación */}
                                    <div className="space-y-4">
                                        <div className="bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col h-fit">
                                            <div className="bg-[#36606F] px-5 py-3 flex items-center gap-2 shrink-0">
                                                <BookOpen size={14} className="text-white/70" />
                                                <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Elaboración</h4>
                                            </div>
                                            <div className="p-5 overflow-y-auto max-h-[400px]">
                                                {fullRecipeData?.elaboration ? (
                                                    <ul className="space-y-4">
                                                        {fullRecipeData.elaboration.split('\n').filter(Boolean).map((step: string, i: number) => (
                                                            <li key={i} className="flex gap-4 group">
                                                                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black text-[10px] shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-all">
                                                                    {i + 1}
                                                                </div>
                                                                <p className="text-[11px] leading-relaxed text-zinc-600 font-medium">
                                                                    {step}
                                                                </p>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <div className="h-32 flex flex-col items-center justify-center text-zinc-300 italic">
                                                        <p className="text-[10px] font-bold uppercase tracking-widest">Sin pasos registrados</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {fullRecipeData?.presentation && (
                                            <div className="bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col h-fit">
                                                <div className="bg-[#36606F] px-5 py-3 flex items-center gap-2 shrink-0">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                                    <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Presentación</h4>
                                                </div>
                                                <div className="p-5">
                                                    <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100/50">
                                                        <ul className="space-y-3">
                                                            {fullRecipeData.presentation.split('\n').filter(Boolean).map((step: string, i: number) => (
                                                                <li key={i} className="flex gap-3 text-emerald-800/90 text-[11px] leading-relaxed font-medium">
                                                                    <X className="rotate-45 w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" strokeWidth={4} />
                                                                    <span>{step}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            <CreateModal showCreateModal={showCreateModal} setShowCreateModal={setShowCreateModal} newRecipe={newRecipe} setNewRecipe={setNewRecipe} isCreating={isCreating} categories={uniqueDbCategories} allIngredients={allIngredients} handleCreateRecipe={handleCreateRecipe} addIngredientToRecipe={() => setNewRecipe({ ...newRecipe, ingredients: [...newRecipe.ingredients, { ingredient_id: '', quantity: 0, unit: 'kg' }] })} removeIngredientFromRecipe={(idx: number) => { const updated = [...newRecipe.ingredients]; updated.splice(idx, 1); setNewRecipe({ ...newRecipe, ingredients: updated }); }} updateRecipeIngredient={(idx: number, field: string, val: any) => { const updated = [...newRecipe.ingredients]; updated[idx] = { ...updated[idx], [field]: val }; setNewRecipe({ ...newRecipe, ingredients: updated }); }} />
        </div>
    );
}

export default function RecipesPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#5B8FB9]"></div>
        }>
            <RecipesContent />
        </Suspense>
    );
}