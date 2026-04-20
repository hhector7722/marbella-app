'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { isProbablyCatalan, parseNum, parseQuantityAndUnit } from '@/lib/recipe-import-shared'

export type ImportStep = 'suppliers' | 'products' | 'recipes' | 'logs' | 'treasury'

export type ImportResult = {
    success: boolean
    message: string
    count?: number
    errors?: string[]
}

export type ImportMeta = {
    fileName?: string | null
    fileHashSha256?: string | null
}

export type ImportRecipesOptions = {
    overwriteExisting?: boolean
}

type ImportRunRow = {
    step: ImportStep
    file_name: string | null
    file_hash_sha256: string | null
    created_at: string
    success: boolean
    record_count: number | null
    result_message: string | null
}

export type ImportRunsQuery = {
    step?: ImportStep | 'all'
    limit?: number
    offset?: number
}

async function logImportRun(params: {
    supabase: Awaited<ReturnType<typeof createClient>>
    userId: string
    step: ImportStep
    meta?: ImportMeta
    result: ImportResult
}) {
    const { supabase, userId, step, meta, result } = params

    const errorsJson = Array.isArray(result.errors) ? result.errors : []

    const { error } = await supabase.from('import_runs').insert({
        user_id: userId,
        step,
        file_name: meta?.fileName ?? null,
        file_hash_sha256: meta?.fileHashSha256 ?? null,
        record_count: result.count ?? null,
        success: !!result.success,
        result_message: result.message ?? null,
        errors: errorsJson,
    })

    if (error) {
        throw new Error(`No se pudo registrar el historial de importación: ${error.message}`)
    }
}

export async function getLatestImportRuns(): Promise<{ success: true; runs: Partial<Record<ImportStep, ImportRunRow>> } | { success: false; message: string }> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { success: false, message: 'Usuario no autenticado' }

    const { data, error } = await supabase
        .from('import_runs')
        .select('step, file_name, file_hash_sha256, created_at, success, record_count, result_message')
        .order('created_at', { ascending: false })
        .limit(50)

    if (error) return { success: false, message: error.message }

    const runs: Partial<Record<ImportStep, ImportRunRow>> = {}
    for (const row of (data ?? []) as unknown as ImportRunRow[]) {
        const step = row.step
        if (!runs[step]) runs[step] = row
    }

    return { success: true, runs }
}

export async function translateCaToEsIfNeeded(text: string): Promise<string> {
    const cleaned = String(text ?? '').trim()
    if (!cleaned) return ''
    if (!isProbablyCatalan(cleaned)) return cleaned

    const geminiKey = process.env.GEMINI_API_KEY
    if (!geminiKey) {
        // No rompemos la importación: devolvemos original, pero el caller añadirá aviso.
        return cleaned
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`
    const prompt = `Traduce el siguiente texto del catalán al español. Mantén el formato (saltos de línea y viñetas). Devuelve SOLO el texto traducido, sin comillas ni markdown.\n\n${cleaned}`

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 },
    }

    const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })

    if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Gemini traducción falló: ${errText}`)
    }

    const data = await res.json()
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof out !== 'string' || !out.trim()) return cleaned
    return out.trim()
}

export async function getImportRuns(
    query: ImportRunsQuery = {}
): Promise<
    | { success: true; rows: ImportRunRow[]; total: number; limit: number; offset: number }
    | { success: false; message: string }
> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { success: false, message: 'Usuario no autenticado' }

    const limit = Math.max(1, Math.min(200, Math.floor(query.limit ?? 50)))
    const offset = Math.max(0, Math.floor(query.offset ?? 0))

    let q = supabase
        .from('import_runs')
        .select('step, file_name, file_hash_sha256, created_at, success, record_count, result_message', { count: 'exact' })
        .order('created_at', { ascending: false })

    if (query.step && query.step !== 'all') {
        q = q.eq('step', query.step)
    }

    const { data, error, count } = await q.range(offset, offset + limit - 1)
    if (error) return { success: false, message: error.message }

    return {
        success: true,
        rows: ((data ?? []) as unknown as ImportRunRow[]),
        total: count ?? 0,
        limit,
        offset,
    }
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

/** Lee la primera columna cuyo encabezado coincide (sin acentos, case-insensitive). */
function getCell(row: Record<string, unknown>, possibleKeys: string[]): unknown {
    const rowKeys = Object.keys(row)
    const norm = (s: string) =>
        s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    for (const pk of possibleKeys) {
        const foundKey = rowKeys.find((rk) => norm(rk) === norm(pk))
        if (foundKey !== undefined && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
            return row[foundKey]
        }
    }
    return undefined
}

