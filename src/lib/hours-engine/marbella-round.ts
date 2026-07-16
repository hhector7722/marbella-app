/**
 * Redondeo Marbella de horas (misma regla que `calculateRoundedHours` en lib/utils
 * y `fn_round_marbella_hours` en BD). Duplicado local para no acoplar el motor
 * al barrel de UI/utils.
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
