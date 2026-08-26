import { createClient } from '@/utils/supabase/server';
import { MapeoClient } from './MapeoClient';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';

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
        .select('articulo_id, recipe_id, factor_porcion')
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
    // Use a Map for O(1) lookups of articles and recipes
    const articleMap = new Map((allArticles || []).map(a => [a.id, a.nombre]));
    const recipeMap = new Map((allRecipes || []).map(r => [r.id, r.name]));

    const mappedArticleIds = new Set((existingMappings || []).map(m => m.articulo_id));

    const pendingArticles: TpvArticle[] = (allArticles || [])
        .filter((a: any) => !mappedArticleIds.has(a.id))
        .map((a: any) => ({
            id: a.id,
            nombre: a.nombre || 'Desconocido',
        }));

    const recipes: Recipe[] = allRecipes || [];

    // 5. Construct Completed Mappings DTO
    const completedMappings = (existingMappings || []).map(m => ({
        articulo_id: m.articulo_id,
        nombre_tpv: articleMap.get(m.articulo_id) || 'Desconocido',
        recipe_id: m.recipe_id,
        nombre_app: recipeMap.get(m.recipe_id) || 'Desconocido',
        factor_porcion: m.factor_porcion || 1.0,
    }));

    return (
        <DashboardDetailLayout
            title="Mapeo TPV"
            subtitle="Vincula los artículos del terminal con las recetas para el inventario y los escandallos."
            showBackButton={false}
            template="list"
            maxWidthClass="max-w-6xl"
        >
            <MapeoClient
                pendingArticles={pendingArticles}
                recipes={recipes}
                completedMappings={completedMappings}
            />
        </DashboardDetailLayout>
    );
}
