import { ScannerClient } from './ScannerClient'

export const dynamic = 'force-static'

export default function ScannerPage() {
  return (
    <main className="max-w-md mx-auto p-4 space-y-6">
      <header className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Escáner de Albaranes</h1>
        <p className="text-sm text-gray-500 mt-1">Captura el documento en buena iluminación.</p>
      </header>
      <ScannerClient />
    </main>
  )
}

