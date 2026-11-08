/** Solo presentación: importe redondeado, sin alterar el valor económico original. */
export function formatRoundedCurrencySpanish(value: number): string {
    return `${Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}€`;
}