export async function importSuppliers(data: Record<string, any>[], meta?: ImportMeta): Promise<ImportResult> {
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
    const result: ImportResult = {
        success: true,
        message: `Importados ${successCount} proveedores`,
        count: successCount,
        errors,
    }

    try {
        await logImportRun({ supabase, userId: user.id, step: 'suppliers', meta, result })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        result.errors = [...(result.errors ?? []), message]
        result.message = `${result.message} (AVISO: historial no registrado)`
    }

    return result
}

export async function importProducts(data: Record<string, any>[], meta?: ImportMeta): Promise<ImportResult> {
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
    const result: ImportResult = {
        success: true,
        message: `Importados ${successCount} productos`,
        count: successCount,
        errors
    }

    try {
        await logImportRun({ supabase, userId: user.id, step: 'products', meta, result })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        result.errors = [...(result.errors ?? []), message]
        result.message = `${result.message} (AVISO: historial no registrado)`
    }

    return result
}

export async function importRecipes(
    data: Record<string, any>[],
    meta?: ImportMeta,
    options?: ImportRecipesOptions
): Promise<ImportResult> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, message: 'Usuario no autenticado' }
    }

    if (!data?.length) {
        const result: ImportResult = { success: false, message: 'No hay filas para importar', count: 0, errors: [] }
        try {
            await logImportRun({ supabase, userId: user.id, step: 'recipes', meta, result })
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e)
            result.errors = [...(result.errors ?? []), message]
            result.message = `${result.message} (AVISO: historial no registrado)`
        }
        return result
    }

    const { data: ingredientRows, error: ingErr } = await supabase.from('ingredients').select('id, name')
    if (ingErr || !ingredientRows) {
        const result: ImportResult = { success: false, message: `No se pudieron cargar ingredientes: ${ingErr?.message ?? 'desconocido'}`, count: 0, errors: [] }
        try {
            await logImportRun({ supabase, userId: user.id, step: 'recipes', meta, result })
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e)
            result.errors = [...(result.errors ?? []), message]
            result.message = `${result.message} (AVISO: historial no registrado)`
        }
        return result
    }

    const ingredientMap = new Map<string, string>()
    for (const ing of ingredientRows) {
        const key = String(ing.name).toLowerCase().trim()
        ingredientMap.set(key, ing.id)
    }

    type GroupRow = Record<string, unknown>
    const groups = new Map<string, { displayName: string; rows: GroupRow[] }>()

    for (const row of data as GroupRow[]) {
        const nameRaw = getCell(row, [
            'nombre_receta',
            'nombre receta',
            'receta',
            'recipe_name',
            'nombre_plato',
            'nombre',
            'name',
        ])
        const recipeName = nameRaw != null ? String(nameRaw).trim() : ''
        if (!recipeName) {
            continue
        }
        const gkey = recipeName.toLowerCase()
        if (!groups.has(gkey)) {
            groups.set(gkey, { displayName: recipeName, rows: [] })
        }
        groups.get(gkey)!.rows.push(row)
    }

    const errors: string[] = []
    let successCount = 0

    const overwriteExisting = options?.overwriteExisting === true

    for (const [, { displayName: recipeName, rows }] of groups) {
        try {
            const { data: existing, error: existingErr } = await supabase
                .from('recipes')
                .select('id')
                .ilike('name', recipeName)
                .maybeSingle()
            if (existingErr) throw new Error(existingErr.message)

            const header = rows[0]
            const categoryRaw = getCell(header, ['categoria', 'category', 'categoría'])
            const saleRaw = getCell(header, ['precio_barra', 'sale_price', 'pvp', 'precio'])
            const pavRaw = getCell(header, ['precio_pavelló', 'precio_pavello', 'sales_price_pavello', 'pvp_pavello'])
            const servingsRaw = getCell(header, ['raciones', 'servings', 'comensales'])
            const elaboration = getCell(header, ['elaboration', 'elaboración', 'elaboracion', 'elaboració', 'elaboracio', 'preparacion'])
            const presentation = getCell(header, ['presentation', 'presentación', 'presentacion', 'presentació', 'presentacio'])
            const halfRaw = getCell(header, ['has_half_ration', 'media_racion', 'mitades'])

            const category = categoryRaw != null ? String(categoryRaw).trim() : ''
            const sale_price = parseNum(saleRaw) ?? 0
            const sales_price_pavello = parseNum(pavRaw) ?? 0
            let servings = Math.round(parseNum(servingsRaw) ?? 1)
            if (servings < 1) servings = 1

            const has_half_ration =
                typeof halfRaw === 'boolean'
                    ? halfRaw
                    : String(halfRaw ?? '')
                          .toLowerCase()
                          .match(/^(1|si|sí|true|yes)$/) != null

            const rawElab = elaboration != null ? String(elaboration) : ''
            const rawPres = presentation != null ? String(presentation) : ''
            let elabDb = rawElab
            let presDb = rawPres
            let translationWarn = false
            try {
                elabDb = await translateCaToEsIfNeeded(rawElab)
                presDb = await translateCaToEsIfNeeded(rawPres)
                translationWarn = (isProbablyCatalan(rawElab) || isProbablyCatalan(rawPres)) && !process.env.GEMINI_API_KEY
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e)
                errors.push(`Receta "${recipeName}": no se pudo traducir catalán→es (se guarda texto original): ${msg}`)
            }

            const insertPayload: Record<string, unknown> = {
                name: recipeName,
                category: category || 'Principales',
                sale_price,
                sales_price_pavello,
                servings,
                elaboration: elabDb,
                presentation: presDb,
                has_half_ration,
                sale_price_half: 0,
                sale_price_half_pavello: 0,
                target_food_cost_pct: 30,
            }
            if (translationWarn) {
                errors.push(`Receta "${recipeName}": parece catalán pero falta GEMINI_API_KEY; no se tradujo.`)
            }

            let recipeId: string | null = null
            if (existing?.id) {
                if (!overwriteExisting) {
                    errors.push(`Receta ya existe (omitida): ${recipeName}`)
                    continue
                }
                const { data: updatedRow, error: updErr } = await supabase
                    .from('recipes')
                    .update(insertPayload as never)
                    .eq('id', existing.id)
                    .select('id')
                    .maybeSingle()
                if (updErr) throw new Error(updErr.message)
                if (!updatedRow?.id) {
                    throw new Error(
                        'No se pudo sobreescribir la receta (0 filas actualizadas). Esto suele indicar RLS bloqueando UPDATE o falta de policy SELECT para UPDATE.'
                    )
                }
                recipeId = existing.id
            } else {
                const { data: newRecipe, error: recipeError } = await supabase
                    .from('recipes')
                    .insert(insertPayload as never)
                    .select('id')
                    .single()

                if (recipeError) throw new Error(recipeError.message)
                if (!newRecipe?.id) throw new Error('Inserción sin id')
                recipeId = newRecipe.id
            }

            const linesToInsert: {
                recipe_id: string
                ingredient_id: string
                quantity_gross: number
                quantity_half: number
                unit: string
            }[] = []
            const missing: string[] = []

            for (const row of rows) {
                const ingNameRaw = getCell(row, [
                    'ingrediente_nombre',
                    'ingrediente',
                    'ingredient',
                    'ingredient_name',
                    'producto',
                ])
                if (ingNameRaw === undefined || ingNameRaw === null || String(ingNameRaw).trim() === '') {
                    continue
                }
                const ingName = String(ingNameRaw).trim()
                const id = ingredientMap.get(ingName.toLowerCase())
                if (!id) {
                    missing.push(ingName)
                    continue
                }
                const qtyUnit = parseQuantityAndUnit(
                    getCell(row, ['cantidad', 'quantity', 'qty', 'gramos']),
                    getCell(row, ['unidad', 'unit', 'ud'])
                )
                if (!qtyUnit) {
                    errors.push(`Receta "${recipeName}": cantidad inválida o ≤0 para "${ingName}"`)
                    continue
                }
                const { qty, unit } = qtyUnit
                const unitDb = unit === 'ud' ? 'ud' : unit
                const qh = qty / 2
                linesToInsert.push({
                    recipe_id: recipeId!,
                    ingredient_id: id,
                    quantity_gross: qty,
                    quantity_half: qh,
                    unit: unitDb,
                })
            }

            if (!recipeId) throw new Error('No se pudo resolver recipeId')

            if (existing?.id && overwriteExisting) {
                const { data: beforeLines, error: beforeErr } = await supabase
                    .from('recipe_ingredients')
                    .select('id')
                    .eq('recipe_id', recipeId)
                if (beforeErr) throw new Error(beforeErr.message)

                const beforeCount = beforeLines?.length ?? 0

                const { data: deletedLines, error: delErr } = await supabase
                    .from('recipe_ingredients')
                    .delete()
                    .eq('recipe_id', recipeId)
                    .select('id')
                if (delErr) throw new Error(delErr.message)

                const deletedCount = deletedLines?.length ?? 0
                if (beforeCount > 0 && deletedCount === 0) {
                    throw new Error(
                        'No se pudieron reemplazar ingredientes (0 filas borradas). Esto suele indicar RLS bloqueando DELETE.'
                    )
                }
            }

            if (linesToInsert.length > 0) {
                const { error: riError } = await supabase.from('recipe_ingredients').insert(linesToInsert)
                if (riError) throw new Error(riError.message)
            }

            if (missing.length > 0) {
                errors.push(`Receta "${recipeName}": ingredientes no encontrados en BD (líneas omitidas): ${[...new Set(missing)].join(', ')}`)
            }

            successCount++
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e)
            errors.push(`Receta "${recipeName}": ${message}`)
        }
    }

    if (groups.size === 0) {
        const result: ImportResult = {
            success: false,
            message: 'Ninguna fila tenía nombre_receta (o equivalente) relleno.',
            count: 0,
            errors,
        }
        try {
            await logImportRun({ supabase, userId: user.id, step: 'recipes', meta, result })
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e)
            result.errors = [...(result.errors ?? []), message]
            result.message = `${result.message} (AVISO: historial no registrado)`
        }
        return result
    }

    revalidatePath('/recipes')
    const result: ImportResult = {
        success: true,
        message: `Importadas ${successCount} recetas (${groups.size} grupos detectados)`,
        count: successCount,
        errors,
    }

    try {
        await logImportRun({ supabase, userId: user.id, step: 'recipes', meta, result })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        result.errors = [...(result.errors ?? []), message]
        result.message = `${result.message} (AVISO: historial no registrado)`
    }

    return result
}

