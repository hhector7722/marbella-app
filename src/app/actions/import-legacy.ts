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

export async function importLogs(data: Record<string, any>[]): Promise<ImportResult> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, message: 'Usuario no autenticado' }
    }

    const errors: string[] = []
    let successCount = 0

    // Pre-fetch all profiles to map names to user_ids
    const { data: profiles } = await supabase.from('profiles').select('id, first_name, email')
    if (!profiles) return { success: false, message: 'No se pudieron cargar los perfiles de usuario' }

    // Helper to find profile by name or email
    const findProfile = (identifier: string) => {
        const idLower = identifier.trim().toLowerCase()
        return profiles.find(p =>
            p.first_name.toLowerCase() === idLower ||
            (p.email && p.email.toLowerCase() === idLower)
        )
    }

    // Process data
    for (const row of data) {
        try {
            const empIdentifier = row.empleado || row.worker || row.nombre
            if (!empIdentifier) {
                errors.push(`Fila omitida: Falta identificador de empleado`)
                continue
            }

            const profile = findProfile(String(empIdentifier))
            if (!profile) {
                errors.push(`Empleado no encontrado: ${empIdentifier}`)
                continue
            }

            const clockInRaw = row.entrada || row.clock_in || row.inicio
            const clockOutRaw = row.salida || row.clock_out || row.fin
            const contractHours = parseFloat(row.horas_contrato || row.contract_hours || '40')

            if (!clockInRaw) {
                errors.push(`Falta hora de entrada para ${empIdentifier}`)
                continue
            }

            const clockIn = new Date(clockInRaw)
            const clockOut = clockOutRaw ? new Date(clockOutRaw) : null

            if (isNaN(clockIn.getTime())) {
                errors.push(`Formato de fecha inválido (entrada) para ${empIdentifier}: ${clockInRaw}`)
                continue
            }

            let totalHours = 0
            if (clockOut && !isNaN(clockOut.getTime())) {
                totalHours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60)
            }

            // 1. Upsert Weekly Snapshot with contract hours for the week
            // We use the same get_iso_week_start logic to ensure consistency
            // Note: Since we don't have get_iso_week_start in JS easily available here 
            // without duplicating, we'll use a simple Monday-based week start.
            const dateObj = new Date(clockIn)
            const day = dateObj.getDay()
            const diffToMonday = dateObj.getDate() - day + (day === 0 ? -6 : 1)
            const weekStart = new Date(dateObj.setDate(diffToMonday))
            weekStart.setHours(0, 0, 0, 0)
            const weekStartStr = weekStart.toISOString().split('T')[0]

            // Insert/Update snapshot to set the historical contract hours
            const { error: snapshotError } = await supabase
                .from('weekly_snapshots')
                .upsert({
                    user_id: profile.id,
                    week_start: weekStartStr,
                    contracted_hours_snapshot: contractHours,
                    // Minimal fields, the trigger/recalc action will populate the rest if needed
                    week_end: new Date(new Date(weekStart).setDate(weekStart.getDate() + 6)).toISOString().split('T')[0]
                }, { onConflict: 'user_id, week_start' })

            if (snapshotError) {
                errors.push(`Error actualizando horas de contrato para ${empIdentifier}: ${snapshotError.message}`)
            }

            // 2. Insert Time Log
            const { error: logError } = await supabase.from('time_logs').insert({
                user_id: profile.id,
                clock_in: clockIn.toISOString(),
                clock_out: clockOut ? clockOut.toISOString() : null,
                total_hours: totalHours > 0 ? totalHours : null,
                is_manual_entry: true,
                status: clockOut ? 'completed' : 'active'
            })

            if (logError) throw logError
            successCount++

        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e)
            errors.push(`Error importando registro para ${row.empleado}: ${message}`)
        }
    }

    revalidatePath('/dashboard/labor')
    revalidatePath('/staff/history')

    return {
        success: true,
        message: `Importados ${successCount} registros de fichaje`,
        count: successCount,
        errors
    }
}
