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
import { recipeLineCost } from '@/lib/recipe-cost';
import { ImageLightbox } from '@/components/ui/ImageLightbox';

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
    const [isPhotoLightboxOpen, setIsPhotoLightboxOpen] = useState(false);
    /** Lista para flechas anterior/siguiente (misma regla que `/recipes/[id]`: orden nombre, opcional filtro categoría URL). */
    const [staffNavRecipes, setStaffNavRecipes] = useState<Array<{ id: string }>>([]);
    const router = useRouter();

    const searchParams = useSearchParams();
    const isStaffView = searchParams.get('view') === 'staff';
    const categoryFromUrl = searchParams.get('cat');

    const buildRecipesHref = (id: string) => {
        const qs = new URLSearchParams(searchParams.toString());
        return qs.toString() ? `/recipes/${id}?${qs.toString()}` : `/recipes/${id}`;
    };

    useEffect(() => {
        // Mantener el filtro al navegar/back/refresh
        if (categoryFromUrl && categoryFromUrl !== selectedCategory) {
            setSelectedCategory(categoryFromUrl);
        }
        if (!categoryFromUrl && selectedCategory !== null) {
            setSelectedCategory(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categoryFromUrl]);

    const setCategoryAndUrl = (cat: string | null) => {
        setSelectedCategory(cat);
        const qs = new URLSearchParams(searchParams.toString());
        if (cat) qs.set('cat', cat);
        else qs.delete('cat');
        const next = qs.toString();
        router.replace(next ? `/recipes?${next}` : '/recipes');
    };

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
        let q = supabase.from('recipes').select('id').order('name');
        const cat = categoryFromUrl ?? selectedCategory;
        if (cat) q = q.eq('category', cat);
        void q.then(({ data, error }) => {
            if (!error && data) setStaffNavRecipes(data);
            else setStaffNavRecipes([]);
        });
    }, [isStaffView, selectedRecipeId, categoryFromUrl, selectedCategory]);

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
            <ImageLightbox
                open={isPhotoLightboxOpen}
                src={fullRecipeData?.photo_url}
                alt={fullRecipeData?.name}
                onClose={() => setIsPhotoLightboxOpen(false)}
            />
            <div className="max-w-7xl mx-auto">
                <div className="bg-[#36606F] rounded-2xl px-3 md:px-6 py-3 md:py-5">
                    <div className="flex flex-row gap-2 items-center">
                        <div className="relative flex-1 min-w-0">
                            <Search className="absolute left-2.5 md:left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 text-white/70" />
                            <input
                                type="text"
                                placeholder="Buscar..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-8 md:pl-10 pr-2 md:pr-4 py-2 md:py-2.5 bg-white/95 rounded-xl md:rounded-2xl shadow-sm outline-none text-xs md:text-sm font-medium text-gray-700 focus:ring-2 focus:ring-white/30"
                            />
                        </div>
                        <div className="flex gap-1.5 md:gap-2 items-center shrink-0">
                            {!selectedCategory ? (
                                <div className="relative">
                                    <button onClick={() => setShowCategoryPopup(!showCategoryPopup)} className="px-2.5 md:px-5 py-2 md:py-2.5 bg-white/90 hover:bg-white rounded-xl md:rounded-2xl font-black text-[9px] md:text-[10px] text-zinc-800 uppercase tracking-widest shadow-sm transition-all flex items-center gap-1 md:gap-2 border border-white/50"><span className="hidden sm:inline">Categoría</span><span className="sm:hidden">Cat.</span> <ChevronDown size={12} className="text-zinc-400 md:w-3.5 md:h-3.5" /></button>
                                    {showCategoryPopup && (
                                        <>
                                            <div className="fixed inset-0 z-30" onClick={() => setShowCategoryPopup(false)}></div>
                                            <div className="absolute top-full right-0 mt-2 w-40 md:w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-40 animate-in fade-in slide-in-from-top-2 duration-200">
                                                <div className="px-4 py-2 border-b border-gray-50 mb-1"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Seleccionar</span></div>
                                                <button onClick={() => { setCategoryAndUrl(null); setShowCategoryPopup(false); }} className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-zinc-50 transition-colors uppercase tracking-wider">Todas</button>
                                                {uniqueDbCategories.map(cat => (
                                                    <button key={cat} onClick={() => { setCategoryAndUrl(cat); setShowCategoryPopup(false); }} className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-zinc-50 transition-colors uppercase tracking-wider">{cat}</button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center gap-1 bg-white rounded-xl md:rounded-2xl pl-2.5 md:pl-4 pr-1 md:pr-1.5 py-1 md:py-1.5 shadow-md border border-white max-w-[100px] md:max-w-none">
                                    <span className="text-zinc-800 font-black text-[9px] md:text-[10px] uppercase tracking-widest truncate">{selectedCategory}</span>
                                    <button onClick={() => setCategoryAndUrl(null)} className="p-1 md:p-1.5 hover:bg-zinc-100 rounded-xl transition-colors shrink-0"><X size={12} className="text-rose-500 md:w-3.5 md:h-3.5" strokeWidth={4} /></button>
                                </div>
                            )}
                            {!isRestricted && (
                                <button onClick={() => setShowCreateModal(true)} className="bg-emerald-600 text-white w-9 h-9 md:w-12 md:h-12 rounded-xl md:rounded-2xl shadow-lg hover:bg-emerald-700 transition-all flex items-center justify-center hover:scale-105 active:scale-95 shrink-0"><Plus className="w-5 h-5 md:w-6 md:h-6" /></button>
                            )}
                        </div>
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
                        <div className="relative bg-[#36606F] px-4 md:px-6 py-2 flex flex-col items-center justify-center shrink-0">
                            <button
                                type="button"
                                onClick={() => setSelectedRecipeId(null)}
                                aria-label="Volver a la lista de recetas"
                                className={cn(
                                    'absolute left-2 top-2 md:left-3 md:top-2',
                                    'w-12 h-12 flex items-center justify-center shrink-0',
                                    'text-white/70 hover:text-white active:scale-95 transition',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#36606F]',
                                )}
                            >
                                <ArrowLeft className="w-6 h-6" />
                            </button>

                            {canEditRecipeFromModal && selectedRecipeId && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const id = selectedRecipeId;
                                        setSelectedRecipeId(null);
                                        router.push(buildRecipesHref(id));
                                    }}
                                    className={cn(
                                        'absolute right-2 top-2 md:right-3 md:top-2',
                                        'w-10 h-10 flex items-center justify-center transition text-white/60 hover:text-white active:scale-95',
                                    )}
                                    aria-label="Editar receta"
                                    title="Editar receta"
                                >
                                    <Edit2 className="w-5 h-5" strokeWidth={2.5} />
                                </button>
                            )}

                            <div className="w-full text-center px-10 md:px-14">
                                <div className="text-white font-black text-[13px] md:text-[15px] leading-tight truncate">
                                    {fullRecipeData?.name || (loadingDetails ? 'Cargando…' : '…')}
                                </div>
                            </div>

                            <div className="relative mt-1 flex items-center justify-center w-fit shrink-0">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (staffNavIndex > 0) setSelectedRecipeId(staffNavRecipes[staffNavIndex - 1].id);
                                    }}
                                    disabled={staffNavIndex <= 0}
                                    className="absolute -left-12 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center transition disabled:opacity-0 text-white/50 hover:text-white"
                                    aria-label="Receta anterior"
                                >
                                    <ChevronLeft className="w-8 h-8" />
                                </button>

                                <div className="bg-white rounded-xl p-0.5 shadow-sm">
                                    <div className="relative group w-24 h-14 bg-white rounded-lg flex items-center justify-center overflow-hidden border border-gray-100/50">
                                        {fullRecipeData?.photo_url ? (
                                            <button
                                                type="button"
                                                onClick={() => setIsPhotoLightboxOpen(true)}
                                                className={cn(
                                                    'absolute inset-0 w-full h-full cursor-zoom-in',
                                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#36606F]',
                                                )}
                                                aria-label="Ver foto ampliada"
                                            >
                                                <img src={fullRecipeData.photo_url} alt="" className="w-full h-full object-contain" />
                                            </button>
                                        ) : (
                                            <Camera className="w-5 h-5 text-gray-300" aria-hidden />
                                        )}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => {
                                        if (staffNavIndex >= 0 && staffNavIndex < staffNavRecipes.length - 1) {
                                            setSelectedRecipeId(staffNavRecipes[staffNavIndex + 1].id);
                                        }
                                    }}
                                    disabled={staffNavIndex < 0 || staffNavIndex >= staffNavRecipes.length - 1}
                                    className="absolute -right-12 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center transition disabled:opacity-0 text-white/50 hover:text-white"
                                    aria-label="Receta siguiente"
                                >
                                    <ChevronRight className="w-8 h-8" />
                                </button>
                            </div>

                            <div className="flex items-center justify-center gap-4 mt-2 text-white/90">
                                <span className="px-2 py-0.5 bg-white/20 rounded-full font-medium uppercase tracking-wider text-[9px]">
                                    {fullRecipeData?.category || ' '}
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