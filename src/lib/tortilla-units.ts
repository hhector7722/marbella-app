/**
 * Equivalencias exactas de los formatos de consumo de una tortilla.
 * Cada formato expresa cuántas porciones de ese tipo salen de 1 tortilla.
 * Usamos un denominador común entero para no aceptar mezclas que exceden
 * el lote por errores de coma flotante.
 */
export type TortillaConsumptionUnit = {
    code: string;
    label: string;
    portions_per_batch: number;
};

function gcd(a: bigint, b: bigint): bigint {
    while (b !== BigInt(0)) {
        const next = a % b;
        a = b;
        b = next;
    }
    return a;
}

function lcm(a: bigint, b: bigint): bigint {
    return (a / gcd(a, b)) * b;
}

export function calculateTortillaUnits(
    formats: readonly TortillaConsumptionUnit[],
    quantities: Readonly<Record<string, number>>,
): {
    valid: boolean;
    allocated: bigint;
    capacity: bigint;
    remaining: bigint;
    remainingPercent: number;
    available: Record<string, number>;
} {
    const usable = formats.filter((format) =>
        Number.isSafeInteger(format.portions_per_batch) && format.portions_per_batch > 0
    );
    const capacity = usable.reduce(
        (denominator, format) => lcm(denominator, BigInt(format.portions_per_batch)),
        BigInt(1),
    );
    const allocated = usable.reduce((sum, format) => {
        const count = quantities[format.code] ?? 0;
        const safeCount = Number.isSafeInteger(count) && count > 0 ? count : 0;
        return sum + BigInt(safeCount) * (capacity / BigInt(format.portions_per_batch));
    }, BigInt(0));
    const remaining = allocated < capacity ? capacity - allocated : BigInt(0);

    return {
        valid: allocated <= capacity,
        allocated,
        capacity,
        remaining,
        remainingPercent: Number((remaining * BigInt(1000) + capacity / BigInt(2)) / capacity) / 10,
        available: Object.fromEntries(usable.map((format) => [
            format.code,
            Number(remaining / (capacity / BigInt(format.portions_per_batch))),
        ])),
    };
}
