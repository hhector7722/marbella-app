/**
 * Redondeo Marbella de horas (misma regla que `calculateRoundedHours` en lib/utils
 * y `fn_round_marbella_hours` en BD). Duplicado local para no acoplar el motor
 * al barrel de UI/utils.
 *
 * Resultado: solo enteros o medias (.0 / .5). Nunca .1–.4 / .6–.9.
 */
export function roundMarbellaHours(hours: number): number {
  const integerPart = Math.floor(hours);
  const decimalPart = hours - integerPart;
  const minutes = decimalPart * 60;

  let fraction = 0;
  if (minutes <= 20) {
    fraction = 0;
  } else if (minutes <= 50) {
    fraction = 0.5;
  } else {
    fraction = 1.0;
  }

  return integerPart + fraction;
}

/** Banco / balances con signo: Marbella sobre el valor absoluto. */
export function roundMarbellaSigned(hours: number): number {
  if (!Number.isFinite(hours) || hours === 0) return 0;
  const sign = hours < 0 ? -1 : 1;
  return sign * roundMarbellaHours(Math.abs(hours));
}
