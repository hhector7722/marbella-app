'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  type IngredientRow,
  matchIngredientCandidates,
  normalizePriceToCanonicalUnit,
  pickSuggestedCandidate,
  canonicalPurchaseUnit,
} from '@/lib/albaran-price-match'

export type ProposalCandidate = {
  id: string
  name: string
  score: number
  current_price: number
  purchase_unit: string
}

export type ProposalLine = {
  lineId: string
  extractedName: string
  cantidad: number | null
  precioUnidadRaw: number
  unidadRaw: string
  proposedPrice: number
  proposedUnit: string
  notas: string
  candidates: ProposalCandidate[]
  suggestedIngredientId: string | null
}

async function gateManager() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, message: 'No autenticado', supabase: null }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'manager' && profile?.role !== 'admin') {
    return { ok: false as const, message: 'Sin permiso (solo gestión)', supabase: null }
  }
  return { ok: true as const, supabase }
}

export async function extractAlbaranPricesFromImageAction(
  formData: FormData
): Promise<{ success: true; lines: ProposalLine[] } | { success: false; message: string }> {
  const gate = await gateManager()
  if (!gate.ok || !gate.supabase) return { success: false, message: gate.message }
  const supabase = gate.supabase

  const file = formData.get('file') as File | null
  if (!file?.size) return { success: false, message: 'Selecciona una imagen' }
  if (file.size > 10 * 1024 * 1024) return { success: false, message: 'Máximo 10 MB' }

  /** En Windows/Chrome a veces `file.type` viene vacío; inferir por extensión. */
  function inferImageMime(f: File): string {
    const t = (f.type || '').trim().toLowerCase()
    if (t.startsWith('image/')) return t
    const name = (f.name || '').toLowerCase()
    if (name.endsWith('.png')) return 'image/png'
    if (name.endsWith('.webp')) return 'image/webp'
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
    return t || 'application/octet-stream'
  }

  const mime = inferImageMime(file)
  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(mime)) {
    return {
      success: false,
      message:
        'Formato no reconocido (JPG, PNG o WebP). Si es foto de móvil, exporta como JPEG o rehaz la captura.',
    }
  }

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    return { success: false, message: 'Falta GEMINI_API_KEY en el servidor' }
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const base64 = buf.toString('base64')

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`
  const geminiPrompt = `
