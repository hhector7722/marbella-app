'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { submitPersonalConsumption, getConsumptionRecipes } from './actions';
import { toast } from 'sonner';
import { Search, Loader2, Package, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  isDrinkConsumptionRecipe,
  normalizeConsumptionRecipeName,
  sortConsumptionRecipesForModal,
} from '@/lib/staff-consumption-display';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { consumptionCartSummary } from '@/lib/usage/modal-apply';
import { ConsumptionBottomSheet } from '@/components/ui/ConsumptionBottomSheet';
import { Button } from '@/components/ui/button';

/** Bocadillos sin opción medio (nombre normalizado). */
const BOCADILLO_SIN_MEDIO = new Set([
  'calamares bocadillo',
  'hamburguesa',
  'frankfurt',
  'pollo bocadillo',
  'roastbeef bocadillo',
]);

type ConsumptionStep = 'drinks' | 'food';

function isBocadillo(recipe: { name: string; category: string | null }): boolean {
  const cat = recipe.category?.toLowerCase() ?? '';
  if (cat.includes('bocadillo')) return true;
  return recipe.name.toLowerCase().includes('bocadillo');
}

function requiresRacionChoice(recipe: { name: string; category: string | null }): boolean {
  if (!isBocadillo(recipe)) return false;
  if (BOCADILLO_SIN_MEDIO.has(normalizeConsumptionRecipeName(recipe.name))) return false;
  return true;
}

type Recipe = {
  id: string;
  name: string;
  photo_url: string | null;
  category: string | null;
};
type CartItem = { recipe: Recipe; quantity: number; is_half: boolean };

