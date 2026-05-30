export type CashInventoryRow = {
  denomination: number;
  quantity: number;
};

/** Desglose greedy en céntimos: mayor denominación primero, respetando stock. */
export function greedyCashBreakdown(
  targetAmount: number,
  inventory: CashInventoryRow[],
): { breakdown: Record<number, number>; remaining: number } {
  let remainingCents = Math.round(targetAmount * 100);
  const breakdown: Record<number, number> = {};

  const sorted = [...inventory].sort((a, b) => b.denomination - a.denomination);

  for (const { denomination, quantity } of sorted) {
    if (remainingCents <= 0 || quantity <= 0) continue;
    const denomCents = Math.round(denomination * 100);
    if (denomCents <= 0) continue;
    const maxByAmount = Math.floor(remainingCents / denomCents);
    const use = Math.min(maxByAmount, quantity);
    if (use > 0) {
      breakdown[denomination] = use;
      remainingCents -= use * denomCents;
    }
  }

  return { breakdown, remaining: remainingCents / 100 };
}

export function hasAnyInventoryStock(inventory: CashInventoryRow[] | Record<number, number>): boolean {
  if (Array.isArray(inventory)) {
    return inventory.some((row) => row.quantity > 0);
  }
  return Object.values(inventory).some((q) => q > 0);
}