Eres un auditor de compras en hostelería. Analiza esta imagen de albarán o factura de proveedor.
Extrae cada línea de producto con precios. Responde SOLO JSON válido (sin markdown) con esta forma:
{
  "proveedor": "texto o vacío",
  "lineas": [
    {
      "nombre": "nombre del artículo tal como aparece",
      "cantidad": 0,
      "precio_unidad": 0.0,
      "precio_referencia_unidad": "una de: kg, g, l, ml, cl, ud (precio_unidad es € por esta unidad)",
      "total_linea": 0.0,
      "notas": "vacío o aclaración si hay duda"
    }
  ]
}
Si una línea es ilegible, omítela. Usa punto decimal.`

  const geminiPayload = {
    contents: [
      {
        parts: [
          { text: geminiPrompt },
          { inline_data: { mime_type: mime, data: base64 } },
        ],
      },
    ],
    generationConfig: { response_mime_type: 'application/json' },
  }

  const geminiRes = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geminiPayload),
  })

  if (!geminiRes.ok) {
    const errText = await geminiRes.text()
    console.error('Gemini albarán imagen:', errText)
    return { success: false, message: 'Error al interpretar la imagen (Gemini)' }
  }

  const geminiData = await geminiRes.json()
  const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
  if (rawText == null || typeof rawText !== 'string') {
    return { success: false, message: 'La IA no devolvió contenido interpretable' }
  }

  let parsed: {
    lineas?: Array<{
      nombre?: string
      cantidad?: number
      precio_unidad?: number
      precio_referencia_unidad?: string
      total_linea?: number
      notas?: string
    }>
  }
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return { success: false, message: 'Respuesta de IA no es JSON válido' }
  }

  const lineas = parsed.lineas ?? []
  if (lineas.length === 0) {
    return { success: false, message: 'No se detectaron líneas en la imagen' }
  }

  const { data: ingRows, error: ingErr } = await supabase
    .from('ingredients')
    .select('id, name, current_price, purchase_unit')
    .order('name')

  if (ingErr || !ingRows?.length) {
    return { success: false, message: ingErr?.message ?? 'No hay ingredientes en la base de datos' }
  }

  const ingredients: IngredientRow[] = ingRows.map((r) => ({
    id: r.id,
    name: r.name,
    current_price: Number(r.current_price) || 0,
    purchase_unit: r.purchase_unit ?? 'kg',
  }))

  const out: ProposalLine[] = []

  for (const line of lineas) {
    const extractedName = String(line.nombre ?? '').trim()
    if (!extractedName) continue

    const precioRaw = Number(line.precio_unidad)
    const unidadRaw = String(line.precio_referencia_unidad ?? '').trim()
    const { price: proposedPrice, unit: proposedUnit } = normalizePriceToCanonicalUnit(
      Number.isFinite(precioRaw) ? precioRaw : 0,
      unidadRaw || canonicalPurchaseUnit(unidadRaw)
    )

    const cands = matchIngredientCandidates(extractedName, ingredients)
    const enriched: ProposalCandidate[] = cands.map((c) => {
      const row = ingredients.find((i) => i.id === c.id)!
      return {
        id: c.id,
        name: c.name,
        score: c.score,
        current_price: row.current_price,
        purchase_unit: row.purchase_unit,
      }
    })

    const suggested = pickSuggestedCandidate(cands)

    out.push({
      lineId: crypto.randomUUID(),
      extractedName,
      cantidad: typeof line.cantidad === 'number' && Number.isFinite(line.cantidad) ? line.cantidad : null,
      precioUnidadRaw: Number.isFinite(precioRaw) ? precioRaw : 0,
      unidadRaw: unidadRaw || proposedUnit,
      proposedPrice: Math.round(proposedPrice * 10000) / 10000,
      proposedUnit,
      notas: String(line.notas ?? '').trim(),
      candidates: enriched,
      suggestedIngredientId: suggested,
    })
  }

  if (out.length === 0) {
    return { success: false, message: 'No quedaron líneas válidas tras el filtrado' }
  }

  return { success: true, lines: out }
}

export async function applyAlbaranPriceUpdatesAction(
  updates: {
    ingredientId: string
    pricingMode: 'per_purchase_unit' | 'per_pack'
    // per_purchase_unit: current_price; per_pack: pack_price
    price: number
    purchaseUnit: string
    packUnits?: number | null
    packUnitSizeQty?: number | null
    packUnitSizeUnit?: string | null
  }[]
): Promise<{ success: boolean; message: string; applied?: number; errors?: string[] }> {
  const gate = await gateManager()
  if (!gate.ok || !gate.supabase) return { success: false, message: gate.message }
  const supabase = gate.supabase

  if (!updates?.length) {
    return { success: false, message: 'Nada que aplicar' }
  }

  const errors: string[] = []
  let applied = 0

  for (const u of updates) {
    if (!u.ingredientId) continue
    const price = Number(u.price)
    if (!Number.isFinite(price) || price < 0) {
      errors.push(`Precio inválido para ingrediente ${u.ingredientId}`)
      continue
    }
    const unit = String(u.purchaseUnit || 'kg').trim().toLowerCase()
    const allowed = ['kg', 'g', 'l', 'ml', 'cl', 'ud']
    const pu = allowed.includes(unit) ? unit : 'kg'

    const pricingMode = u.pricingMode === 'per_pack' ? 'per_pack' : 'per_purchase_unit'

    const payload: Record<string, any> = {
      purchase_unit: pu,
      unit_type: pu,
      updated_at: new Date().toISOString(),
      supplier_pricing_mode: pricingMode,
    }

    if (pricingMode === 'per_pack') {
      payload.pack_price = price
      payload.pack_units = u.packUnits ?? null
      payload.pack_unit_size_qty = u.packUnitSizeQty ?? null
      payload.pack_unit_size_unit = u.packUnitSizeUnit ?? null
      // current_price lo deriva el trigger en BD
    } else {
      payload.current_price = price
      payload.pack_price = null
      payload.pack_units = null
      payload.pack_unit_size_qty = null
      payload.pack_unit_size_unit = null
    }

    const { error } = await supabase.from('ingredients').update(payload).eq('id', u.ingredientId)

    if (error) {
      errors.push(`${u.ingredientId}: ${error.message}`)
    } else {
      applied++
    }
  }

  revalidatePath('/ingredients')
  revalidatePath('/dashboard/albaranes-precios')

  return {
    success: applied > 0,
    message:
      applied > 0
        ? `Actualizados ${applied} ingrediente(s)`
        : 'No se aplicó ningún cambio',
    applied,
    errors: errors.length ? errors : undefined,
  }
}
