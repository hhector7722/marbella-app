import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';

type Props = {
  searchParams: Promise<{ success?: string; error?: string; already?: string; conflict?: string }>;
};

export default async function PayrollSummaryImportPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'manager') redirect('/dashboard/labor');
  const status = await searchParams;
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link href="/dashboard/labor" className="text-sm text-slate-500 hover:text-slate-900">← Volver a costes laborales</Link>
      <h1 className="mt-6 text-2xl font-semibold">Importar costes de empresa</h1>
      <p className="mt-2 text-sm text-slate-600">
        Sube el PDF original de la gestoría. Se comprueban el mes, el total, las liquidaciones y la identidad de cada trabajador.
        El documento quedará guardado en el almacenamiento privado de nóminas.
      </p>
      {status.success && <p role="status" className="mt-6 rounded-lg bg-green-50 p-4 text-green-800">Importación completada y conciliada: {status.success}.</p>}
      {status.already && <p role="status" className="mt-6 rounded-lg bg-blue-50 p-4 text-blue-800">El PDF de {status.already} ya estaba importado.</p>}
      {status.conflict && <p role="alert" className="mt-6 rounded-lg bg-amber-50 p-4 text-amber-900">Ya existe otro resumen de {status.conflict}. No se ha sobrescrito.</p>}
      {status.error && <p role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-red-800">{status.error}</p>}
      <form action="/api/labor/import-summary" method="post" encType="multipart/form-data"
        className="mt-7 flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6">
        <label className="text-sm font-medium" htmlFor="payroll-pdf">PDF original de costes de empresa</label>
        <input id="payroll-pdf" type="file" name="file" required accept=".pdf,application/pdf" className="block w-full text-sm" />
        <button type="submit" className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700">
          Validar e importar PDF
        </button>
      </form>
    </main>
  );
}
