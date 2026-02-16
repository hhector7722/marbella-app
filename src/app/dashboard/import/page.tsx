'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, FileUp, CheckCircle, AlertCircle, ArrowRight, Save, Database } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
// import { Button } from '@/components/ui/button' // Removed
// import { Card, ... } from '@/components/ui/card' // Removed
// import { Alert, ... } from '@/components/ui/alert' // Removed
import { importSuppliers, importProducts, importLogs, importInitialMovements, ImportResult } from '@/app/actions/import-legacy'
import { cn } from '@/lib/utils'

type ImportStep = 'suppliers' | 'products' | 'recipes' | 'logs' | 'treasury'

export default function ImportPage() {
    const [currentStep, setCurrentStep] = useState<ImportStep>('suppliers')
    const [fileData, setFileData] = useState<any[]>([])
    const [fileName, setFileName] = useState<string | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [importResult, setImportResult] = useState<ImportResult | null>(null)

    const steps: { id: ImportStep; label: string; description: string }[] = [
        { id: 'suppliers', label: '1. Proveedores', description: 'Base de datos de proveedores' },
        { id: 'products', label: '2. Productos', description: 'Ingredientes y materias primas' },
        { id: 'recipes', label: '3. Recetas', description: 'Escandallo de platos' },
        { id: 'logs', label: '4. Histórico', description: 'Registros antiguos' },
        { id: 'treasury', label: '5. Tesorería', description: 'Movimientos de caja' },
    ]

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setFileName(file.name)
        setIsUploading(true)
        setImportResult(null)

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

            if (currentStep === 'suppliers') {
                result = await importSuppliers(fileData)
            } else if (currentStep === 'products') {
                result = await importProducts(fileData)
            } else if (currentStep === 'logs') {
                result = await importLogs(fileData)
            } else if (currentStep === 'treasury') {
                result = await importInitialMovements(fileData)
            } else {
                result = { success: false, message: "Este paso aún no está implementado." }
            }

            setImportResult(result)
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
            setImportResult(null)
        }
    }

    return (
        <div className="container max-w-4xl mx-auto py-8 space-y-8">
            <div className="flex flex-col space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-[#36606F]">Asistente de Migración Legacy</h1>
                <p className="text-muted-foreground">Importa tus datos históricos paso a paso asegurando la integridad de la base de datos.</p>
            </div>

            {/* Progress Stepper */}
            <div className="grid grid-cols-4 gap-4">
                {steps.map((step, index) => {
                    const isActive = step.id === currentStep
                    const isPast = steps.findIndex(s => s.id === currentStep) > index

                    return (
                        <div
                            key={step.id}
                            onClick={() => {
                                setCurrentStep(step.id)
                                setFileData([])
                                setFileName(null)
                                setImportResult(null)
                            }}
                            className={cn(
                                "flex flex-col items-center p-4 border rounded-xl transition-all cursor-pointer hover:bg-zinc-50",
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
                                <p className="italic text-xs">Aún no disponible.</p>
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
                                <button className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-zinc-100 h-10 px-4 py-2 relative cursor-pointer">
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
                                        </div>
                                    </div>
                                    <button
                                        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-zinc-100 hover:text-accent-foreground h-9 px-3"
                                        onClick={() => { setFileData([]); setFileName(null); setImportResult(null); }}
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
                                            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-[#36606F] text-white hover:bg-[#2A4C58] h-10 px-4 py-2"
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
                                            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-green-600 bg-transparent text-green-700 hover:bg-green-50 h-10 px-4 py-2"
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
