'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Loader2, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ConsumptionBottomSheet } from '@/components/ui/ConsumptionBottomSheet';
import { Button } from '@/components/ui/button';
import {
  getConsumptionRecipesForOrderEditor,
  saveConsumptionRecipeDisplayOrder,
  seedDefaultConsumptionRecipeOrder,
  type ConsumptionRecipeForOrder,
} from '@/app/dashboard/consumo-personal/actions';
import {
  buildDefaultConsumptionRecipeOrder,
  isDrinkConsumptionRecipe,
} from '@/lib/staff-consumption-display';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';

function sortByManualOrder(recipes: ConsumptionRecipeForOrder[]): ConsumptionRecipeForOrder[] {
  return [...recipes].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name, 'es');
  });
}

type OrderStep = 'drinks' | 'food';

function SortableRecipeRow({
  recipe,
  index,
}: {
  recipe: ConsumptionRecipeForOrder;
  index: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: recipe.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex min-h-12 items-center gap-2 rounded-xl border border-zinc-100 bg-white px-2 shadow-sm',
        isDragging && 'z-10 opacity-90 shadow-md ring-2 ring-[#36606F]/30',
      )}
    >
      <button
        type="button"
        className="inline-flex min-h-12 min-w-10 shrink-0 cursor-grab items-center justify-center text-zinc-400 active:cursor-grabbing"
        aria-label={`Reordenar ${recipe.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <span className="w-6 shrink-0 text-center text-xs font-black tabular-nums text-zinc-400">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-zinc-900">{recipe.name}</p>
        <p className="text-[11px] text-zinc-500">
          {recipe.usage_count > 0
            ? `Consumido ${recipe.usage_count} ${recipe.usage_count === 1 ? 'vez' : 'veces'}`
            : 'Sin consumos registrados'}
        </p>
      </div>
    </div>
  );
}

export function ConsumptionRecipeOrderModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useModalUsageTracking({ open, usageId: 'consumption-order', usageLabel: 'Orden consumo' });
  const trackConsumptionOrderSave = useTrackModalApply('consumption-order', 'Orden consumo');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<OrderStep>('drinks');
  const [allRecipes, setAllRecipes] = useState<ConsumptionRecipeForOrder[]>([]);
  const [drinkIds, setDrinkIds] = useState<string[]>([]);
  const [foodIds, setFoodIds] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getConsumptionRecipesForOrderEditor();
    if (!res.success) {
      toast.error(res.message);
      setLoading(false);
      return;
    }

    let recipes = res.recipes;
    if (!res.hasSavedOrder) {
      const seed = await seedDefaultConsumptionRecipeOrder();
      if (!seed.success) {
        toast.error(seed.message);
      } else {
        toast.success('Orden inicial aplicado (acceso rápido + alfabético).');
        const again = await getConsumptionRecipesForOrderEditor();
        if (again.success) recipes = again.recipes;
      }
    }

    const sorted = sortByManualOrder(recipes);
    const drinks = sorted.filter((r) => isDrinkConsumptionRecipe(r));
    const foods = sorted.filter((r) => !isDrinkConsumptionRecipe(r));
    setAllRecipes(sorted);
    setDrinkIds(drinks.map((r) => r.id));
    setFoodIds(foods.map((r) => r.id));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const recipeById = useMemo(() => {
    const map = new Map<string, ConsumptionRecipeForOrder>();
    for (const r of allRecipes) map.set(r.id, r);
    return map;
  }, [allRecipes]);

  const activeIds = step === 'drinks' ? drinkIds : foodIds;
  const activeRecipes = activeIds
    .map((id) => recipeById.get(id))
    .filter((r): r is ConsumptionRecipeForOrder => Boolean(r));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = step === 'drinks' ? [...drinkIds] : [...foodIds];
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(ids, oldIndex, newIndex);
    if (step === 'drinks') setDrinkIds(next);
    else setFoodIds(next);
  };

  const handleResetStepToDefault = () => {
    const subset = allRecipes.filter((r) =>
      step === 'drinks' ? isDrinkConsumptionRecipe(r) : !isDrinkConsumptionRecipe(r),
    );
    const ordered = buildDefaultConsumptionRecipeOrder(subset);
    if (step === 'drinks') setDrinkIds(ordered);
    else setFoodIds(ordered);
  };

  const handleSave = async () => {
    setSaving(true);
    const merged = [...drinkIds, ...foodIds];
    const res = await saveConsumptionRecipeDisplayOrder(merged);
    setSaving(false);
    if (!res.success) {
      toast.error(res.message);
      return;
    }
    toast.success('Orden guardado. El modal de fichaje usará este orden como base.');
    trackConsumptionOrderSave(`${merged.length} productos · ${step === 'drinks' ? 'bebidas+comida' : 'comida+bebidas'}`);
    onClose();
  };

  return (
    <ConsumptionBottomSheet
      open={open}
      onClose={onClose}
      title="Orden de productos"
      instance="consumption-order"
      hideCloseButton={saving}
      footer={
        <div className="flex w-full flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            instance="consumption-order-reset"
            layout="fill"
            icon={<RotateCcw className="h-4 w-4" />}
            disabled={loading || saving}
            onClick={handleResetStepToDefault}
          >
            Restaurar {step === 'drinks' ? 'bebidas' : 'comida'} (acceso rápido)
          </Button>
          <Button
            type="button"
            variant="primary"
            instance="consumption-order-save"
            layout="fill"
            icon={<Save className="h-4 w-4" />}
            disabled={loading || saving}
            loading={saving}
            loadingLabel="Guardando"
            onClick={() => void handleSave()}
          >
            Guardar orden
          </Button>
        </div>
      }
    >
      <p className="px-4 pt-1 text-xs font-semibold text-zinc-500">
        Este orden lo ve todo el staff al fichar salida
      </p>
      <div className="flex shrink-0 gap-2 border-b border-zinc-100 px-4 pt-3">
        {(['drinks', 'food'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setStep(tab)}
            className={cn(
              'min-h-12 flex-1 rounded-t-xl text-sm font-bold transition-colors',
              step === tab
                ? 'bg-emerald-50 text-emerald-800'
                : 'text-zinc-500 hover:bg-zinc-50',
            )}
          >
            {tab === 'drinks' ? 'Bebidas' : 'Comida'}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 p-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-zinc-300" />
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={activeIds} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {activeRecipes.map((recipe, index) => (
                  <SortableRecipeRow key={recipe.id} recipe={recipe} index={index} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </ConsumptionBottomSheet>
  );
}
