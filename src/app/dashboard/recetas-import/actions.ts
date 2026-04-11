'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { elaborationPresentationToDb, parseQuantityAndUnit } from '@/lib/recipe-import-shared'

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

function inferDocumentMime(file: File): string {
  const t = (file.type || '').trim().toLowerCase()
  if (t === 'application/pdf' || t.startsWith('image/')) return t
  const n = (file.name || '').toLowerCase()
  if (n.endsWith('.pdf')) return 'application/pdf'
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.webp')) return 'image/webp'
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg'
  return t || 'application/octet-stream'
}

export type ExtractedIngredientLine = {
  nombre: string
  cantidad: number
  unidad: string
}

export type ExtractedRecipeProposal = {
  proposalId: string
  nombre: string
  categoria: string
  precio_barra: number
  precio_pavello: number
  raciones: number
  elaboracion: string
  presentacion: string
  ingredientes: ExtractedIngredientLine[]
}

export async function extractRecipesFromDocumentAction(
  formData: FormData
): Promise<{ success: true; recipes: ExtractedRecipeProposal[] } | { success: false; message: string }> {
  const gate = await gateManager()
  if (!gate.ok || !gate.supabase) return { success: false, message: gate.message }

  const file = formData.get('file') as File | null
  if (!file?.size) return { success: false, message: 'Selecciona un archivo' }
  if (file.size > 12 * 1024 * 1024) return { success: false, message: 'Máximo 12 MB' }

  const mime = inferDocumentMime(file)
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(mime)) {
    return { success: false, message: 'Usa PDF, JPG, PNG o WebP' }
  }

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    return { success: false, message: 'Falta GEMINI_API_KEY en el servidor' }
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const base64 = buf.toString('base64')

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`
  const geminiPrompt = `
