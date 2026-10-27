import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { importPurchaseEmailDocument } from './actions'

export const dynamic = 'force-dynamic'

const kindLabel = (kind: string) => kind === 'delivery_note'
  ? 'Albarán por entrega' : kind === 'monthly_invoice' ? 'Factura mensual' : 'Por clasificar'

const statusLabel = (status: string) => status === 'imported'
  ? 'En procesamiento' : status === 'duplicate' ? 'Duplicado (ignorado)'
    : status === 'error' ? 'Revisar error' : 'Pendiente de clasificación'

export default async function EmailAlbaranesPage({
  searchParams,
}: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles')
    .select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'manager' && profile?.role !== 'admin') redirect('/dashboard/albaranes')

  const [{ data: docs, error }, { data: suppliers }] = await Promise.all([
    supabase.from('purchase_email_documents')
      .select('id,sender_email,email_subject,email_date,filename,storage_path,suggested_kind,document_kind,supplier_id,status,invoice_id,received_at')
      .order('received_at', { ascending: false }).limit(120),
    supabase.from('suppliers').select('id,name').order('name'),
  ])
  const signed = await Promise.all((docs ?? []).map(async (doc) => {
    const result = await supabase.storage.from('albaranes')
      .createSignedUrl(doc.storage_path, 3600)
    return { ...doc, url: result.data?.signedUrl ?? null }
  }))
  const params = await searchParams
  const pending = signed.filter(doc => doc.status === 'received')
  const previous = signed.filter(doc => doc.status !== 'received')

  return (
    <main className="mx-auto max-w-5xl px-3 py-5 sm:px-6 space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Documentos por correo</h1>
          <p className="text-sm text-zinc-500">marbellaremote@gmail.com · Gmail → Marbella App</p>
        </div>
        <Link href="/dashboard/albaranes" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
          Volver a albaranes
        </Link>
      </header>
      <div className="rounded-xl border border-zinc-200 p-4 text-sm text-zinc-600">
        <p className="font-semibold text-zinc-900">{pending.length} adjuntos sin clasificar</p>
        <p>Se conservan los originales sin aumentar el stock. Al asignar el proveedor y tipo se inicia la lectura OCR. Las facturas mensuales nunca generan una segunda recepción de mercancía.</p>
        <p className="mt-1">Don Hielo y Vermut: utiliza la recepción manual de un producto; compras imprevistas: utiliza la cámara en Albaranes.</p>
      </div>
      {params.error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{params.error}</p> : null}
      {error ? <p role="alert" className="text-red-700">Error cargando la bandeja: {error.message}</p> : null}
      {!error && signed.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 p-6 text-center text-zinc-500">
          Todavía no se han archivado adjuntos por email. El script debe estar instalado y tener su activador habilitado.
        </p>
      ) : null}
      <section className="space-y-3">
        {pending.map(doc => (
          <article key={doc.id} className="rounded-xl border border-zinc-200 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold break-all">{doc.filename}</p>
                <p className="text-xs text-zinc-500 break-all">{doc.sender_email} · {doc.email_date ? new Date(doc.email_date).toLocaleDateString('es-ES') : 'Fecha desconocida'}</p>
                <p className="text-sm text-zinc-600 break-words">{doc.email_subject}</p>
                <p className="text-xs text-zinc-500 mt-1">Sugerencia: {kindLabel(doc.suggested_kind)}</p>
                <p className="text-xs text-zinc-500">{doc.supplier_id ? 'Proveedor identificado por correo verificado' : 'Proveedor sin identificar: selecciona manualmente'}</p>
              </div>
              {doc.url ? <a href={doc.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-sm underline">Ver original</a> : null}
            </div>
            <form action={importPurchaseEmailDocument} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <input type="hidden" name="documentId" value={doc.id} />
              <label className="block text-xs font-medium">Proveedor
                <select name="supplierId" required defaultValue={doc.supplier_id ?? ''} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm text-zinc-900">
                  <option value="" disabled>Seleccionar proveedor</option>
                  {(suppliers ?? []).map(supplier => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium">Tipo de documento
                <select name="kind" required defaultValue={doc.suggested_kind === 'unknown' ? '' : doc.suggested_kind} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm text-zinc-900">
                  <option value="" disabled>Seleccionar tipo</option>
                  <option value="delivery_note">Albarán por entrega</option>
                  <option value="monthly_invoice">Factura mensual · sin stock</option>
                  <option value="other">Otro documento · solo revisión</option>
                </select>
              </label>
              <button type="submit" className="rounded-lg bg-[#36606F] px-4 py-2 text-sm font-semibold text-white">
                Guardar y leer
              </button>
            </form>
          </article>
        ))}
      </section>
      {previous.length > 0 ? <section className="space-y-2">
        <h2 className="font-semibold text-lg">Archivados y duplicados</h2>
        {previous.map(doc => <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 text-sm">
          <div className="min-w-0">
            <p className="font-medium break-all">{doc.filename}</p>
            <p className="text-xs text-zinc-500">{statusLabel(doc.status)} · {doc.sender_email}</p>
          </div>
          <div className="flex gap-3 shrink-0">
            {doc.url ? <a href={doc.url} target="_blank" rel="noopener noreferrer" className="underline">Original</a> : null}
            {doc.invoice_id ? <Link href={`/dashboard/albaranes?id=${doc.invoice_id}`} className="underline">Abrir</Link> : null}
          </div>
        </div>)}
      </section> : null}
    </main>
  )
}