export async function importLogs(data: Record<string, any>[], meta?: ImportMeta): Promise<ImportResult> {
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

    const result: ImportResult = {
        success: true,
        message: `Importados ${successCount} registros de fichaje`,
        count: successCount,
        errors
    }

    try {
        await logImportRun({ supabase, userId: user.id, step: 'logs', meta, result })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        result.errors = [...(result.errors ?? []), message]
        result.message = `${result.message} (AVISO: historial no registrado)`
    }

    return result
}

export async function importInitialMovements(data: Record<string, any>[], meta?: ImportMeta): Promise<ImportResult> {
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
    for (const row of data) {
        try {
            // Normalizar acceso a columnas (Insensible a mayúsculas, espacios y acentos)
            const rowKeys = Object.keys(row);
            const getVal = (possibleKeys: string[]) => {
                // 1. Exact match (case insensitive)
                for (const pk of possibleKeys) {
                    const foundKey = rowKeys.find(rk =>
                        rk.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") ===
                        pk.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    );
                    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) return row[foundKey];
                }
                return undefined;
            }

            const fechaRaw = getVal(['fecha', 'date', 'created_at', 'dia', 'moment']);
            const importeRaw = getVal(['importe', 'amount', 'total', 'precio', 'valor', 'monto']);
            const tipoRaw = getVal(['tipo', 'type', 'tipo entrada o salida', 'tipo_movimiento', 'operacion']);
            const notasRaw = getVal(['notas', 'notes', 'concepto', 'description', 'detalle', 'comentario']);

            if (fechaRaw === undefined || importeRaw === undefined || tipoRaw === undefined) {
                const missing = [];
                if (fechaRaw === undefined) missing.push('fecha');
                if (importeRaw === undefined) missing.push('importe');
                if (tipoRaw === undefined) missing.push('tipo');
                errors.push(`Fila ${successCount + errors.length + 1}: Faltan columnas críticas (${missing.join(', ')}). Datos: ${JSON.stringify(row)}`);
                continue;
            }

            const fecha = typeof fechaRaw === 'number' ? excelDateToJSDate(fechaRaw) : new Date(fechaRaw);
            if (isNaN(fecha.getTime())) {
                errors.push(`Fila ${successCount + errors.length + 1}: Fecha inválida (${fechaRaw})`);
                continue;
            }

            const amount = typeof importeRaw === 'number' ? importeRaw : parseFloat(String(importeRaw).replace(',', '.'));
            if (isNaN(amount)) {
                errors.push(`Fila ${successCount + errors.length + 1}: Importe inválido (${importeRaw})`);
                continue;
            }

            const typeNormalized = String(tipoRaw).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const type = (typeNormalized.includes('entrada') || typeNormalized === 'in' || typeNormalized.includes('ingreso') || typeNormalized.includes('positivo')) ? 'IN' : 'OUT';

            const { error } = await supabase.from('treasury_log').insert({
                box_id: opBox.id,
                type,
                amount: Math.abs(amount),
                notes: notasRaw || 'Importación inicial',
                created_at: fecha.toISOString(),
                user_id: user.id
            });

            if (error) throw error;
            successCount++;
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            errors.push(`Error en fila ${successCount + errors.length + 1}: ${message}`);
        }
    }

    revalidatePath('/dashboard/movements')
    revalidatePath('/dashboard')

    const result: ImportResult = {
        success: true,
        message: `Importados ${successCount} movimientos de caja`,
        count: successCount,
        errors
    }

    try {
        await logImportRun({ supabase, userId: user.id, step: 'treasury', meta, result })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        result.errors = [...(result.errors ?? []), message]
        result.message = `${result.message} (AVISO: historial no registrado)`
    }

    return result
}