Eres un jefe de cocina digitalizando fichas de recetas.
Analiza el documento (PDF o imagen) y extrae TODAS las recetas que aparezcan.
Responde SOLO JSON válido (sin markdown) con esta forma exacta:
{
  "recetas": [
    {
      "nombre": "nombre del plato (obligatorio)",
      "categoria": "texto o vacío",
      "precio_barra": 0,
      "precio_pavello": 0,
      "raciones": 1,
      "elaboracion": "pasos de elaboración en un solo texto con saltos de línea entre pasos, o array de strings",
      "presentacion": "texto de emplatado / presentación",
      "ingredientes": [
        { "nombre": "ingrediente como en almacén", "cantidad": 0, "unidad": "kg|g|l|ml|ud" }
      ]
    }
  ]
}
Si un precio no aparece, usa 0. Si no hay ingredientes en una receta, ingredientes: [].
Si no hay elaboración o presentación, usa "".
Usa punto decimal para números.`

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
    console.error('Gemini recetas documento:', errText)
    return { success: false, message: 'Error al leer el documento (Gemini)' }
  }

  const geminiData = await geminiRes.json()
  const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
  if (rawText == null || typeof rawText !== 'string') {
    return { success: false, message: 'La IA no devolvió contenido interpretable' }
  }

  let parsed: {
    recetas?: Array<{
      nombre?: string
      categoria?: string
      precio_barra?: number
      precio_pavello?: number
      raciones?: number
      elaboracion?: unknown
      presentacion?: unknown
      ingredientes?: Array<{ nombre?: string; cantidad?: number; unidad?: string }>
    }>
  }
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return { success: false, message: 'Respuesta de IA no es JSON válido' }
  }

  const rawList = parsed.recetas ?? []
  if (rawList.length === 0) {
    return { success: false, message: 'No se detectaron recetas en el documento' }
  }

  const recipes: ExtractedRecipeProposal[] = []

  for (const r of rawList) {
    const nombre = String(r.nombre ?? '').trim()
    if (!nombre) continue

    const ingLines: ExtractedIngredientLine[] = []
    for (const ing of r.ingredientes ?? []) {
      const iname = String(ing?.nombre ?? '').trim()
      if (!iname) continue
      const cantidad = Number(ing?.cantidad)
      const unidad = String(ing?.unidad ?? 'kg').trim() || 'kg'
      ingLines.push({
        nombre: iname,
        cantidad: Number.isFinite(cantidad) ? cantidad : 0,
        unidad,
      })
    }

    recipes.push({
      proposalId: crypto.randomUUID(),
      nombre,
      categoria: String(r.categoria ?? '').trim() || 'Principales',
      precio_barra: Number.isFinite(Number(r.precio_barra)) ? Number(r.precio_barra) : 0,
      precio_pavello: Number.isFinite(Number(r.precio_pavello)) ? Number(r.precio_pavello) : 0,
      raciones: Math.max(1, Math.round(Number(r.raciones) || 1)),
      elaboracion: elaborationPresentationToDb(r.elaboracion),
      presentacion: elaborationPresentationToDb(r.presentacion),
      ingredientes: ingLines,
    })
  }

  if (recipes.length === 0) {
    return { success: false, message: 'No quedaron recetas con nombre válido' }
  }

  return { success: true, recipes }
}

export type ValidatedRecipePayload = {
  nombre: string
  categoria: string
  sale_price: number
  sales_price_pavello: number
  servings: number
  elaboration: string
  presentation: string
  has_half_ration: boolean
  ingredientes: { nombre: string; cantidad: number; unidad: string }[]
}

export async function applyValidatedRecipesAction(
  items: ValidatedRecipePayload[]
): Promise<{ success: boolean; message: string; count?: number; errors?: string[] }> {
  const gate = await gateManager()
  if (!gate.ok || !gate.supabase) return { success: false, message: gate.message }
  const supabase = gate.supabase

  if (!items?.length) {
    return { success: false, message: 'Nada que importar' }
  }

  const { data: ingredientRows, error: ingErr } = await supabase.from('ingredients').select('id, name')
  if (ingErr || !ingredientRows?.length) {
    return { success: false, message: ingErr?.message ?? 'No hay ingredientes en la base de datos' }
  }

  const ingredientMap = new Map<string, string>()
  for (const ing of ingredientRows) {
    ingredientMap.set(String(ing.name).toLowerCase().trim(), ing.id)
  }

  const errors: string[] = []
  let successCount = 0

  for (const item of items) {
    const recipeName = String(item.nombre ?? '').trim()
    if (!recipeName) {
      errors.push('Receta sin nombre (omitida)')
      continue
    }

    try {
      const { data: existing } = await supabase.from('recipes').select('id').ilike('name', recipeName).maybeSingle()
      if (existing) {
        errors.push(`Ya existe: ${recipeName}`)
        continue
      }

      let servings = Math.max(1, Math.round(Number(item.servings) || 1))
      const insertPayload = {
        name: recipeName,
        category: String(item.categoria || 'Principales').trim() || 'Principales',
        sale_price: Number(item.sale_price) || 0,
        sales_price_pavello: Number(item.sales_price_pavello) || 0,
        servings,
        elaboration: String(item.elaboration ?? ''),
        presentation: String(item.presentation ?? ''),
        has_half_ration: Boolean(item.has_half_ration),
        sale_price_half: 0,
        sale_price_half_pavello: 0,
        target_food_cost_pct: 30,
      }

      const { data: newRecipe, error: recipeError } = await supabase
        .from('recipes')
        .insert(insertPayload as never)
        .select('id')
        .single()

      if (recipeError) throw new Error(recipeError.message)
      if (!newRecipe?.id) throw new Error('Inserción sin id')

      const linesToInsert: {
        recipe_id: string
        ingredient_id: string
        quantity_gross: number
        quantity_half: number
        unit: string
      }[] = []
      const missing: string[] = []

      for (const line of item.ingredientes ?? []) {
        const ingName = String(line.nombre ?? '').trim()
        if (!ingName) continue
        const id = ingredientMap.get(ingName.toLowerCase())
        if (!id) {
          missing.push(ingName)
          continue
        }
        const qtyUnit = parseQuantityAndUnit(line.cantidad, line.unidad)
        if (!qtyUnit) {
          errors.push(`${recipeName}: cantidad inválida para "${ingName}"`)
          continue
        }
        const { qty, unit } = qtyUnit
        const unitDb = unit === 'ud' ? 'ud' : unit
        linesToInsert.push({
          recipe_id: newRecipe.id,
          ingredient_id: id,
          quantity_gross: qty,
          quantity_half: qty / 2,
          unit: unitDb,
        })
      }

      if (linesToInsert.length > 0) {
        const { error: riError } = await supabase.from('recipe_ingredients').insert(linesToInsert)
        if (riError) throw new Error(riError.message)
      }

      if (missing.length > 0) {
        errors.push(`${recipeName}: ingredientes no encontrados (omitidos): ${[...new Set(missing)].join(', ')}`)
      }

      successCount++
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`${recipeName}: ${msg}`)
    }
  }

  revalidatePath('/recipes')
  revalidatePath('/dashboard/recetas-import')

  return {
    success: successCount > 0,
    message:
      successCount > 0
        ? `Importadas ${successCount} receta(s)`
        : 'No se importó ninguna receta',
    count: successCount,
    errors: errors.length ? errors : undefined,
  }
}
