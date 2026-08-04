/**
 * Value Objects del Dominio de Payroll (FASE 3).
 *
 * Encapsulan primitivos numéricos evitando obsesión por primitivos ("Primitive Obsession"),
 * divisiones por cero, NaN, y errores de redondeo de punto flotante en JavaScript.
 */

function round2(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export class Money {
  private readonly _amount: number;

  private constructor(amount: number) {
    this._amount = round2(isNaN(amount) || !isFinite(amount) ? 0 : amount);
  }

  static from(amount: number): Money {
    return new Money(amount);
  }

  static zero(): Money {
    return new Money(0);
  }

  get amount(): number {
    return this._amount;
  }

  add(other: Money): Money {
    return new Money(this._amount + other._amount);
  }

  subtract(other: Money): Money {
    return new Money(this._amount - other._amount);
  }

  multiply(factor: number): Money {
    return new Money(this._amount * factor);
  }

  divide(divisor: number): Money {
    if (divisor === 0 || isNaN(divisor) || !isFinite(divisor)) {
      return Money.zero();
    }
    return new Money(this._amount / divisor);
  }

  equals(other: Money): boolean {
    return Math.abs(this._amount - other._amount) < 0.005;
  }

  greaterThan(other: Money): boolean {
    return this._amount > other._amount + 0.005;
  }

  isZero(): boolean {
    return Math.abs(this._amount) < 0.005;
  }
}

export class LaborCost {
  readonly fixed: Money;
  readonly overtime: Money;
  readonly total: Money;

  private constructor(fixed: Money, overtime: Money) {
    this.fixed = fixed;
    this.overtime = overtime;
    this.total = fixed.add(overtime); // Invariante garantizada: total = fixed + overtime
  }

  static create(fixed: Money, overtime: Money): LaborCost {
    return new LaborCost(fixed, overtime);
  }

  static zero(): LaborCost {
    return new LaborCost(Money.zero(), Money.zero());
  }

  add(other: LaborCost): LaborCost {
    return new LaborCost(
      this.fixed.add(other.fixed),
      this.overtime.add(other.overtime),
    );
  }
}

export class Percentage {
  private readonly _value: number;

  private constructor(value: number) {
    this._value = round2(isNaN(value) || !isFinite(value) ? 0 : value);
  }

  static fromValues(numerator: Money, denominator: Money): Percentage {
    if (denominator.isZero() || denominator.amount <= 0) {
      return Percentage.zero();
    }
    const pct = (numerator.amount / denominator.amount) * 100;
    return new Percentage(pct);
  }

  static fromRaw(value: number): Percentage {
    return new Percentage(value);
  }

  static zero(): Percentage {
    return new Percentage(0);
  }

  get value(): number {
    return this._value;
  }
}
