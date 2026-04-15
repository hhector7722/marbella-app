'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { Upload, FileUp, CheckCircle, AlertCircle, ArrowRight, Save, Database } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
// import { Button } from '@/components/ui/button' // Removed
// import { Card, ... } from '@/components/ui/card' // Removed
// import { Alert, ... } from '@/components/ui/alert' // Removed
import { getImportRuns, getLatestImportRuns, importSuppliers, importProducts, importRecipes, importLogs, importInitialMovements, ImportResult, ImportStep } from '@/app/actions/import-legacy'
import { cn } from '@/lib/utils'

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', buf)
    const bytes = new Uint8Array(hash)
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

function looksLikeRecipeFichaCsv(text: string): boolean {
    const t = text.toLowerCase()
    return t.includes('ingredients;') && (t.includes('elaboració') || t.includes('elaboracio')) && t.includes('presentació')
}

function parseRecipeFichaCsvToImportRows(text: string): any[] {
    const lines = text
        .split(/\r?\n/)
        .map((l) => l.trimEnd())
        .filter((l) => l.length > 0)

    const rows = lines.map((l) => l.split(';'))

    // Nombre receta = primera celda no vacía que no sea cabecera "Ingredients"
    const firstNameRow = rows.find((r) => {
        const c0 = (r[0] ?? '').trim()
        if (!c0) return false
        const c0n = c0.toLowerCase()
        return c0n !== 'ingredients' && c0n !== 'ingredientes'
    })
    const recipeName = (firstNameRow?.[0] ?? '').trim()

    const headerIdx = rows.findIndex((r) => (r[0] ?? '').trim().toLowerCase() === 'ingredients')
    if (!recipeName || headerIdx === -1) return []

    // Ingredientes: desde después de cabecera hasta antes de "Elaboració"
    const elaborIdx = rows.findIndex((r) => (r[0] ?? '').trim().toLowerCase().startsWith('elabor'))
    const ingStart = headerIdx + 1
    const ingEnd = elaborIdx === -1 ? rows.length : elaborIdx
    const ingredientRows: Array<{ ingrediente_nombre: string; cantidad: string; unidad: string }> = []

    for (let i = ingStart; i < ingEnd; i++) {
        const r = rows[i]
        const name = (r[0] ?? '').trim()
        const unit = (r[1] ?? '').trim()
        const qty = (r[2] ?? '').trim()
        if (!name) continue
        // saltar filas separadoras
        if (name.toLowerCase() === 'ingredients') continue
        ingredientRows.push({ ingrediente_nombre: name, unidad: unit, cantidad: qty })
    }

    // Elaboración / Presentación: filas con bullets tras el separador
    let elaboration = ''
    let presentation = ''
    if (elaborIdx !== -1) {
        const elabLines: string[] = []
        const presLines: string[] = []
        for (let i = elaborIdx + 1; i < rows.length; i++) {
            const r = rows[i]
            const e = (r[0] ?? '').trim()
            const p = (r[4] ?? '').trim()
            if (e) elabLines.push(e.replace(/^[•‣\-\s]+/, '').trim())
            if (p) presLines.push(p.replace(/^[•‣\-\s]+/, '').trim())
        }
        elaboration = elabLines.filter(Boolean).join('\n')
        presentation = presLines.filter(Boolean).join('\n')
    }

    const base = {
        nombre_receta: recipeName,
        // claves que importRecipes ya reconoce
        'elaboración': elaboration,
        'presentación': presentation,
    }

    if (ingredientRows.length === 0) {
        return [base]
    }

    return ingredientRows.map((ir, idx) => ({
        ...base,
        ingrediente_nombre: ir.ingrediente_nombre,
        cantidad: ir.cantidad,
        unidad: ir.unidad,
        // solo por ahorrar payload; pero seguimos poniendo el texto en la primera fila del grupo
        ...(idx === 0 ? {} : { 'elaboración': '', 'presentación': '' }),
    }))
}

