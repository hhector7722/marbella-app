'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { toast, Toaster } from 'sonner';
import { Button } from '@/components/ui/button';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';

export default function BulkImportPage() {
    const supabase = createClient();
    const [jsonInput, setJsonInput] = useState('');
    const [logs, setLogs] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [dbIngredients, setDbIngredients] = useState<Map<string, string>>(new Map());

    // 1. Cargar mapa de ingredientes existentes al inicio para cruzar datos rápido
    useEffect(() => {
        async function loadIngredients() {
            const { data } = await supabase.from('ingredients').select('id, name');
            if (data) {
                // Crear mapa: "tomate frito" -> "uuid-123"
                const map = new Map(data.map(i => [i.name.toLowerCase().trim(), i.id]));
                setDbIngredients(map);
                addLog(`✅ Sistema listo. ${data.length} ingredientes cargados en memoria.`);
            }
        }
        loadIngredients();
    }, []);

    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    const handleImport = async () => {
        if (!jsonInput.trim()) return toast.error('Pega el JSON primero');
        setIsProcessing(true);
        setLogs([]);

        let recipesData;
        try {
            recipesData = JSON.parse(jsonInput);
            if (!Array.isArray(recipesData)) throw new Error('El JSON debe ser un array []');
        } catch (e) {
            setIsProcessing(false);
            return toast.error('JSON inválido. Revisa el formato.');
        }

        addLog(`🚀 Iniciando importación de ${recipesData.length} recetas...`);

        let successCount = 0;
        let errorCount = 0;

        for (const recipe of recipesData) {
            try {
                // A. Crear Receta
                const { data: newRecipe, error: recipeError } = await supabase
                    .from('recipes')
                    .insert({
                        name: recipe.name,
                        category: recipe.category || 'Principales',
                        sale_price: recipe.sale_price || 0,
                        servings: recipe.servings || 1,
                        // Opcionales si tu IA los genera:
                        // elaboration: recipe.elaboration, 
                        // presentation: recipe.presentation
                    })
                    .select()
                    .single();

                if (recipeError) throw new Error(`Error creando receta: ${recipeError.message}`);

                // B. Procesar Ingredientes
                if (recipe.ingredients && recipe.ingredients.length > 0) {
                    const ingredientsToInsert = [];
                    const missingIngredients = [];

                    for (const ing of recipe.ingredients) {
                        const normalizedName = ing.name.toLowerCase().trim();
                        const existingId = dbIngredients.get(normalizedName);

                        if (existingId) {
                            ingredientsToInsert.push({
                                recipe_id: newRecipe.id,
                                ingredient_id: existingId,
                                quantity_gross: ing.quantity || 0,
                                unit: ing.unit || 'kg'
                            });
                        } else {
                            missingIngredients.push(ing.name);
                        }
                    }

                    // Insertar relaciones
                    if (ingredientsToInsert.length > 0) {
                        const { error: ingError } = await supabase
                            .from('recipe_ingredients')
                            .insert(ingredientsToInsert);

                        if (ingError) throw new Error(`Error vinculando ingredientes: ${ingError.message}`);
                    }

                    if (missingIngredients.length > 0) {
                        addLog(`⚠️ Receta "${recipe.name}" creada, pero faltaban ingredientes en la DB: ${missingIngredients.join(', ')}`);
                    } else {
                        addLog(`✅ Receta "${recipe.name}" importada completa.`);
                    }
                } else {
                    addLog(`✅ Receta "${recipe.name}" creada (sin ingredientes).`);
                }

                successCount++;

            } catch (err: any) {
                console.error(err);
                addLog(`❌ FALLO en "${recipe.name}": ${err.message}`);
                errorCount++;
            }
        }

        setIsProcessing(false);
        toast.success(`Proceso finalizado. Éxitos: ${successCount}, Errores: ${errorCount}`);
    };

    return (
        <DashboardDetailLayout
            title="Importador JSON de recetas"
            subtitle="Pega un array JSON con esta estructura e impórtalo."
            showBackButton
            backHref="/recipes"
            template="form"
            maxWidthClass="max-w-4xl"
        >
            <Toaster position="top-right" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[600px]">
                    <div className="flex flex-col gap-4">
                        <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100 text-sm">
                            <span className="font-bold text-zinc-800">Estructura requerida (Array):</span>
                            <pre className="mt-2 text-xs overflow-x-auto bg-zinc-900 p-2 rounded text-green-300">
                                {`[
  {
    "name": "Bravas La Marbella",
    "category": "Tapas",
    "sale_price": 5.50,
    "servings": 1,
    "ingredients": [
      { "name": "Patata Monalisa", "quantity": 0.300, "unit": "kg" },
      { "name": "Salsa Brava", "quantity": 0.050, "unit": "kg" }
    ]
  },
  ...
]`}
                            </pre>
                        </div>
                        <textarea
                            value={jsonInput}
                            onChange={(e) => setJsonInput(e.target.value)}
                            placeholder="Pega aquí tu array de JSON..."
                            className="flex-1 w-full bg-white text-gray-900 p-4 rounded-xl font-mono text-xs outline-none focus:ring-2 focus:ring-ds-marca/25 border border-zinc-200 min-h-12"
                        />
                        <Button
                            type="button"
                            variant="primary"
                            instance="recipes-import-run"
                            layout="fill"
                            onClick={() => void handleImport()}
                            disabled={isProcessing}
                            loading={isProcessing}
                            loadingLabel="Procesando…"
                        >
                            Importar ahora
                        </Button>
                    </div>

                    <div className="bg-zinc-900 rounded-xl p-4 font-mono text-xs overflow-y-auto border border-zinc-200">
                        <h3 className="text-zinc-400 font-bold mb-2 border-b border-zinc-700 pb-2">Log de ejecución</h3>
                        {logs.length === 0 && <span className="text-zinc-600 italic">Esperando datos...</span>}
                        {logs.map((log, i) => (
                            <div key={i} className={`mb-1 ${log.includes('❌') ? 'text-red-400' : log.includes('⚠️') ? 'text-yellow-400' : 'text-green-400'}`}>
                                {log}
                            </div>
                        ))}
                    </div>
            </div>
        </DashboardDetailLayout>
    );
}