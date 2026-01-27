export type Tables<T extends keyof Database["public"]["Tables"]> =
    Database["public"]["Tables"][T]["Row"];

export interface Database {
    public: {
        Tables: {
            recipes: {
                Row: Recipe;
                Insert: Omit<Recipe, "id">;
                Update: Partial<Recipe>;
            };
            ingredients: {
                Row: Ingredient;
                Insert: Omit<Ingredient, "id">;
                Update: Partial<Ingredient>;
            };
            recipe_ingredients: {
                Row: RecipeIngredient;
                Insert: Omit<RecipeIngredient, "id">;
                Update: Partial<RecipeIngredient>;
            };
        };
    };
}

export interface Recipe {
    id: string; // uuid
    name: string;
    category: string;
    sale_price: number; // Precio Barra (Entera)
    sales_price_pavello: number; // Precio Pavelló (Entera)
    has_half_ration: boolean; // ¿Tiene media ración?
    sale_price_half: number; // Precio 1/2 Barra
    sale_price_half_pavello: number; // Precio 1/2 Pavelló
    target_food_cost_pct: number; // Objetivo de Food Cost %
    elaboration: string;
    presentation: string;
    photo_url: string | null;
    servings: number;
}

export interface Ingredient {
    id: string; // uuid
    name: string;
    current_price: number;
    unit_type: string;
    purchase_unit: string;
    allergens: string[]; // Array de textos
}

export interface RecipeIngredient {
    id: string; // uuid
    recipe_id: string; // uuid
    ingredient_id: string; // uuid
    quantity_gross: number;
    unit: string;
    ingredients?: Ingredient; // Relation to Ingredient
}
