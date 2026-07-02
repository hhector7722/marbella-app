'use client';

import ScheduleDayForm from '@/components/schedule/ScheduleDayForm';

export default function HorarioPage() {
  // Default to today's date; users can change via the form.
  const today = new Date().toISOString().split('T')[0];
  return (
    <section className="rounded-xl border border-zinc-100 bg-white shadow-sm p-6 max-w-4xl mx-auto mt-8">
      <h1 className="text-2xl font-bold mb-4">Editar Horario</h1>
      <ScheduleDayForm initialDate={today} />
    </section>
  );
}
