'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { submitPersonalConsumption, getConsumptionRecipes } from './actions';
import { toast } from 'sonner';
import { X, Search, Loader2, Package, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Subcadenas para el grid de acceso rápido (coincidencia en nombre de receta). */
const QUICK_DRINK_ITEMS = [
  'agua',
  'café',
  'cafe',
  'cortado',
  'café con leche',
  'cafe con leche',
  'coca cola',
  'coca cola zero',
  'nestea',
  'red bull',
];

const QUICK_FOOD_ITEMS = [
  'croissant',
  'croissant chocolate',
  'bacon con queso',
  'bikini',
  'jamón serrano',
  'jamon serrano',
  'longaniza',
  'tortilla de patatas',
  'jamón dulce',
  'jamon dulce',
  'chips ahoy',
  'kinder bueno',
  'oreo',
  'butifarra blanca',
  'pollo bocadillo',
  'manchego',
  'patatas bravas',
  'pechuga de pollo',
  'pincho de tortilla',
];

/** Nombres que no deben aparecer en acceso rápido (normalizado minúsculas). */
const EXCLUDED_QUICK_NAMES = new Set([
  'agua con gas malavella',
  'café americano',
  'café doble',
  'tortilla de patatas entera',
  'preparación patatas bravas',
  'preparacion patatas bravas',
  'sup manchego',
  'tabla de manchego',
  'oreo helado',
  'oreo palo',
]);

/** Bocadillos sin opción medio (nombre normalizado). */
const BOCADILLO_SIN_MEDIO = new Set([
  'calamares bocadillo',
  'hamburguesa',
  'frankfurt',
  'pollo bocadillo',
  'roastbeef bocadillo',
]);

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

type ConsumptionStep = 'drinks' | 'food';

function isDrinkRecipe(recipe: { name: string; category: string | null }): boolean {
  const name = normalizeName(recipe.name);
  const cat = recipe.category?.toLowerCase() ?? '';

  // Primario: categorías típicas
  if (cat.includes('bebid')) return true;
  if (cat.includes('refresc')) return true;
  if (cat.includes('cervez')) return true;
  if (cat.includes('vino')) return true;
  if (cat.includes('café') || cat.includes('cafe')) return true;

  // Fallback por nombre (cuando la categoría viene vacía o inconsistente)
  const drinkNeedles = [
    'agua',
    'café',
    'cafe',
    'cortado',
    'coca cola',
    'nestea',
    'red bull',
    'zumo',
    'cerveza',
    'vino',
    'tónica',
    'tonica',
    'fanta',
    'sprite',
    'kas',
  ];
  return drinkNeedles.some((n) => name.includes(n));
}

function isExcludedFromQuick(recipe: { name: string }): boolean {
  return EXCLUDED_QUICK_NAMES.has(normalizeName(recipe.name));
}

function isBocadillo(recipe: { name: string; category: string | null }): boolean {
  const cat = recipe.category?.toLowerCase() ?? '';
  if (cat.includes('bocadillo')) return true;
  return recipe.name.toLowerCase().includes('bocadillo');
}

function requiresRacionChoice(recipe: { name: string; category: string | null }): boolean {
  if (!isBocadillo(recipe)) return false;
  if (BOCADILLO_SIN_MEDIO.has(normalizeName(recipe.name))) return false;
  return true;
}

type Recipe = { id: string; name: string; photo_url: string | null; category: string | null };
type CartItem = { recipe: Recipe; quantity: number; is_half: boolean };

export function ConsumptionModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [racionPicker, setRacionPicker] = useState<Recipe | null>(null);
  const [showEmptyCartError, setShowEmptyCartError] = useState(false);
  const [step, setStep] = useState<ConsumptionStep>('drinks');

  useEffect(() => {
    getConsumptionRecipes().then((data) => {
      setRecipes(data as Recipe[]);
      setIsLoading(false);
    });
  }, []);

  const handleAdd = useCallback((recipe: Recipe, is_half: boolean) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.recipe.id === recipe.id && item.is_half === is_half);
      if (existing) {
        return prev.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { recipe, quantity: 1, is_half }];
    });
  }, []);

  const handleDecrement = useCallback((recipeId: string, is_half: boolean) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.recipe.id === recipeId && item.is_half === is_half);
      if (!existing) return prev;
      if (existing.quantity > 1) {
        return prev.map((i) =>
          i === existing ? { ...i, quantity: i.quantity - 1 } : i,
        );
      }
      return prev.filter((i) => i !== existing);
    });
  }, []);

  const cartQuantityByRecipe = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      const key = `${item.recipe.id}:${item.is_half ? 'half' : 'full'}`;
      map.set(key, (map.get(key) ?? 0) + item.quantity);
    }
    return map;
  }, [cart]);

  const getCartBadgeCount = useCallback(
    (recipeId: string, isHalf: boolean) => cartQuantityByRecipe.get(`${recipeId}:${isHalf ? 'half' : 'full'}`) ?? 0,
    [cartQuantityByRecipe],
  );

  const onRecipeActivate = useCallback(
    (recipe: Recipe) => {
      if (requiresRacionChoice(recipe)) {
        setRacionPicker(recipe);
        return;
      }
      handleAdd(recipe, false);
    },
    [handleAdd],
  );

  const handleSubmit = async () => {
    // Defensa: este botón solo debería existir en el paso Comida,
    // pero mantenemos el guard por si se llama desde DevTools.
    if (cart.length === 0) {
      setShowEmptyCartError(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = cart.map((c) => ({
        recipe_id: c.recipe.id,
        quantity: c.quantity,
        is_half: c.is_half,
      }));
      const res = await submitPersonalConsumption(payload);
      if (!res.success) {
        if (res.code === 'EMPTY_CART') {
          setShowEmptyCartError(true);
        } else {
          toast.error(res.message);
        }
        setIsSubmitting(false);
        return;
      }
      await Promise.resolve(onConfirm());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error al fichar la salida';
      toast.error(message);
      setIsSubmitting(false);
    }
  };

  const stepRecipes = useMemo(() => {
    return recipes.filter((r) => (step === 'drinks' ? isDrinkRecipe(r) : !isDrinkRecipe(r)));
  }, [recipes, step]);

  const cartHasDrink = useMemo(() => cart.some((c) => isDrinkRecipe(c.recipe)), [cart]);
  const cartHasFood = useMemo(() => cart.some((c) => !isDrinkRecipe(c.recipe)), [cart]);

  const quickRecipes = useMemo(() => {
    const needles = step === 'drinks' ? QUICK_DRINK_ITEMS : QUICK_FOOD_ITEMS;
    return stepRecipes.filter((r) => {
      if (isExcludedFromQuick(r)) return false;
      return needles.some((q) => r.name.toLowerCase().includes(q.toLowerCase()));
    });
  }, [step, stepRecipes]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return stepRecipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [search, stepRecipes]);

  // En cada paso deben verse TODOS los productos del paso.
  // La búsqueda solo reduce el conjunto (nunca "esconde" items por diseño).
  const gridRecipes = search.trim() ? searchResults : stepRecipes;

  /** Tras intento sin productos: aviso rojo solo mientras el carrito sigue vacío. */
  const emptyCartMessageVisible =
    showEmptyCartError && (step === 'drinks' ? !cartHasDrink : !cartHasFood);

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-gray-900/80 p-4 backdrop-blur-sm sm:items-center">
      <div className="flex h-[90vh] max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between bg-[#36606F] p-5 text-white">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Consumo personal</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="min-h-12 min-w-12 shrink-0 rounded-full bg-black/15 p-2 transition-colors hover:bg-black/25"
            aria-label="Cerrar"
          >
            <X className="mx-auto h-6 w-6" />
          </button>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
          {isLoading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-8">
              <Loader2 className="h-12 w-12 shrink-0 animate-spin text-gray-400" aria-hidden />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col space-y-5 overflow-y-auto p-4 md:p-5">
              <div className="relative shrink-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  placeholder={step === 'drinks' ? 'Buscar bebidas...' : 'Buscar comida...'}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-sm shadow-sm focus:ring-2 focus:ring-[#36606F]/40"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                {gridRecipes.map((recipe) => {
                  const badgeCount =
                    getCartBadgeCount(recipe.id, false) + getCartBadgeCount(recipe.id, true);
                  return (
                  <button
                    key={recipe.id}
                    type="button"
                    onClick={() => onRecipeActivate(recipe)}
                    className="relative flex min-h-0 flex-col items-center gap-0.5 bg-transparent p-1.5 text-center transition-transform active:scale-[0.98]"
                  >
                    {badgeCount > 0 ? (
                      <span className="absolute right-0.5 top-0.5 z-10 min-h-6 min-w-6 rounded-full bg-[#36606F] px-1.5 text-[10px] font-black leading-6 text-white shadow-sm">
                        ×{badgeCount}
                      </span>
                    ) : null}
                    <div className="mb-0.5 flex h-12 w-full shrink-0 items-center justify-center">
                      {recipe.photo_url ? (
                        <img
                          src={recipe.photo_url}
                          alt=""
                          className="max-h-12 w-full object-contain"
                        />
                      ) : (
                        <Package className="h-5 w-5 text-zinc-300" aria-hidden />
                      )}
                    </div>
                    <span
                      className="line-clamp-2 w-full text-center text-[9px] font-black leading-tight text-zinc-800 min-[380px]:text-[10px]"
                      title={recipe.name}
                    >
                      {recipe.name}
                    </span>
                  </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-200 bg-white p-4 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] md:p-5">
          {cart.length > 0 && (
            <>
              <h3 className="mb-2 font-bold text-zinc-900">Has consumido:</h3>
              <div className="mb-3 flex flex-col gap-2">
                {cart.map((c, i) => (
                  <div
                    key={`${c.recipe.id}-${c.is_half}-${i}`}
                    className="flex min-h-12 items-center gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => handleDecrement(c.recipe.id, c.is_half)}
                      className={cn(
                        'inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl text-zinc-400',
                        'hover:text-zinc-600 active:scale-[0.98] transition-colors',
                      )}
                      aria-label={`Quitar una unidad de ${c.recipe.name}`}
                    >
                      <Minus className="h-5 w-5" strokeWidth={2.5} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-zinc-900" title={c.recipe.name}>
                        {c.recipe.name}
                        {c.is_half ? ' (Mitad)' : ''}
                      </p>
                    </div>
                    <div className="shrink-0 tabular-nums text-sm font-black text-zinc-700">
                      ×{c.quantity}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAdd(c.recipe, c.is_half)}
                      className={cn(
                        'inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl text-zinc-400',
                        'hover:text-zinc-600 active:scale-[0.98] transition-colors',
                      )}
                      aria-label={`Añadir una unidad de ${c.recipe.name}`}
                    >
                      <Plus className="h-5 w-5" strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          {emptyCartMessageVisible && (
            <p
              className="mb-2 text-center text-sm font-semibold text-red-600"
              role="alert"
            >
              Registra tu consumo antes de continuar.
            </p>
          )}

          {step === 'drinks' ? (
            <button
              type="button"
              onClick={() => {
                if (!cartHasDrink) {
                  setShowEmptyCartError(true);
                  return;
                }
                setShowEmptyCartError(false);
                setSearch('');
                setStep('food');
              }}
              disabled={isSubmitting}
              className={cn(
                'flex min-h-12 w-full items-center justify-center rounded-xl py-2.5 text-sm font-bold text-white shadow-md transition-all',
                'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-70',
              )}
            >
              Siguiente
            </button>
          ) : (
            <div className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowEmptyCartError(false);
                  setSearch('');
                  setStep('drinks');
                }}
                disabled={isSubmitting}
                className={cn(
                  'min-h-12 flex-1 shrink-0 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-800 shadow-sm transition-all',
                  'hover:bg-zinc-50 active:scale-[0.99] disabled:opacity-70',
                )}
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!cartHasFood) {
                    setShowEmptyCartError(true);
                    return;
                  }
                  void handleSubmit();
                }}
                disabled={isSubmitting}
                className={cn(
                  'min-h-12 flex-1 shrink-0 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-md transition-all',
                  'hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-70',
                )}
              >
                {isSubmitting ? (
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                ) : (
                  'Confirmar y fichar'
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {racionPicker && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="racion-picker-title"
          onClick={() => setRacionPicker(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-zinc-100 bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="racion-picker-title" className="mb-4 text-center text-base font-bold text-zinc-900">
              {racionPicker.name}
            </p>
            <p className="mb-4 text-center text-sm text-zinc-500">Selecciona la ración</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className="min-h-12 rounded-xl bg-[#36606F] py-3 text-sm font-bold text-white shadow-sm hover:opacity-95 active:scale-[0.98]"
                onClick={() => {
                  handleAdd(racionPicker, false);
                  setRacionPicker(null);
                }}
              >
                Entero
              </button>
              <button
                type="button"
                className="min-h-12 rounded-xl border border-zinc-200 bg-zinc-50 py-3 text-sm font-bold text-zinc-800 hover:bg-zinc-100 active:scale-[0.98]"
                onClick={() => {
                  handleAdd(racionPicker, true);
                  setRacionPicker(null);
                }}
              >
                Medio
              </button>
            </div>
            <button
              type="button"
              className="mt-4 w-full min-h-12 rounded-xl border border-zinc-200 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
              onClick={() => setRacionPicker(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