export default function ImportPage() {
    const [currentStep, setCurrentStep] = useState<ImportStep>('suppliers')
    const [fileData, setFileData] = useState<any[]>([])
    const [fileName, setFileName] = useState<string | null>(null)
    const [fileHashSha256, setFileHashSha256] = useState<string | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [importResult, setImportResult] = useState<ImportResult | null>(null)
    const [latestRuns, setLatestRuns] = useState<Partial<Record<ImportStep, { file_name: string | null; created_at: string; success: boolean; record_count: number | null }>>>({})
    const [historyIsOpen, setHistoryIsOpen] = useState(true)
    const [historyLoading, setHistoryLoading] = useState(false)
    const [historyRows, setHistoryRows] = useState<Array<{ file_name: string | null; created_at: string; success: boolean; record_count: number | null; file_hash_sha256: string | null; result_message: string | null }>>([])
    const [historyTotal, setHistoryTotal] = useState(0)
    const [historyOffset, setHistoryOffset] = useState(0)
    const historyLimit = 50

    const steps: { id: ImportStep; label: string; description: string }[] = [
        { id: 'suppliers', label: '1. Proveedores', description: 'Base de datos de proveedores' },
        { id: 'products', label: '2. Productos', description: 'Ingredientes y materias primas' },
        { id: 'recipes', label: '3. Recetas', description: 'Escandallo de platos' },
        { id: 'logs', label: '4. Histórico', description: 'Registros antiguos' },
        { id: 'treasury', label: '5. Tesorería', description: 'Movimientos de caja' },
    ]

    const lastRunForStep = useMemo(() => {
        return latestRuns[currentStep] ?? null
    }, [latestRuns, currentStep])

    useEffect(() => {
        let cancelled = false
        const load = async () => {
            const res = await getLatestImportRuns()
            if (!cancelled) {
                if (res.success) setLatestRuns(res.runs as any)
            }
        }
        load()
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        let cancelled = false

        const loadHistory = async () => {
            setHistoryLoading(true)
            try {
                const res = await getImportRuns({ step: currentStep, limit: historyLimit, offset: historyOffset })
                if (cancelled) return
                if (res.success) {
                    setHistoryRows(res.rows)
                    setHistoryTotal(res.total)
                }
            } finally {
                if (!cancelled) setHistoryLoading(false)
            }
        }

        if (historyIsOpen) loadHistory()

        return () => {
            cancelled = true
        }
    }, [currentStep, historyIsOpen, historyOffset])

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setFileName(file.name)
        setFileHashSha256(null)
        setIsUploading(true)
        setImportResult(null)

        // Calcular hash del archivo (para detectar re-imports exactos)
        file
            .arrayBuffer()
            .then((buf) => sha256Hex(buf))
            .then((hex) => setFileHashSha256(hex))
            .catch(() => {
                // No bloqueamos import por hash; solo ayuda visual.
                setFileHashSha256(null)
            })

        // Caso especial: CSV "Ficha" de recetas con ';' (como el ejemplo)
        if (currentStep === 'recipes' && file.name.toLowerCase().endsWith('.csv')) {
            file
                .text()
                .then((txt) => {
                    if (looksLikeRecipeFichaCsv(txt)) {
                        const parsed = parseRecipeFichaCsvToImportRows(txt)
                        if (parsed.length === 0) {
                            setImportResult({ success: false, message: 'CSV de ficha detectado pero no se pudo interpretar. Revisa el formato.' })
                            setFileData([])
                        } else {
                            setFileData(parsed)
                        }
                        setIsUploading(false)
                        return
                    }

                    // fallback a XLSX si no parece ficha
                    const reader = new FileReader()
                    reader.onload = (evt) => {
                        try {
                            const bstr = evt.target?.result
                            const wb = XLSX.read(bstr, { type: 'binary' })
                            const wsname = wb.SheetNames[0]
                            const ws = wb.Sheets[wsname]
                            const data = XLSX.utils.sheet_to_json(ws)
                            setFileData(data)
                        } catch (err) {
                            console.error("Error parsing file", err)
                            setImportResult({ success: false, message: "Error al leer el archivo. Asegúrate de que es un Excel/CSV válido." })
                        } finally {
                            setIsUploading(false)
                        }
                    }
                    reader.readAsBinaryString(file)
                })
                .catch(() => {
                    setImportResult({ success: false, message: 'No se pudo leer el CSV.' })
                    setIsUploading(false)
                })
            return
        }

        const reader = new FileReader()
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result
                const wb = XLSX.read(bstr, { type: 'binary' })
                const wsname = wb.SheetNames[0]
                const ws = wb.Sheets[wsname]
                const data = XLSX.utils.sheet_to_json(ws)
                setFileData(data)
            } catch (err) {
                console.error("Error parsing file", err)
                setImportResult({ success: false, message: "Error al leer el archivo. Asegúrate de que es un Excel/CSV válido." })
            } finally {
                setIsUploading(false)
            }
        }
        reader.readAsBinaryString(file)
    }

    const handleImport = async () => {
        setIsUploading(true)
        try {
            let result: ImportResult = { success: false, message: "Acción no definida" }
            const meta = { fileName, fileHashSha256 }

            if (currentStep === 'suppliers') {
                result = await importSuppliers(fileData, meta)
            } else if (currentStep === 'products') {
                result = await importProducts(fileData, meta)
            } else if (currentStep === 'logs') {
                result = await importLogs(fileData, meta)
            } else if (currentStep === 'treasury') {
                result = await importInitialMovements(fileData, meta)
            } else if (currentStep === 'recipes') {
                result = await importRecipes(fileData, meta)
            } else {
                result = { success: false, message: "Este paso aún no está implementado." }
            }

            setImportResult(result)
            const res = await getLatestImportRuns()
            if (res.success) setLatestRuns(res.runs as any)
            // refrescar historial del apartado actual
            if (historyIsOpen) {
                setHistoryOffset(0)
                const hist = await getImportRuns({ step: currentStep, limit: historyLimit, offset: 0 })
                if (hist.success) {
                    setHistoryRows(hist.rows)
                    setHistoryTotal(hist.total)
                }
            }
            if (result.success) {
                // Optional: clear data after success
            }
        } catch (err) {
            setImportResult({ success: false, message: "Error inesperado durante la importación." })
        } finally {
            setIsUploading(false)
        }
    }

    const nextStep = () => {
        const currentIndex = steps.findIndex(s => s.id === currentStep)
        if (currentIndex < steps.length - 1) {
            setCurrentStep(steps[currentIndex + 1].id as ImportStep)
            setFileData([])
            setFileName(null)
            setFileHashSha256(null)
            setImportResult(null)
            setHistoryOffset(0)
        }
    }

    return (
        <div className="container max-w-4xl mx-auto py-8 space-y-8">
            <div className="flex flex-col space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-[#36606F]">Asistente de Migración Legacy</h1>
                <p className="text-muted-foreground">Importa tus datos históricos paso a paso asegurando la integridad de la base de datos.</p>
            </div>

            {/* Progress Stepper */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {steps.map((step, index) => {
                    const isActive = step.id === currentStep
                    const isPast = steps.findIndex(s => s.id === currentStep) > index
                    const last = latestRuns[step.id]
                    const hasLast = !!last?.created_at

                    return (
                        <div
                            key={step.id}
                            onClick={() => {
                                setCurrentStep(step.id)
                                setFileData([])
                                setFileName(null)
                                setFileHashSha256(null)
                                setImportResult(null)
                            }}
                            className={cn(
                                "flex min-h-24 flex-col items-center justify-center p-4 border rounded-xl transition-all cursor-pointer hover:bg-zinc-50",
                                isActive ? "border-[#36606F] bg-blue-50/50" : "border-zinc-200 bg-white",
                                isPast ? "opacity-60" : ""
                            )}
                        >
                            <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mb-2",
                                isActive ? "bg-[#36606F] text-white" : "bg-zinc-100 text-zinc-500"
                            )}>
                                {index + 1}
                            </div>
                            <span className="font-medium text-sm text-center">{step.label}</span>
                            <span className={cn("mt-1 text-[10px] font-medium text-center", hasLast ? "text-zinc-600" : "text-zinc-400")}>
                                {hasLast ? `Último: ${last?.file_name ?? '—'}` : 'Sin importar'}
                            </span>
                        </div>
                    )
                })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Left Column: Instructions & Context */}
                <div className="md:col-span-1 space-y-4">
                    {/* Info Card */}
                    <div className="rounded-xl border border-blue-100 bg-blue-50/50 text-card-foreground shadow-sm">
                        <div className="flex flex-col space-y-1.5 p-6">
                            <h3 className="font-semibold leading-none tracking-tight text-blue-900 flex items-center gap-2">
                                <Database className="w-4 h-4" />
                                Estructura Requerida
                            </h3>
                        </div>
                        <div className="p-6 pt-0 text-sm text-blue-800 space-y-2">
                            {lastRunForStep && (
                                <div className="rounded-lg border border-blue-200 bg-white/60 p-3 text-xs text-blue-900">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold">Último archivo importado</span>
                                        <span className={cn("font-semibold", lastRunForStep.success ? "text-emerald-700" : "text-rose-700")}>
                                            {lastRunForStep.success ? 'OK' : 'FALLÓ'}
                                        </span>
                                    </div>
                                    <div className="mt-1 text-blue-800">
                                        <span className="font-medium">{lastRunForStep.file_name ?? '—'}</span>
                                    </div>
                                    <div className="mt-1 text-[11px] text-blue-700/90">
                                        {new Date(lastRunForStep.created_at).toLocaleString('es-ES')}
                                        {typeof lastRunForStep.record_count === 'number' ? ` · ${lastRunForStep.record_count} filas` : ''}
                                    </div>
                                </div>
                            )}

                            <div className="rounded-lg border border-blue-200 bg-white/60">
                                <button
                                    type="button"
                                    onClick={() => setHistoryIsOpen((v) => !v)}
                                    className="w-full min-h-12 px-3 py-2 flex items-center justify-between gap-3 text-left"
                                >
                                    <div className="flex flex-col">
                                        <span className="font-semibold text-blue-900 text-xs">Archivos ya importados</span>
                                        <span className="text-[11px] text-blue-700/90">
                                            {historyTotal > 0 ? `${historyTotal} importaciones registradas` : 'Sin historial'}
                                        </span>
                                    </div>
                                    <span className="text-xs font-semibold text-blue-900">{historyIsOpen ? 'Ocultar' : 'Ver'}</span>
                                </button>

                                {historyIsOpen && (
                                    <div className="border-t border-blue-200/60 p-2">
                                        {historyLoading ? (
                                            <div className="flex items-center gap-2 text-xs text-blue-800 px-2 py-2">
                                                <LoadingSpinner size="sm" />
                                                Cargando historial...
                                            </div>
                                        ) : historyRows.length === 0 ? (
                                            <div className="text-xs text-blue-800 px-2 py-2">No hay importaciones registradas para este apartado.</div>
                                        ) : (
                                            <div className="max-h-[260px] overflow-auto">
                                                {historyRows.map((r, idx) => (
                                                    <div key={`${r.created_at}-${idx}`} className="px-2 py-2 border-b border-blue-200/40 last:border-0">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <div className="text-[11px] font-semibold text-blue-900 truncate">
                                                                    {r.file_name ?? '—'}
                                                                </div>
                                                                <div className="text-[10px] text-blue-700/90">
                                                                    {new Date(r.created_at).toLocaleString('es-ES')}
                                                                    {typeof r.record_count === 'number' ? ` · ${r.record_count} filas` : ''}
                                                                </div>
                                                            </div>
                                                            <div className={cn("shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border", r.success ? "text-emerald-700 border-emerald-200 bg-emerald-50" : "text-rose-700 border-rose-200 bg-rose-50")}>
                                                                {r.success ? 'OK' : 'FALLÓ'}
                                                            </div>
                                                        </div>
                                                        {(r.file_hash_sha256 || r.result_message) && (
                                                            <div className="mt-1 space-y-1">
                                                                {r.file_hash_sha256 && (
                                                                    <div className="text-[10px] text-zinc-500 font-mono">
                                                                        SHA256: {r.file_hash_sha256.slice(0, 8)}…{r.file_hash_sha256.slice(-8)}
                                                                    </div>
                                                                )}
                                                                {r.result_message && (
                                                                    <div className="text-[10px] text-blue-800/90 line-clamp-2">
                                                                        {r.result_message}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {historyTotal > historyLimit && (
                                            <div className="mt-2 grid grid-cols-2 gap-2">
                                                <button
                                                    type="button"
                                                    className="min-h-12 rounded-md border border-blue-200 bg-white text-blue-900 text-xs font-semibold hover:bg-blue-50 disabled:opacity-50"
                                                    disabled={historyOffset <= 0 || historyLoading}
                                                    onClick={() => setHistoryOffset((o) => Math.max(0, o - historyLimit))}
                                                >
                                                    Anterior
                                                </button>
                                                <button
                                                    type="button"
                                                    className="min-h-12 rounded-md border border-blue-200 bg-white text-blue-900 text-xs font-semibold hover:bg-blue-50 disabled:opacity-50"
                                                    disabled={historyOffset + historyLimit >= historyTotal || historyLoading}
                                                    onClick={() => setHistoryOffset((o) => o + historyLimit)}
                                                >
                                                    Siguiente
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <p>Para <strong>{steps.find(s => s.id === currentStep)?.label}</strong>, el archivo debe contener estas columnas:</p>
                            {currentStep === 'suppliers' && (
                                <ul className="list-disc list-inside font-mono text-xs bg-white/50 p-2 rounded">
                                    <li>nombre (req)</li>
                                    <li>telefono</li>
                                    <li>email</li>
                                    <li>contacto</li>
                                </ul>
                            )}
                            {currentStep === 'products' && (
                                <ul className="list-disc list-inside font-mono text-xs bg-white/50 p-2 rounded">
                                    <li>nombre (req)</li>
                                    <li>categoría</li>
                                    <li>proveedor</li>
                                    <li>coste_unitario</li>
                                    <li>unidad_medida</li>
                                </ul>
                            )}
                            {currentStep === 'recipes' && (
                                <div className="space-y-2 text-xs">
                                    <ul className="list-disc list-inside font-mono bg-white/50 p-2 rounded space-y-1">
                                        <li><strong>nombre_receta</strong> (req): mismo valor en cada fila del mismo plato</li>
                                        <li>categoria, precio_barra, precio_pavelló, raciones</li>
                                        <li>elaboración / presentación (texto; columnas: elaboration, elaboración, preparacion / presentation, presentación)</li>
                                        <li>Por línea: ingrediente_nombre, cantidad, unidad (g, kg, ml, l, ud, cl)</li>
                                    </ul>
                                    <Link
                                        href="/dashboard/recetas-import"
                                        className="inline-flex min-h-12 items-center justify-center w-full rounded-lg bg-[#36606F]/10 text-[#36606F] font-semibold px-3 hover:bg-[#36606F]/15"
                                    >
                                        O importar desde PDF o imagen con IA y validación
                                    </Link>
                                </div>
                            )}
                            {currentStep === 'logs' && (
                                <ul className="list-disc list-inside font-mono text-xs bg-white/50 p-2 rounded">
                                    <li>empleado (req: nombre)</li>
                                    <li>entrada (req: YYYY-MM-DD HH:MM)</li>
                                    <li>salida (YYYY-MM-DD HH:MM)</li>
                                    <li>horas_contrato (def: 40)</li>
                                </ul>
                            )}
                            {currentStep === 'treasury' && (
                                <ul className="list-disc list-inside font-mono text-xs bg-white/50 p-2 rounded">
                                    <li>fecha (req: YYYY-MM-DD)</li>
                                    <li>importe (req: número)</li>
                                    <li>tipo (entrada/salida)</li>
                                    <li>notas (opcional)</li>
                                </ul>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Action Area */}
                <div className="md:col-span-2 space-y-6">
                    {/* Main Card */}
                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm border-dashed border-2 shadow-none min-h-[300px] flex flex-col justify-center items-center relative overflow-hidden transition-all hover:border-[#36606F]/50">
                        {fileData.length === 0 ? (
                            <div className="text-center p-8 space-y-4">
                                <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto">
                                    <Upload className="w-8 h-8 text-zinc-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold">Sube tu archivo Excel/CSV</h3>
                                    <p className="text-sm text-muted-foreground">Arrastra o selecciona el archivo para analizar</p>
                                </div>
                                <button className="inline-flex min-h-12 items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-zinc-100 px-4 py-2 relative cursor-pointer">
                                    Seleccionar Archivo
                                    <input
                                        type="file"
                                        accept=".xlsx, .xls, .csv"
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        onChange={handleFileUpload}
                                    />
                                </button>
                            </div>
                        ) : (
                            <div className="w-full h-full p-0 flex flex-col">
                                <div className="bg-zinc-50 border-b p-4 flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-green-100 rounded-lg">
                                            <FileUp className="w-5 h-5 text-green-700" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-sm">{fileName}</p>
                                            <p className="text-xs text-muted-foreground">{fileData.length} registros detectados</p>
                                            {fileHashSha256 && (
                                                <p className="mt-1 text-[10px] text-zinc-400 font-mono">
                                                    SHA256: {fileHashSha256.slice(0, 8)}…{fileHashSha256.slice(-8)}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        className="inline-flex min-h-12 items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-zinc-100 hover:text-accent-foreground px-3"
                                    onClick={() => { setFileData([]); setFileName(null); setFileHashSha256(null); setImportResult(null); }}
                                    >
                                        Cambiar
                                    </button>
                                </div>

                                {/* Preview Table */}
                                <div className="flex-1 overflow-auto max-h-[300px]">
                                    <div className="p-4">
                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Vista Previa (Primeros 5)</h4>
                                        <div className="border rounded-lg overflow-hidden text-xs">
                                            <table className="w-full text-left">
                                                <thead className="bg-zinc-50 border-b text-zinc-500">
                                                    <tr>
                                                        {fileData.length > 0 && Object.keys(fileData[0]).slice(0, 4).map(header => (
                                                            <th key={header} className="p-2 font-medium">{header}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {fileData.slice(0, 5).map((row, i) => (
                                                        <tr key={i} className="border-b last:border-0 hover:bg-zinc-50/50">
                                                            {Object.values(row).slice(0, 4).map((val: any, j) => (
                                                                <td key={j} className="p-2 truncate max-w-[100px]">{String(val)}</td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 border-t bg-zinc-50/30 flex justify-end gap-3 rounded-b-xl">
                                    {!importResult?.success ? (
                                        <button
                                            onClick={handleImport}
                                            disabled={isUploading}
                                            className="inline-flex min-h-12 items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-[#36606F] text-white hover:bg-[#2A4C58] px-4 py-2"
                                        >
                                            {isUploading ? (
                                                <>
                                                    <LoadingSpinner size="sm" className="mr-2" />
                                                    Importando...
                                                </>
                                            ) : (
                                                <>
                                                    Confirmar Importación
                                                    <Save className="w-4 h-4 ml-2" />
                                                </>
                                            )}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={nextStep}
                                            className="inline-flex min-h-12 items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-green-600 bg-transparent text-green-700 hover:bg-green-50 px-4 py-2"
                                        >
                                            Siguiente Paso
                                            <ArrowRight className="w-4 h-4 ml-2" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Feedback Area / Alert */}
                    {importResult && (
                        <div className={cn(
                            "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground transition-all",
                            importResult.success ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-900"
                        )}>
                            {importResult.success ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-red-600" />}
                            <h5 className="mb-1 font-medium leading-none tracking-tight">{importResult.success ? "Importación Exitosa" : "Error en Importación"}</h5>
                            <div className="text-sm opacity-90 space-y-2">
                                <p>{importResult.message}</p>
                                {importResult.errors && importResult.errors.length > 0 && (
                                    <div className="mt-2 text-xs bg-white/50 p-2 rounded max-h-[100px] overflow-auto border border-black/5">
                                        {importResult.errors.map((err, i) => (
                                            <div key={i} className="mb-1 last:mb-0 pb-1 last:pb-0 border-b border-black/5 last:border-0">
                                                • {err}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
