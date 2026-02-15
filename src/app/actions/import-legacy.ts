'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export type ImportResult = {
    success: boolean
    message: string
    count?: number
    errors?: string[]
}

export async function importSuppliers(data: Record<string, any>[]): Promise<ImportResult> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, message: 'Usuario no autenticado' }
    }

    const errors: string[] = []
    let successCount = 0

    for (const row of data) {
        try {
            // Basic validation
            if (!row.nombre) {
                errors.push(`Fila sin nombre: ${JSON.stringify(row)}`)
                continue
            }

            // Check if exists
            const { data: existing } = await supabase
                .from('suppliers')
                .select('id')
                .ilike('name', row.nombre)
                .maybeSingle()

            if (existing) {
                // Skip or Update? For now, skip to avoid duplicates
                errors.push(`Proveedor ya existe: ${row.nombre}`)
                continue
            }

            const { error } = await supabase.from('suppliers').insert({
                name: row.nombre,
                contact_name: row.contacto || null,
                phone: row.telefono ? String(row.telefono) : null,
                email: row.email || null,
                // Default values
                frequency: row.frecuencia_revisión || 'Semanal',
                active: true,
            })

            if (error) throw error
            successCount++
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            errors.push(`Error importando ${row.nombre}: ${message}`)
        }
    }

    revalidatePath('/dashboard/suppliers')
    return {
        success: true,
        message: `Importados ${successCount} proveedores`,
        count: successCount,
        errors,
    }
}

export async function importProducts(data: Record<string, any>[]): Promise<ImportResult> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, message: 'Usuario no autenticado' }
    }

    const errors: string[] = []
    let successCount = 0

    // Pre-fetch suppliers to map names to IDs
    const { data: suppliers } = await supabase.from('suppliers').select('id, name')
    const supplierMap = new Map(suppliers?.map((s) => [s.name.toLowerCase(), s.id]))

    for (const row of data) {
        try {
            if (!row.nombre) continue

            const supplierName = row.proveedor?.toLowerCase()
            const supplierId = supplierMap.get(supplierName)

            // Warning if supplier not found, but maybe allow null?
            if (row.proveedor && !supplierId) {
                errors.push(`Proveedor no encontrado para ${row.nombre}: ${row.proveedor}`)
                // Strategy: Create without supplier or skip? Let's skip for data integrity
                continue;
            }

            // Check existence
            const { data: existing } = await supabase
                .from('raw_materials')
                .select('id')
                .ilike('name', row.nombre)
                .maybeSingle()

            if (existing) {
                errors.push(`Producto ya existe: ${row.nombre}`);
                continue;
            }

            const { error } = await supabase.from('raw_materials').insert({
                name: row.nombre,
                major_category: row.categoría || 'General',
                supplier_id: supplierId,
                pack_price: typeof row.coste_unitario === 'number' ? row.coste_unitario : parseFloat(row.coste_unitario?.replace(',', '.') || '0'),
                pack_quantity: 1, // Default to 1 unit if not specified
                unit_measure: row.unidad_medida || 'Unidad',
                stock_min: 0,
                current_stock: 0,
                active: true,
                // Assuming simple conversion for now
                price_per_unit: typeof row.coste_unitario === 'number' ? row.coste_unitario : parseFloat(row.coste_unitario?.replace(',', '.') || '0'),
            })

            if (error) throw error
            successCount++

        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e)
            errors.push(`Error producto ${row.nombre}: ${message}`)
        }
    }

    revalidatePath('/dashboard/inventory')
    return {
        success: true,
        message: `Importados ${successCount} productos`,
        count: successCount,
        errors
    }
}

export async function importRecipes(data: Record<string, any>[]): Promise<ImportResult> {
    // Conceptual implementation - requires complex parsing of ingredients
    return { success: false, message: "Importación de recetas aún no implementada completamente." }
}
