"use client";

import { Recipe } from "@/types";
import { cn } from "@/lib/utils";
// Hemos quitado "next/image" porque usamos <img> nativo

interface RecipeCardProps {
    recipe: Recipe & { food_cost_pct?: number };
    onClick?: () => void;
    selected?: boolean;
    selectionMode?: boolean;
    onSelect?: (id: string, selected: boolean) => void;
}

export function RecipeCard({
    recipe,
    onClick,
    selected,
    selectionMode,
    onSelect,
}: RecipeCardProps) {
    // Use food_cost_pct if available, otherwise fallback to target_food_cost_pct
    const costPct = recipe.food_cost_pct ?? recipe.target_food_cost_pct;

    const getPriceColor = (cost: number) => {
        if (cost <= 30) return "text-green-600";
        if (cost <= 35) return "text-amber-500";
        return "text-red-600";
    };

    return (
        <div
            onClick={() => {
                if (selectionMode && onSelect) {
                    onSelect(recipe.id, !selected);
                } else if (onClick) {
                    onClick();
                }
            }}
            className={cn(
                "group cursor-pointer bg-white rounded-2xl p-2 shadow-md hover:shadow-xl transition-all duration-200 border border-transparent",
                selected && "ring-2 ring-[#5E35B1] border-transparent",
                "flex flex-col gap-2 w-full max-w-[160px]"
            )}
        >
            {/* Image Area */}
            <div className="relative h-24 w-full bg-white rounded-xl overflow-hidden shadow-inner flex items-center justify-center border border-gray-50">
                {recipe.photo_url ? (
                    /* USAMOS HTML NATIVO: Infalible */
                    <img
                        src={recipe.photo_url}
                        alt={recipe.name}
                        className="w-full h-full object-cover p-1 rounded-xl"
                    />
                ) : (
                    <div className="text-gray-200 text-xs">No image</div>
                )}

                {selectionMode && (
                    <div className={cn(
                        "absolute top-1 right-1 w-4 h-4 rounded-full border flex items-center justify-center transition-colors",
                        selected ? "bg-[#5E35B1] border-[#5E35B1]" : "bg-white/80 border-gray-300"
                    )}>
                        {selected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex flex-col gap-0.5 px-0.5">
                <h3 className="text-[10px] font-bold text-gray-800 truncate leading-tight">
                    {recipe.name}
                </h3>
                <div className="flex items-baseline justify-between gap-1">
                    <span className={cn(
                        "text-[10px] font-black leading-none",
                        getPriceColor(costPct)
                    )}>
                        {recipe.sale_price.toFixed(2)}€
                    </span>
                    <span className="text-[8px] text-gray-400 font-medium">
                        FC: {costPct.toFixed(1)}%
                    </span>
                </div>
            </div>
        </div>
    );
}