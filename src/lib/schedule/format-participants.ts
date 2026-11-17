const participantNumberFormatter = new Intl.NumberFormat('es-ES', {
  useGrouping: true,
  maximumFractionDigits: 0,
});

/** Always groups thousands, including four-digit values (e.g. 2.525). */
export function formatParticipantCount(value: number): string {
  return participantNumberFormatter.format(value);
}
