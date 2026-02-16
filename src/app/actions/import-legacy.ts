'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export type ImportResult = {
    success: boolean
    message: string
    count?: number
    errors?: string[]
}

// Utility to convert Excel serial date to JS Date
function excelDateToJSDate(serial: number) {
    const utc_days = Math.floor(serial - 25569)
    const utc_value = utc_days * 86400
    const date_info = new Date(utc_value * 1000)

    const fractional_day = serial - Math.floor(serial) + 0.0000001
    let total_seconds = Math.floor(86400 * fractional_day)

    const seconds = total_seconds % 60
    total_seconds -= seconds

    const hours = Math.floor(total_seconds / (60 * 60))
    const minutes = Math.floor(total_seconds / 60) % 60

    return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds)
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

    // Data structures for bulk operations
    const logsToInsertMap = new Map<string, any>()
    const snapshotsToUpsertMap = new Map<string, any>()

    // Process data locally first
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

            // Handle numeric Excel dates
            const clockIn = typeof clockInRaw === 'number'
                ? excelDateToJSDate(clockInRaw)
                : new Date(clockInRaw)

            const clockOut = clockOutRaw
                ? (typeof clockOutRaw === 'number' ? excelDateToJSDate(clockOutRaw) : new Date(clockOutRaw))
                : null

            if (isNaN(clockIn.getTime())) {
                errors.push(`Formato de fecha inválido (entrada) para ${empIdentifier}: ${clockInRaw}`)
                continue
            }

            let totalHours = 0
            if (clockOut && !isNaN(clockOut.getTime())) {
                totalHours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60)
            }

            // Prepare Snapshot data
            const dateObj = new Date(clockIn)
            const dateStr = dateObj.toISOString().split('T')[0]
            const day = dateObj.getDay()
            const diffToMonday = dateObj.getDate() - day + (day === 0 ? -6 : 1)
            const weekStart = new Date(dateObj.setDate(diffToMonday))
            weekStart.setHours(0, 0, 0, 0)
            const weekStartStr = weekStart.toISOString().split('T')[0]

            const snapshotKey = `${profile.id}-${weekStartStr}`
            snapshotsToUpsertMap.set(snapshotKey, {
                user_id: profile.id,
                week_start: weekStartStr,
                contracted_hours_snapshot: contractHours,
                week_end: new Date(new Date(weekStart).setDate(weekStart.getDate() + 6)).toISOString().split('T')[0]
            })

            // Deduplicate Log data (one shift per day per user)
            const logKey = `${profile.id}-${dateStr}`
            const newLog = {
                user_id: profile.id,
                clock_in: clockIn.toISOString(),
                clock_out: clockOut ? clockOut.toISOString() : null,
                total_hours: totalHours > 0 ? totalHours : null,
                is_manual_entry: true
            }

            if (logsToInsertMap.has(logKey)) {
                // Keep the record with more hours if a duplicate exists for the same day in the CSV
                const existing = logsToInsertMap.get(logKey)
                if ((newLog.total_hours || 0) > (existing.total_hours || 0)) {
                    logsToInsertMap.set(logKey, newLog)
                }
            } else {
                logsToInsertMap.set(logKey, newLog)
                successCount++
            }

        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e)
            errors.push(`Error procesando fila para ${row.empleado}: ${message}`)
        }
    }

    const logsToInsert = Array.from(logsToInsertMap.values())

    // Execute Bulk Operations
    if (snapshotsToUpsertMap.size > 0) {
        const { error: snapshotError } = await supabase
            .from('weekly_snapshots')
            .upsert(Array.from(snapshotsToUpsertMap.values()), { onConflict: 'user_id, week_start' })

        if (snapshotError) {
            errors.push(`Error masivo actualizando horas de contrato: ${snapshotError.message}`)
        }
    }

    if (logsToInsert.length > 0) {
        // OVERWRITE LOGIC: Delete existing logs for the days we are importing
        // Since logsToInsert is now deduplicated by day, this runs once per day/user
        for (const log of logsToInsert) {
            const dateStr = log.clock_in.split('T')[0]
            await supabase
                .from('time_logs')
                .delete()
                .eq('user_id', log.user_id)
                .gte('clock_in', `${dateStr}T00:00:00`)
                .lte('clock_in', `${dateStr}T23:59:59`)
        }

        // Now perform the insert
        const { error: logError } = await supabase
            .from('time_logs')
            .insert(logsToInsert)

        if (logError) {
            errors.push(`Error masivo insertando registros: ${logError.message}`)
            successCount = 0
        }
    }

    revalidatePath('/dashboard/labor')
    revalidatePath('/staff/history')
    revalidatePath('/dashboard')

    return {
        success: true,
        message: `Importados ${successCount} registros de fichaje`,
        count: successCount,
        errors
    }
}

export async function importInitialMovements(data: Record<string, any>[]): Promise<ImportResult> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, message: 'Usuario no autenticado' }
    }

    const { data: opBox } = await supabase
        .from('cash_boxes')
        .select('id')
        .eq('type', 'operational')
        .maybeSingle()

    if (!opBox) {
        return { success: false, message: 'No se encontró la caja operativa' }
    }

    const errors: string[] = []
    let successCount = 0

    // Deduplicate or process sequentially to ensure triggers update balance correctly
    // However, the request specifically asks to respect the date.
    for (const row of data) {
        try {
            // Normalizar acceso a columnas (insensible a mayúsculas)
            const getVal = (keys: string[]) => {
                for (const k of keys) {
                    if (row[k] !== undefined && row[k] !== null) return row[k]
                    // Buscar coincidencia insensible
                    const foundKey = Object.keys(row).find(rk => rk.toLowerCase() === k.toLowerCase())
                    if (foundKey) return row[foundKey]
                }
                return undefined
            }

            const fechaRaw = getVal(['fecha', 'date', 'created_at'])
            const importeRaw = getVal(['importe', 'amount', 'total'])
            const tipoRaw = getVal(['tipo', 'type', 'tipo entrada o salida', 'tipo_movimiento'])
            const notasRaw = getVal(['notas', 'notes', 'concepto', 'description'])

            if (fechaRaw === undefined || importeRaw === undefined || tipoRaw === undefined) {
                errors.push(`Fila incompleta (faltan columnas críticas): ${JSON.stringify(row)}`)
                continue
            }

            const fecha = typeof fechaRaw === 'number' ? excelDateToJSDate(fechaRaw) : new Date(fechaRaw)
            if (isNaN(fecha.getTime())) {
                errors.push(`Fecha inválida: ${fechaRaw}`)
                continue
            }

            const amount = typeof importeRaw === 'number' ? importeRaw : parseFloat(String(importeRaw).replace(',', '.'))
            if (isNaN(amount)) {
                errors.push(`Importe inválido: ${importeRaw}`)
                continue
            }

            const typeNormalized = String(tipoRaw).toLowerCase()
            const type = typeNormalized.includes('entrada') || typeNormalized === 'in' || typeNormalized.includes('ingreso') ? 'IN' : 'OUT'

            const { error } = await supabase.from('treasury_log').insert({
                box_id: opBox.id,
                type,
                amount: Math.abs(amount),
                notes: notasRaw || 'Importación inicial',
                created_at: fecha.toISOString(),
                user_id: user.id
            })

            if (error) throw error
            successCount++
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e)
            errors.push(`Error en fila: ${message}`)
        }
    }

    revalidatePath('/dashboard/movements')
    revalidatePath('/dashboard')

    return {
        success: true,
        message: `Importados ${successCount} movimientos de caja`,
        count: successCount,
        errors
    }
}
