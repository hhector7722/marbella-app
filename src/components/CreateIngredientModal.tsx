'use client';

import { useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import { X, Save } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function CreateIngredientModal({ isOpen, onClose, onSuccess }: Props) {
    const supabase = createClient();
    const [name, setName] = useState('');
    const [price, setPrice] = useState<number | ''>('');
    const [category, setCategory] = useState('Alimentos');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!name) return toast.error("Nombre requerido");
        setLoading(true);
        const { error } = await supabase.from('ingredients').insert({
            name,
            current_price: typeof price === 'number' ? price : (parseFloat(price) || 0),
            purchase_unit: 'kg', // Standardize on purchase_unit
            unit_type: 'kg',      // Satisfy NOT NULL constraint
            category: category || 'Alimentos',
            waste_percentage: 0
        });
        setLoading(false);

        if (error) {
            toast.error("Error al crear: " + error.message);
        } else {
            toast.success("Ingrediente creado");
            onSuccess();
            onClose();
            setName('');
            setPrice('');
            setCategory('Alimentos');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-black text-gray-800">Nuevo Ingrediente</h3>
                    <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre</label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full border-2 border-gray-200 rounded-xl p-2 font-bold text-gray-800 focus:border-[#36606F] outline-none"
                            placeholder="Ej: Tomate Pera"
                        />
                    </div>
                    <div className="flex gap-2">
                        <div className="w-1/2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Precio (€/kg)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={price}
                                onChange={e => setPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                className="w-full border-2 border-gray-200 rounded-xl p-2 font-bold text-gray-800 focus:border-[#36606F] outline-none"
                            />
                        </div>
                        <div className="w-1/2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Categoría</label>
                            <select
                                value={category}
                                onChange={e => setCategory(e.target.value)}
                                className="w-full border-2 border-gray-200 rounded-xl p-2 font-bold text-gray-800 focus:border-[#36606F] outline-none bg-white"
                            >
                                <option value="Alimentos">Alimentos</option>
                                <option value="Packaging">Packaging</option>
                                <option value="Bebidas">Bebidas</option>
                            </select>
                        </div>
                    </div>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="w-full bg-[#36606F] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#2d4f5c] transition shadow-lg"
                    >
                        {loading ? 'Guardando...' : <><Save size={18} /> Guardar</>}
                    </button>
                </div>
            </div>
        </div>
    );
}