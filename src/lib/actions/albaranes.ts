'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { buildIngredientPriceOnlyPatch } from '@/lib/ingredient-price-sync'
import { convertToPurchaseUnitQuantity } from '@/lib/recipe-cost'

export async function confirmarMapeoAction(formData: FormData) {
  const supabase = await createClient()

  const lineId             = formData.get('lineId') as string
  const supplierIdRaw      = formData.get('supplierId') as string | null
  const originalName       = formData.get('originalName') as string
  const ingredientId       = formData.get('ingredientId') as string
  const conversionFactor   = parseFloat(formData.get('conversionFactor') as string || '1')
  const lineBillingUnit    = formData.get('lineBillingUnit') as string | null
  const lineContentQtyRaw  = formData.get('lineContentQty') as string | null
  const lineContentQty     = lineContentQtyRaw ? parseFloat(lineContentQtyRaw) : null
  const lineContentUnit    = formData.get('lineContentUnit') as string | null

  const supplierIdParsed = supplierIdRaw != null && supplierIdRaw.trim() !== ''
    ? parseInt(supplierIdRaw, 10)
    : null
  if (supplierIdParsed != null && (isNaN(supplierIdParsed) || supplierIdParsed < 0)) {
    throw new Error('ID de proveedor inválido')
  }

  // Fetch línea y ingrediente — base_unit añadido al select
  const [lineRes, ingRes] = await Promise.all([
    supabase
      .from('purchase_invoice_lines')
      .select('unit_price, quantity')
      .eq('id', lineId)
      .single(),
    supabase
      .from('ingredients')
      .select(
        'current_price, unit, purchase_unit, base_unit, price_locked, supplier_pricing_mode, pack_price, pack_units, pack_unit_size_qty, pack_unit_size_unit'
      )
      .eq('id', ingredientId)
      .single(),
  ])
  if (lineRes.error || !lineRes.data) throw new Error('Error obteniendo la línea del albarán')
  if (ingRes.error || !ingRes.data)   throw new Error('Error obteniendo el ingrediente base')

  const unitPrice           = lineRes.data.unit_price  ?? 0
  const lineQuantity        = lineRes.data.quantity    ?? 0
  const oldPrice            = ingRes.data.current_price ?? 0
  const ingredientPurchaseUnit = ingRes.data.purchase_unit || 'ud'
  const ingredientBaseUnit  = ingRes.data.base_unit    || 'ud'   // SSOT de stock
  const priceLocked         = (ingRes.data as { price_locked?: boolean }).price_locked === true

  // ── 1. Crear / actualizar mapeo permanente ────────────────────────────────
  const { error: mapError } = await supabase
    .from('supplier_item_mappings')
    .upsert({
      supplier_id:        supplierIdParsed,
      supplier_item_name: originalName,
      ingredient_id:      ingredientId,
      conversion_factor:  conversionFactor,
      line_billing_unit:  lineBillingUnit,
      line_content_qty:   lineContentQty,
      line_content_unit:  lineContentUnit,
    }, { onConflict: 'supplier_id,supplier_item_name' })
  if (mapError) throw new Error(`Error en mapeo: ${mapError.message}`)

  // ── 2. Actualizar precio en purchase_unit (sin cambios respecto al original) ──
  if (!priceLocked) {
    const { data: newPrice, error: rpcErr } = await supabase.rpc(
      'invoice_line_price_to_purchase_unit',
      {
        p_unit_price:               unitPrice,
        p_mapping_content_qty:      lineContentQty,
        p_mapping_content_unit:     lineContentUnit,
        p_ingredient_purchase_unit: ingredientPurchaseUnit,
        p_fallback_factor:          conversionFactor,
      }
    )
    if (rpcErr || newPrice == null)
      throw new Error('Descuadre dimensional: No se puede convertir a la unidad base de la receta.')

    const pricePatch = buildIngredientPriceOnlyPatch(ingRes.data as any, Number(newPrice), (qty, from, to) =>
      convertToPurchaseUnitQuantity(qty, from, to)
    )
    if (pricePatch) {
      const { error: histError } = await supabase
        .from('ingredient_price_history')
        .insert({
          ingredient_id: ingredientId,
          old_price: oldPrice,
          new_price: pricePatch.current_price ?? Number(newPrice),
        })
      if (histError) throw new Error(`Error en historial de precios: ${histError.message}`)

      const { error: updIngError } = await supabase.from('ingredients').update(pricePatch).eq('id', ingredientId)
      if (updIngError) throw new Error(`Error actualizando precio base: ${updIngError.message}`)
    }
  }

  if (supplierIdParsed != null) {
    await supabase
      .from('supplier_item_mappings')
      .update({ last_known_price: unitPrice })
      .eq('supplier_id', supplierIdParsed)
      .eq('supplier_item_name', originalName)
  }

  // ── 3. Inyección en Ledger en base_unit ───────────────────────────────────
  //
  // Paso A: calcular cantidad en purchase_unit
  //   · Modo tríada: lineQuantity × convert(lineContentQty, lineContentUnit → purchaseUnit)
  //   · Modo factor: lineQuantity × conversionFactor  (factor ya está en purchase_unit)
  //
  // Paso B: convertir purchase_unit → base_unit
  //   · Ej: 4.5 L → 4500 ml | 250 kg → 250000 g | 10 ud → 10 ud

  let qtyInPurchaseUnit: number | null = null

  if (lineContentQty != null && lineContentQty > 0 && lineContentUnit) {
    // Modo tríada dimensional
    const contentConverted = convertToPurchaseUnitQuantity(
      lineContentQty,
      lineContentUnit,
      ingredientPurchaseUnit
    )
    if (contentConverted != null) {
      qtyInPurchaseUnit = lineQuantity * contentConverted
    }
  } else {
    // Modo factor escalar
    qtyInPurchaseUnit = lineQuantity * conversionFactor
  }

  if (qtyInPurchaseUnit != null && qtyInPurchaseUnit > 0) {
    // Paso B: purchase_unit → base_unit
    const qtyInBaseUnit = convertToPurchaseUnitQuantity(
      qtyInPurchaseUnit,
      ingredientPurchaseUnit,
      ingredientBaseUnit
    )

    if (qtyInBaseUnit == null || qtyInBaseUnit <= 0) {
      // Conversión imposible (dimensiones incompatibles sin pack bridge).
      // El trigger de BD también lo ignoraría. Lanzar error descriptivo.
      throw new Error(
        `No se puede convertir ${ingredientPurchaseUnit} → ${ingredientBaseUnit} ` +
        `para el ingrediente. Revisa la unidad de compra del ingrediente.`
      )
    }

    const ref = `ALB-LINE-${lineId}`
    const { data: existing, error: existingErr } = await supabase
      .from('stock_movements')
      .select('id')
      .eq('movement_type', 'PURCHASE')
      .eq('ingredient_id', ingredientId)
      .eq('reference_doc', ref)
      .limit(1)
      .maybeSingle()
    if (existingErr) throw new Error(`Error comprobando stock existente: ${existingErr.message}`)

    if (!existing?.id) {
      const descUnit = lineBillingUnit
        ? `${lineBillingUnit} de ${lineContentQty}${lineContentUnit}`
        : `Factor: ${conversionFactor}`

      const { error: ledgerError } = await supabase.from('stock_movements').insert({
        movement_type:        'PURCHASE',
        ingredient_id:        ingredientId,
        quantity:             qtyInBaseUnit,      // ← en base_unit
        unit:                 ingredientBaseUnit, // ← ml | g | ud
        reference_doc:        ref,
        original_description: `Recepción: ${originalName} (${descUnit})`,
        processed_by:         'Consolidación UI',
      })
      if (ledgerError) throw new Error(`Error inyectando stock: ${ledgerError.message}`)
    }
  }

  // ── 4. Cerrar línea del albarán ───────────────────────────────────────────
  const { error: lineError } = await supabase
    .from('purchase_invoice_lines')
    .update({ mapped_ingredient_id: ingredientId, status: 'mapped' })
    .eq('id', lineId)
  if (lineError) throw new Error(`Error cerrando línea: ${lineError.message}`)

  revalidatePath('/dashboard')
}
