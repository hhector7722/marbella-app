'use client';

import ScheduleDayForm from '@/components/schedule/ScheduleDayForm';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';

export default function SchedulePage() {
  const today = new Date().toISOString().split('T')[0];
  return (
    <DashboardDetailLayout
      title="Editar horario"
      showBackButton
      backHref="/horario"
      template="form"
      maxWidthClass="max-w-7xl"
      fillViewport
      contentClassName="p-0 flex flex-col min-h-0"
    >
      <ScheduleDayForm initialDate={today} />
    </DashboardDetailLayout>
  );
}
