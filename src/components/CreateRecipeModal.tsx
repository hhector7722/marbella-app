"use client";

import { X, Plus, Trash2, Save } from 'lucide-react';

interface CreateModalProps {
    showCreateModal: boolean;
    setShowCreateModal: (show: boolean) => void;
    newRecipe: any;
    setNewRecipe: (val: any) => void;
    isCreating: boolean;
    categories: string[];
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
    categories,
    allIngredients,
    handleCreateRecipe,
    addIngredientToRecipe,
    removeIngredientFromRecipe,
    updateRecipeIngredient
}: CreateModalProps) {

    if (!showCreateModal) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="bg-[#36606F] p-6 flex justify-between items-center text-white">
                    <h2 className="text-xl font-black uppercase tracking-wide">Nueva Receta</h2>
                    <button onClick={() => setShowCreateModal(false)} className="hover:bg-white/20 p-2 rounded-full transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6">
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
                                value={newRecipe.category || 'Tapas'}
                                onChange={e => setNewRecipe({ ...newRecipe, category: e.target.value })}
                                className="w-full border-b-2 border-gray-200 focus:border-[#36606F] outline-none py-2 font-medium bg-transparent"
                            >
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
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
                                            onChange={e => updateRecipeIngredient(idx, 'ingredient_id', e.target.value)}
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
                                            <option value="kg">kg</option>
                                            <option value="l">l</option>
                                            <option value="ud">ud</option>
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

                <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                    <button onClick={() => setShowCreateModal(false)} className="px-6 py-3 rounded-2xl text-xs font-bold text-gray-500 hover:bg-gray-200">CANCELAR</button>
                    <button onClick={handleCreateRecipe} disabled={isCreating} className="bg-[#36606F] text-white px-8 py-3 rounded-2xl text-xs font-black hover:bg-[#2d4f5c] disabled:opacity-50 flex items-center gap-2 shadow-lg">
                        {isCreating ? 'GUARDANDO...' : <><Save size={16} /> GUARDAR</>}
                    </button>
                </div>
            </div>
        </div>
    );
}