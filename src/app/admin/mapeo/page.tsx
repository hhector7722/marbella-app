import { createClient } from '@/utils/supabase/server';
import { MapeoClient } from './MapeoClient';

// Local types to prevent build errors since they are not in global Types yet
export type TpvArticle = {
    id: number;
    nombre: string;
};

export type Recipe = {
    id: string;
    name: string;
};

export default async function AdminMapeoPage() {
    const supabase = await createClient();

    // 1. Fetch ALL TPV articles (bdp_articulos)
    const { data: allArticles, error: articlesErr } = await supabase
        .from('bdp_articulos')
        .select('id, nombre')
        .limit(5000);

    // 2. Fetch all current mappings to find which ones are already configured
    const { data: existingMappings, error: mappingsErr } = await supabase
        .from('map_tpv_receta')
        .select('articulo_id')
        .limit(5000);

    // 3. Fetch all application recipes
    const { data: allRecipes, error: recipesErr } = await supabase
        .from('recipes')
        .select('id, name')
        .order('name', { ascending: true });

    if (articlesErr) {
        console.error('Error fetching articles:', articlesErr);
    }
    if (mappingsErr) {
        console.error('Error fetching mappings:', mappingsErr);
    }
    if (recipesErr) {
        console.error('Error fetching recipes:', recipesErr);
    }

    // 4. Map and filter
    // Use a Set for O(1) lookups to determine which articles already have a recipe mapped
    const mappedArticleIds = new Set((existingMappings || []).map(m => m.articulo_id));

    const pendingArticles: TpvArticle[] = (allArticles || [])
        .filter((a: any) => !mappedArticleIds.has(a.id))
        .map((a: any) => ({
            id: a.id,
            nombre: a.nombre || 'Desconocido',
        }));

    const recipes: Recipe[] = allRecipes || [];

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
                    Mapeo de Artículos TPV
                </h1>
                <p className="text-zinc-500 text-sm">
                    Vincula los productos importados del TPV ("bdp_articulos") con las recetas del sistema para habilitar el control de inventario y escándallos.
                </p>
            </div>

            {pendingArticles.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-zinc-100 p-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-2xl">
                            ✓
                        </div>
                        <h3 className="text-lg font-semibold text-zinc-900">Mapeo Completado</h3>
                        <p className="text-zinc-500 max-w-sm">No hay artículos del TPV pendientes de vincular con recetas. Buen trabajo.</p>
                    </div>
                </div>
            ) : (
                <MapeoClient pendingArticles={pendingArticles} recipes={recipes} />
            )}
        </div>
    );
}
