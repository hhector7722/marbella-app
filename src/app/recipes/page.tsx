'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import Link from 'next/link';
import { ChefHat, Search, Plus, Trash2, X, ChevronDown } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import CreateModal from '@/components/CreateRecipeModal';

interface Recipe {
    id: string;
    name: string;
    category: string;
    sale_price: number;
    photo_url: string | null;
    servings?: number;
    recipe_ingredients?: {
        quantity_gross: number;
        ingredients: { current_price: number } | { current_price: number }[] | null;
    }[];
}

export default function RecipesPage() {
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

    useEffect(() => { fetchRecipes(); fetchIngredients(); }, []);

    async function fetchRecipes() {
        try {
            setLoading(true);
            const { data, error } = await supabase.from('recipes').select(`id, name, category, sale_price, photo_url, servings, recipe_ingredients (quantity_gross, ingredients (current_price))`).order('name');
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
            const price = ingredient?.current_price || 0;
            return sum + (item.quantity_gross * price);
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
        // CAMBIO AQUÍ: Añadido bg-[#5B8FB9] y min-h-screen
        <div className="p-6 md:p-8 w-full bg-[#5B8FB9] min-h-screen">
            <Toaster position="top-right" />


            <div className="mb-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar receta..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white/95 rounded-2xl shadow-sm outline-none text-sm font-medium text-gray-700 focus:ring-2 focus:ring-[#5E35B1]"
                    />
                </div>

                <div className="flex gap-2 items-center relative flex-1 justify-between w-full">
                    <div className="flex gap-2 items-center">
                        {/* Botón de Categoría Refinado */}
                        {!selectedCategory ? (
                            <div className="relative">
                                <button
                                    onClick={() => setShowCategoryPopup(!showCategoryPopup)}
                                    className="px-5 py-2.5 bg-white/90 hover:bg-white rounded-2xl font-black text-[10px] text-zinc-800 uppercase tracking-widest shadow-sm transition-all flex items-center gap-2 border border-white/50"
                                >
                                    Categoría <ChevronDown size={14} className="text-zinc-400" />
                                </button>

                                {showCategoryPopup && (
                                    <>
                                        <div className="fixed inset-0 z-30" onClick={() => setShowCategoryPopup(false)}></div>
                                        <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-40 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <div className="px-4 py-2 border-b border-gray-50 mb-1">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Seleccionar</span>
                                            </div>
                                            <button
                                                onClick={() => { setSelectedCategory(null); setShowCategoryPopup(false); }}
                                                className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-zinc-50 transition-colors uppercase tracking-wider"
                                            >
                                                Todas
                                            </button>
                                            {uniqueDbCategories.map(cat => (
                                                <button
                                                    key={cat}
                                                    onClick={() => { setSelectedCategory(cat); setShowCategoryPopup(false); }}
                                                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-zinc-50 transition-colors uppercase tracking-wider"
                                                >
                                                    {cat}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 bg-white rounded-2xl pl-4 pr-1.5 py-1.5 shadow-md border border-white">
                                <span className="text-zinc-800 font-black text-[10px] uppercase tracking-widest">{selectedCategory}</span>
                                <button
                                    onClick={() => setSelectedCategory(null)}
                                    className="p-1.5 hover:bg-zinc-100 rounded-xl transition-colors"
                                >
                                    <X size={14} className="text-rose-500" strokeWidth={4} />
                                </button>
                            </div>
                        )}

                        {/* Botón Seleccionar Eliminado */}
                    </div>

                    {/* Botón "+" Justificado a la derecha */}
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="bg-[#5E35B1] text-white w-10 h-10 rounded-xl shadow-lg hover:bg-[#4d2c91] transition-all flex items-center justify-center hover:scale-105 shrink-0"
                    >
                        <Plus className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* GRID LIMPIO Y COMPACTO (Alineado con Ingredients) */}
            {!loading && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-4 pb-24">
                    {filteredRecipes.map((recipe) => (
                        <div key={recipe.id} className="group relative">
                            <Link href={`/recipes/${recipe.id}`} className="block h-full">
                                <div className={`bg-white p-1.5 rounded-xl shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 flex flex-col h-full border border-gray-100/50`}>
                                    {/* IMAGEN MÁS PEQUEÑA (Compacta) */}
                                    <div className="w-full h-20 bg-white rounded-lg mb-1.5 flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                                        {recipe.photo_url ? <img src={recipe.photo_url} alt="" className="h-full w-full object-contain" /> : <ChefHat className="w-5 h-5 text-gray-200" />}
                                    </div>
                                    {/* DATOS */}
                                    <div className="flex justify-between items-center px-0.5 gap-1 mt-auto">
                                        <h3 className="text-[10px] font-bold text-gray-700 truncate leading-tight" title={recipe.name}>{recipe.name}</h3>
                                        <span className={`text-[10px] font-black whitespace-nowrap ${getRecipeHealthColor(recipe)}`}>{recipe.sale_price?.toFixed(1)}€</span>
                                    </div>
                                </div>
                            </Link>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal Creación */}
            <CreateModal showCreateModal={showCreateModal} setShowCreateModal={setShowCreateModal} newRecipe={newRecipe} setNewRecipe={setNewRecipe} isCreating={isCreating} categories={uniqueDbCategories} allIngredients={allIngredients} handleCreateRecipe={handleCreateRecipe} addIngredientToRecipe={() => setNewRecipe({ ...newRecipe, ingredients: [...newRecipe.ingredients, { ingredient_id: '', quantity: 0, unit: 'kg' }] })} removeIngredientFromRecipe={(idx: number) => { const updated = [...newRecipe.ingredients]; updated.splice(idx, 1); setNewRecipe({ ...newRecipe, ingredients: updated }); }} updateRecipeIngredient={(idx: number, field: string, val: any) => { const updated = [...newRecipe.ingredients]; updated[idx] = { ...updated[idx], [field]: val }; setNewRecipe({ ...newRecipe, ingredients: updated }); }} />
        </div>
    );
}