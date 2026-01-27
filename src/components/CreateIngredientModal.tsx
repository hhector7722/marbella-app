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
    const [price, setPrice] = useState(0);
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!name) return toast.error("Nombre requerido");
        setLoading(true);
        const { error } = await supabase.from('ingredients').insert({
            name,
            current_price: price,
            unit: 'kg' // Default
        });
        setLoading(false);

        if (error) {
            toast.error("Error al crear");
        } else {
            toast.success("Ingrediente creado");
            onSuccess();
            onClose();
            setName('');
            setPrice(0);
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
                            className="w-full border-2 border-gray-200 rounded-xl p-2 font-bold text-gray-800 focus:border-purple-500 outline-none"
                            placeholder="Ej: Tomate Pera"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Precio (€/kg)</label>
                        <input
                            type="number"
                            step="0.01"
                            value={price}
                            onChange={e => setPrice(parseFloat(e.target.value))}
                            className="w-full border-2 border-gray-200 rounded-xl p-2 font-bold text-gray-800 focus:border-purple-500 outline-none"
                        />
                    </div>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="w-full bg-purple-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-purple-700 transition"
                    >
                        {loading ? 'Guardando...' : <><Save size={18} /> Guardar</>}
                    </button>
                </div>
            </div>
        </div>
    );
}