"use client";

import { Plus, Trash2 } from 'lucide-react';
import { RECIPE_UNIT_OPTIONS, resolveIngredientRecipeUnit } from '@/lib/recipe-cost';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

interface CreateModalProps {
    showCreateModal: boolean;
    setShowCreateModal: (show: boolean) => void;
    newRecipe: any;
    setNewRecipe: (val: any) => void;
    isCreating: boolean;
    /** Opciones desde `categories` (menú): value = id UUID */
    menuCategoryOptions: { id: string; label: string }[];
    allIngredients: any[];
    handleCreateRecipe: () => void;
    addIngredientToRecipe: () => void;
    removeIngredientFromRecipe: (index: number) => void;
    updateRecipeIngredient: (index: number, field: string, value: any) => void;
}

export default function CreateModal({
    showCreateModal,
    setShowCreateModal,
    newRecipe,
    setNewRecipe,
    isCreating,
    menuCategoryOptions,
    allIngredients,
    handleCreateRecipe,
    addIngredientToRecipe,
    removeIngredientFromRecipe,
    updateRecipeIngredient
}: CreateModalProps) {
    return (
        <Modal
            open={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            variant="amplify"
            layer="base"
            instance="create-recipe"
            usageId="create-recipe"
            usageLabel="Nueva receta"
            title="Nueva Receta"
            headerTone="petroleum"
            scrollContent
            className="max-h-[90vh]"
            footer={
                <>
                    <Button
                        type="button"
                        variant="secondary"
                        instance="create-recipe-cancel"
                        onClick={() => setShowCreateModal(false)}
                        disabled={isCreating}
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        variant="primary"
                        instance="create-recipe-save"
                        onClick={handleCreateRecipe}
                        disabled={isCreating}
                        loading={isCreating}
                        loadingLabel="Guardando..."
                    >
                        Guardar receta
                    </Button>
                </>
            }
        >
            <div className="space-y-6 p-6">
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">Nombre Receta</label>
                        <input
                            type="text"
                            value={newRecipe.name || ''}
                            onChange={e => setNewRecipe({ ...newRecipe, name: e.target.value })}
                            className="w-full border-b-2 border-gray-200 focus:border-[#36606F] outline-none py-2 text-lg font-bold text-gray-800 bg-transparent"
                            placeholder="Ej: Patatas Bravas"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Categoría</label>
                        <select
                            value={newRecipe.menu_category_id || ''}
                            onChange={(e) => {
                                const id = e.target.value;
                                const opt = menuCategoryOptions.find((o) => o.id === id);
                                setNewRecipe({
                                    ...newRecipe,
                                    menu_category_id: id,
                                    category: opt?.label ?? newRecipe.category,
                                });
                            }}
                            className="w-full border-b-2 border-gray-200 focus:border-[#36606F] outline-none py-2 font-medium bg-transparent"
                        >
                            <option value="">Seleccionar categoría…</option>
                            {menuCategoryOptions.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Precio Venta (€)</label>
                        <input
                            type="number"
                            step="0.10"
                            value={newRecipe.sale_price || ''}
                            onChange={e => setNewRecipe({ ...newRecipe, sale_price: parseFloat(e.target.value) })}
                            className="w-full border-b-2 border-gray-200 focus:border-[#36606F] outline-none py-2 font-medium bg-transparent"
                        />
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-black text-gray-800 uppercase">Ingredientes</h3>
                        <button onClick={addIngredientToRecipe} className="text-[10px] font-bold bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg flex items-center gap-1">
                            <Plus size={14} /> AÑADIR
                        </button>
                    </div>

                    <div className="space-y-2">
                        {(!newRecipe.ingredients || newRecipe.ingredients.length === 0) && (
                            <p className="text-xs text-gray-400 italic text-center py-4 bg-gray-50 rounded-2xl">No hay ingredientes añadidos</p>
                        )}

                        {newRecipe.ingredients?.map((row: any, idx: number) => (
                            <div key={idx} className="flex gap-2 items-end bg-gray-50 p-2 rounded-2xl">
                                <div className="flex-1">
                                    <select
                                        value={row.ingredient_id}
                                        onChange={e => {
                                            const id = e.target.value;
                                            const catalog = allIngredients.find((ing: { id: string }) => ing.id === id);
                                            const unit = catalog
                                                ? resolveIngredientRecipeUnit(catalog.recipe_unit, catalog.purchase_unit || 'kg')
                                                : row.unit || 'kg';
                                            setNewRecipe({
                                                ...newRecipe,
                                                ingredients: (newRecipe.ingredients ?? []).map((r: typeof row, i: number) =>
                                                    i === idx ? { ...r, ingredient_id: id, unit } : r,
                                                ),
                                            });
                                        }}
                                        className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-medium focus:border-[#36606F] outline-none"
                                    >
                                        <option value="">Seleccionar...</option>
                                        {allIngredients.map(ing => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
                                    </select>
                                </div>
                                <div className="w-20">
                                    <input
                                        type="number"
                                        step="0.001"
                                        value={row.quantity || ''}
                                        onChange={e => updateRecipeIngredient(idx, 'quantity', parseFloat(e.target.value))}
                                        className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-medium text-center focus:border-[#36606F] outline-none"
                                        placeholder="Cant."
                                    />
                                </div>
                                <div className="w-20">
                                    <select
                                        value={row.unit}
                                        onChange={e => updateRecipeIngredient(idx, 'unit', e.target.value)}
                                        className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-medium focus:border-[#36606F] outline-none"
                                    >
                                        {RECIPE_UNIT_OPTIONS.map(o => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <button onClick={() => removeIngredientFromRecipe(idx)} className="mb-[3px] p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
