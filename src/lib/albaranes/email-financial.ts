import type { CanonicalDocument } from '@/lib/albaranes/extractors/canonical'

/**
 * Read the economic evidence directly from the Mistral canonical document.
 * Never guess missing values or treat an expense as physical inventory.
 */
export function parseSpanishMoney(raw: string | null | undefined): number | null {
  if (!raw) return null
  let v = raw.trim().replace(/[€\s\u00a0]/g, '').replace(/(EUR|EUROS?)/gi, '')
  if (!/^-?[\d.,]+$/.test(v)) return null
  const comma = v.lastIndexOf(',')
  const dot = v.lastIndexOf('.')
  const dec = Math.max(comma, dot)
  if (dec >= 0 && v.length - dec - 1 <= 2) {
    const fractional = v.slice(dec + 1)
    v = v.slice(0, dec).replace(/[.,]/g, '') + '.' + fractional
  } else {
    v = v.replace(/[.,]/g, '')
  }
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null
}

export function financialEvidence(doc: CanonicalDocument) {
  const listedTotal = parseSpanishMoney(doc.total_raw)
  const subtotal = parseSpanishMoney(doc.subtotal_raw)
  const tax = parseSpanishMoney(doc.tax_raw)
  const lineTotals = doc.lines.map(row => parseSpanishMoney(row.line_total_raw))
  const sumLines = lineTotals.length && lineTotals.every((v): v is number => v != null)
    ? Math.round(lineTotals.reduce((a,b) => a + b, 0) * 100) / 100 : null
  const gross = listedTotal ?? (
    subtotal != null && tax != null ? Math.round((subtotal + tax) * 100) / 100
      : sumLines
  )
  if (gross == null || gross <= 0) return null
  // Never invent a tax rate; a receipt with no reliable breakdown remains
  // a gross expense, rather than the previous implicit 10% tax assumption.
  const consistent = subtotal != null && tax != null
    && Math.abs(subtotal + tax - gross) < 0.04
  // A supplier can print one partial taxable base as 'subtotal'. Recover a
  // single valid tax band only when the ENTIRE sum of item totals plus that
  // band's rounded VAT equals the document's printed total.
  const inferredRate = !consistent && tax == null && listedTotal != null
    && sumLines != null && sumLines > 0 && subtotal != null
    && subtotal > 0 && subtotal < sumLines
    ? [4, 10, 21].find((rate) => Math.abs(
        sumLines + Math.round(sumLines * rate) / 100 - listedTotal) < 0.03) ?? null
    : null
  const inferredTax = inferredRate != null && sumLines != null
    ? Math.round((gross - sumLines) * 100) / 100 : null
  return {
    total_amount: gross,
    base_amount: consistent ? subtotal! : inferredRate != null ? sumLines! : gross,
    tax_amount: consistent ? tax! : inferredTax,
    tax_rate: consistent && subtotal! > 0
      ? Math.round((tax! / subtotal!) * 10000) / 100 : inferredRate,
    tax_unknown: !consistent && inferredRate == null,
    from_document_total: listedTotal != null,
  }
}

export function documentedInvoiceDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const date = raw.trim()
  let y: number, m: number, d: number
  const iso = date.match(/^((?:19|20)\d{2})-(\d{1,2})-(\d{1,2})$/)
  const eu = date.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-]((?:19|20)?\d{2})$/)
  if (iso) { y=+iso[1];m=+iso[2];d=+iso[3] }
  else if(eu) { d=+eu[1];m=+eu[2];y=+eu[3];if(y<100)y+=2000 }
  else return null
  const dt = new Date(Date.UTC(y,m-1,d))
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()+1!==m||dt.getUTCDate()!==d)return null
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}
