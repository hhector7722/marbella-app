'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import Link from 'next/link';
import { ChefHat, Search, Plus, Trash2, X, ChevronDown, Users, BookOpen, UtensilsCrossed, Beaker, Camera, Edit2, PlayCircle } from 'lucide-react';
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
    const [uploadingElaborationVideo, setUploadingElaborationVideo] = useState(false);
    const elaborationVideoInputRef = useRef<HTMLInputElement | null>(null);
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

    const isRestricted = isStaffView || (userRole !== 'manager' && userRole !== 'supervisor' && userRole !== null);
    const canEditRecipeFromModal = userRole === 'manager' || userRole === 'supervisor';
    const canManageRecipeVideo = userRole === 'manager';

    async function handleElaborationVideoSelected(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        // permitir re-seleccionar el mismo archivo
        e.target.value = '';
        if (!file) return;
        if (!selectedRecipeId) return;
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
            const path = `${selectedRecipeId}/${fileName}`;

            const up = await supabase.storage.from('recipe_videos').upload(path, file, {
                upsert: true,
                contentType: file.type || undefined,
            });
            if (up.error) throw up.error;

            const { data: publicUrl } = supabase.storage.from('recipe_videos').getPublicUrl(path);
            const url = publicUrl?.publicUrl;
            if (!url) throw new Error('No se pudo obtener URL pública del vídeo.');

            const { error: updateErr } = await supabase
                .from('recipes')
                .update({ elaboration_video_url: url })
                .eq('id', selectedRecipeId);
            if (updateErr) throw updateErr;

            toast.success('Vídeo de elaboración guardado');
            await fetchRecipeDetails(selectedRecipeId);
        } catch (err: any) {
            console.error(err);
            toast.error(err?.message || 'Error subiendo vídeo');
        } finally {
            setUploadingElaborationVideo(false);
        }
    }

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
                        <div className="relative bg-[#36606F] px-8 py-5 flex justify-between items-center shrink-0 border-b border-white/10">
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
                            <div className="flex items-center gap-2 shrink-0">
                                {canEditRecipeFromModal && selectedRecipeId && (
                                    <button
                                        onClick={() => {
                                            setSelectedRecipeId(null);
                                            router.push(buildRecipesHref(selectedRecipeId));
                                        }}
                                        className="w-12 h-12 flex items-center justify-center text-white/70 hover:text-white transition active:scale-95"
                                        aria-label="Editar"
                                        title="Editar"
                                    >
                                        <Edit2 size={16} strokeWidth={3} />
                                    </button>
                                )}
                                <button
                                    onClick={() => setSelectedRecipeId(null)}
                                    className="h-12 w-12 flex items-center justify-center bg-white/10 rounded-full hover:bg-white/20 text-white transition-all active:scale-90"
                                    aria-label="Cerrar"
                                >
                                    <X size={20} strokeWidth={3} />
                                </button>
                            </div>
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
                                            <div className="bg-[#36606F] px-5 py-3 flex items-center justify-between shrink-0">
                                                <div className="flex items-center gap-2">
                                                    <BookOpen size={14} className="text-white/70" />
                                                    <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Elaboración</h4>
                                                </div>
                                                {canManageRecipeVideo && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => elaborationVideoInputRef.current?.click()}
                                                            disabled={uploadingElaborationVideo}
                                                            title="Añadir vídeo de elaboración"
                                                            aria-label="Añadir vídeo de elaboración"
                                                            className={cn(
                                                                "w-12 h-12 flex items-center justify-center transition text-white/80 hover:text-white active:scale-95",
                                                                uploadingElaborationVideo ? "opacity-50 pointer-events-none" : ""
                                                            )}
                                                        >
                                                            <PlayCircle className="w-5 h-5" />
                                                        </button>
                                                        <input
                                                            ref={elaborationVideoInputRef}
                                                            type="file"
                                                            accept="video/*"
                                                            className="hidden"
                                                            onChange={handleElaborationVideoSelected}
                                                        />
                                                    </>
                                                )}
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

                                                {fullRecipeData?.elaboration_video_url && (
                                                    <div className="mt-5">
                                                        <video
                                                            controls
                                                            preload="metadata"
                                                            src={fullRecipeData.elaboration_video_url}
                                                            className="w-full rounded-2xl bg-black"
                                                        />
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