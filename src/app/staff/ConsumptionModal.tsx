'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { submitPersonalConsumption, getConsumptionRecipes } from './actions';
import { toast } from 'sonner';
import { X, Search, Loader2, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Subcadenas para el grid de acceso rápido (coincidencia en nombre de receta). */
const QUICK_ITEMS = [
  'agua',
  'café',
  'cortado',
  'café con leche',
  'coca cola',
  'coca cola zero',
  'nestea',
  'red bull',
  'croissant',
  'croissant chocolate',
  'bacon con queso',
  'bikini',
  'jamón serrano',
  'longaniza',
  'tortilla de patatas',
  'jamón dulce',
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
    setIsSubmitting(true);
    try {
      const payload = cart.map((c) => ({
        recipe_id: c.recipe.id,
        quantity: c.quantity,
        is_half: c.is_half,
      }));
      await submitPersonalConsumption(payload);
      await Promise.resolve(onConfirm());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error al registrar consumo';
      toast.error(message);
      setIsSubmitting(false);
    }
  };

  const quickRecipes = useMemo(
    () =>
      recipes.filter((r) => {
        if (isExcludedFromQuick(r)) return false;
        return QUICK_ITEMS.some((q) => r.name.toLowerCase().includes(q.toLowerCase()));
      }),
    [recipes],
  );

  const quickIds = useMemo(() => new Set(quickRecipes.map((r) => r.id)), [quickRecipes]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return recipes.filter((r) => r.name.toLowerCase().includes(q) && !quickIds.has(r.id));
  }, [search, recipes, quickIds]);

  const gridRecipes = search.trim() ? searchResults : quickRecipes;

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-gray-900/80 p-4 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between bg-[#36606F] p-5 text-white">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Consumo personal</h2>
            <p className="mt-0.5 text-sm text-white/80">Apunta los productos consumidos</p>
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

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-12 w-12 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="flex-1 space-y-5 overflow-y-auto bg-zinc-50/80 p-4 md:p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                placeholder="Buscar otros productos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-sm shadow-sm focus:ring-2 focus:ring-[#36606F]/40"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {gridRecipes.map((recipe) => (
                <button
                  key={recipe.id}
                  type="button"
                  onClick={() => onRecipeActivate(recipe)}
                  className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-3 text-left shadow-sm transition-all active:scale-[0.98] hover:border-zinc-200"
                >
                  <div className="flex h-32 w-full items-center justify-center overflow-hidden rounded-xl bg-zinc-100">
                    {recipe.photo_url ? (
                      <img
                        src={recipe.photo_url}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <Package className="h-10 w-10 text-zinc-300" aria-hidden />
                    )}
                  </div>
                  <span className="line-clamp-3 min-h-[2.75rem] text-center text-xs font-semibold leading-snug text-zinc-900">
                    {recipe.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="shrink-0 border-t border-zinc-200 bg-white p-4 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] md:p-5">
          <h3 className="mb-2 font-bold text-zinc-900">Has consumido:</h3>
          <div className="mb-3 flex min-h-[2rem] flex-wrap gap-2">
            {cart.length === 0 ? (
              <span className="text-sm text-zinc-400">Ninguno</span>
            ) : (
              cart.map((c, i) => (
                <span
                  key={`${c.recipe.id}-${c.is_half}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-sm font-medium text-emerald-900"
                >
                  {c.quantity}× {c.recipe.name}
                  {c.is_half ? ' (Mitad)' : ''}
                  <button
                    type="button"
                    onClick={() => setCart((prev) => prev.filter((_, idx) => idx !== i))}
                    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-emerald-800 hover:text-red-600"
                    aria-label="Quitar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting}
            className={cn(
              'flex min-h-12 w-full items-center justify-center rounded-xl py-2.5 text-sm font-bold text-white shadow-md transition-all',
              'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-70',
            )}
          >
            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Confirmar y fichar salida'}
          </button>
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