export function ConsumptionModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  useModalUsageTracking({ open: true, usageId: 'staff-consumption', usageLabel: 'Consumo al fichar' });
  const trackConsumptionApply = useTrackModalApply('staff-consumption', 'Consumo al fichar');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [racionPicker, setRacionPicker] = useState<Recipe | null>(null);
  const [showEmptyCartError, setShowEmptyCartError] = useState(false);
  const [step, setStep] = useState<ConsumptionStep>('drinks');
  const lastAddTimeRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    getConsumptionRecipes().then((data) => {
      setRecipes(sortConsumptionRecipesForModal(data));
      setIsLoading(false);
    });
  }, []);

  const handleAdd = useCallback((recipe: Recipe, is_half: boolean) => {
    const key = `${recipe.id}:${is_half}`;
    const now = Date.now();
    const last = lastAddTimeRef.current.get(key) ?? 0;
    if (now - last < 300) return;
    lastAddTimeRef.current.set(key, now);

    setCart((prev) => {
      const existing = prev.find((item) => item.recipe.id === recipe.id && item.is_half === is_half);
      if (existing) {
        if (existing.quantity >= 20) return prev;
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

  const cartHasDrink = useMemo(
    () => cart.some((c) => isDrinkConsumptionRecipe(c.recipe)),
    [cart],
  );
  const cartHasFood = useMemo(
    () => cart.some((c) => !isDrinkConsumptionRecipe(c.recipe)),
    [cart],
  );

  const handleSubmit = async () => {
    if (cart.length === 0 || !cartHasDrink) {
      setShowEmptyCartError(true);
      setStep('drinks');
      return;
    }
    if (!cartHasFood) {
      setShowEmptyCartError(true);
      setStep('food');
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
        if (res.code === 'NO_FOOD') {
          setShowEmptyCartError(true);
          setStep('food');
        } else if (res.code === 'EMPTY_CART') {
          setShowEmptyCartError(true);
          setStep(cartHasDrink ? 'food' : 'drinks');
        } else {
          toast.error(res.message);
        }
        setIsSubmitting(false);
        return;
      }
      trackConsumptionApply(consumptionCartSummary(cart));
      await Promise.resolve(onConfirm());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error al fichar la salida';
      toast.error(message);
      setIsSubmitting(false);
    }
  };

  const stepRecipes = useMemo(() => {
    return recipes.filter((r) =>
      step === 'drinks' ? isDrinkConsumptionRecipe(r) : !isDrinkConsumptionRecipe(r),
    );
  }, [recipes, step]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return stepRecipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [search, stepRecipes]);

  const gridRecipes = search.trim() ? searchResults : stepRecipes;

  const emptyCartMessageVisible =
    showEmptyCartError && (step === 'drinks' ? !cartHasDrink : !cartHasFood);

  return (
    <ConsumptionBottomSheet
      open
      onClose={() => {
        if (!isSubmitting) onCancel();
      }}
      title="Consumo personal"
      instance="staff-consumption"
      hideCloseButton={isSubmitting}
      footer={
        <div className="flex w-full flex-col gap-2">
          {cart.length > 0 ? (
            <>
              <h3 className="font-bold text-zinc-900">Has consumido:</h3>
              <div className="flex flex-col gap-2">
                {cart.map((c, i) => (
                  <div
                    key={`${c.recipe.id}-${c.is_half}-${i}`}
                    className="flex min-h-12 items-center gap-2 rounded-xl px-2"
                  >
                    <button
                      type="button"
                      onClick={() => handleDecrement(c.recipe.id, c.is_half)}
                      disabled={isSubmitting}
                      className={cn(
                        'inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl text-zinc-400',
                        'hover:text-zinc-600 active:scale-[0.98] transition-colors disabled:pointer-events-none disabled:opacity-30',
                      )}
                      aria-label={`Quitar una unidad de ${c.recipe.name}`}
                    >
                      <Minus className="h-5 w-5" strokeWidth={2.5} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm font-bold text-zinc-900"
                        title={c.recipe.name}
                      >
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
                      disabled={isSubmitting}
                      className={cn(
                        'inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl text-zinc-400',
                        'hover:text-zinc-600 active:scale-[0.98] transition-colors disabled:pointer-events-none disabled:opacity-30',
                      )}
                      aria-label={`Añadir una unidad de ${c.recipe.name}`}
                    >
                      <Plus className="h-5 w-5" strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          {emptyCartMessageVisible ? (
            <p
              className="text-center text-sm font-semibold text-red-600"
              role="alert"
            >
              {step === 'drinks'
                ? 'Apunta tu bebida antes de continuar.'
                : 'Apunta al menos una comida antes de fichar.'}
            </p>
          ) : null}
          {step === 'drinks' ? (
            <Button
              type="button"
              variant="primary"
              instance="staff-consumption-next"
              layout="fill"
              disabled={isSubmitting}
              onClick={() => {
                if (!cartHasDrink) {
                  setShowEmptyCartError(true);
                  return;
                }
                setShowEmptyCartError(false);
                setSearch('');
                setRacionPicker(null);
                setStep('food');
              }}
            >
              Siguiente
            </Button>
          ) : (
            <div className="flex w-full gap-2">
              <Button
                type="button"
                variant="secondary"
                instance="staff-consumption-back"
                layout="fill"
                className="flex-1"
                disabled={isSubmitting}
                onClick={() => {
                  setShowEmptyCartError(false);
                  setSearch('');
                  setRacionPicker(null);
                  setStep('drinks');
                }}
              >
                Atrás
              </Button>
              <Button
                type="button"
                variant="primary"
                instance="staff-consumption-confirm"
                layout="fill"
                className="flex-1"
                disabled={isSubmitting}
                loading={isSubmitting}
                loadingLabel="Confirmando"
                onClick={() => void handleSubmit()}
              >
                Confirmar y fichar
              </Button>
            </div>
          )}
        </div>
      }
    >
      {isLoading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-8">
          <Loader2 className="h-12 w-12 shrink-0 animate-spin text-gray-400" aria-hidden />
        </div>
      ) : racionPicker ? (
        <div className="flex flex-col gap-4 px-4 pb-4">
          <p id="racion-picker-title" className="text-center text-base font-bold text-zinc-900">
            {racionPicker.name}
          </p>
          <p className="text-center text-sm text-zinc-500">Selecciona la ración</p>
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="primary"
              instance="staff-consumption-racion-full"
              layout="fill"
              disabled={isSubmitting}
              onClick={() => {
                handleAdd(racionPicker, false);
                setRacionPicker(null);
              }}
            >
              Entero
            </Button>
            <Button
              type="button"
              variant="secondary"
              instance="staff-consumption-racion-half"
              layout="fill"
              disabled={isSubmitting}
              onClick={() => {
                handleAdd(racionPicker, true);
                setRacionPicker(null);
              }}
            >
              Medio
            </Button>
          </div>
          <Button
            type="button"
            variant="secondary"
            instance="staff-consumption-racion-cancel"
            layout="fill"
            onClick={() => setRacionPicker(null)}
          >
            Cancelar
          </Button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col space-y-5 p-4 md:p-5">
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
                  disabled={isSubmitting}
                  className="relative flex min-h-0 flex-col items-center gap-0.5 rounded-xl bg-transparent p-1.5 text-center transition-transform active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
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
    </ConsumptionBottomSheet>
  );
}
