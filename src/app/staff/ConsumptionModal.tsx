'use client';

import { useState, useEffect, useMemo } from 'react';
import { submitPersonalConsumption, getConsumptionRecipes } from './actions';
import { toast } from 'sonner';
import { X, Search, Check, UtensilsCrossed, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
];

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

  useEffect(() => {
    getConsumptionRecipes().then((data) => {
      setRecipes(data as Recipe[]);
      setIsLoading(false);
    });
  }, []);

  const handleAdd = (recipe: Recipe, is_half = false) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.recipe.id === recipe.id && item.is_half === is_half);
      if (existing) {
        return prev.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { recipe, quantity: 1, is_half }];
    });
  };

  const handleSubmit = async (skip = false) => {
    setIsSubmitting(true);
    try {
      const payload = skip ? [] : cart.map((c) => ({ recipe_id: c.recipe.id, quantity: c.quantity, is_half: c.is_half }));
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
      recipes.filter((r) => QUICK_ITEMS.some((q) => r.name.toLowerCase().includes(q.toLowerCase()))),
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
        <div className="shrink-0 bg-gray-900 p-6 text-white flex justify-between items-center">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold">
              <UtensilsCrossed className="h-7 w-7 shrink-0" aria-hidden />
              Consumo personal
            </h2>
            <p className="mt-1 text-gray-400">Apunta los productos que has consumido hoy antes de salir.</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="min-h-12 min-w-12 shrink-0 rounded-full bg-gray-800 p-2 transition-colors hover:bg-gray-700"
            aria-label="Cerrar"
          >
            <X className="mx-auto h-6 w-6" />
          </button>
        </div>

        <div className="shrink-0 border-b border-gray-100 bg-gray-50 p-4">
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={isSubmitting}
            className={cn(
              'flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-xl font-black shadow-sm transition-all',
              'bg-blue-100 text-blue-700 hover:bg-blue-200 active:scale-[0.98]',
              'disabled:opacity-70',
            )}
          >
            {isSubmitting ? <Loader2 className="h-7 w-7 animate-spin" /> : <Check className="h-7 w-7 shrink-0" />}
            NO HE CONSUMIDO NADA HOY
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-12 w-12 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="flex-1 space-y-8 overflow-y-auto bg-gray-50/50 p-4 md:p-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                placeholder="Buscar otros productos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-14 w-full rounded-xl border border-gray-200 bg-white pl-12 pr-4 text-lg shadow-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {gridRecipes.map((recipe) => (
                <div
                  key={recipe.id}
                  className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm"
                >
                  <div className="relative aspect-video overflow-hidden rounded-xl bg-gray-100">
                    {recipe.photo_url ? (
                      <img
                        src={recipe.photo_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-400">
                        <UtensilsCrossed className="h-8 w-8" aria-hidden />
                      </div>
                    )}
                  </div>
                  <span className="flex h-10 items-center justify-center text-center text-sm font-semibold leading-tight text-gray-900 line-clamp-2">
                    {recipe.name}
                  </span>

                  <div className="mt-auto grid shrink-0 grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => handleAdd(recipe, false)}
                      className="min-h-12 rounded-lg bg-gray-900 py-2 text-xs font-bold text-white transition-all hover:bg-gray-800 active:scale-95"
                    >
                      Entero
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdd(recipe, true)}
                      className="min-h-12 rounded-lg border border-gray-200 bg-gray-100 py-2 text-xs font-bold text-gray-700 transition-all hover:bg-gray-200 active:scale-95"
                    >
                      Medio
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {cart.length > 0 && (
          <div className="shrink-0 border-t border-gray-200 bg-white p-4 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] md:p-6">
            <h3 className="mb-3 font-bold text-gray-900">Has consumido:</h3>
            <div className="mb-4 flex flex-wrap gap-2">
              {cart.map((c, i) => (
                <span
                  key={`${c.recipe.id}-${c.is_half}-${i}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700"
                >
                  {c.quantity}× {c.recipe.name} {c.is_half ? '(Mitad)' : ''}
                  <button
                    type="button"
                    onClick={() => setCart((prev) => prev.filter((_, idx) => idx !== i))}
                    className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center text-blue-700 hover:text-red-500"
                    aria-label="Quitar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={isSubmitting}
              className="flex min-h-14 w-full items-center justify-center rounded-xl bg-gray-900 py-3 text-xl font-bold text-white shadow-md transition-all hover:bg-black active:scale-95 disabled:opacity-70"
            >
              {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : 'CONFIRMAR CONSUMO Y FICHAR SALIDA'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
