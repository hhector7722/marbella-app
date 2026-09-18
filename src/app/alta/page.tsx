import { PageScreen } from '@/components/dashboard/DashboardDetailLayout';
import { EmptyState } from '@/components/ui/EmptyState';

export default function AltaIndexPage() {
  return (
    <PageScreen title="Alta laboral" showBackButton={false} template="form" maxWidthClass="max-w-lg">
      <EmptyState
        instance="alta-index-missing"
        variant="error"
        title="Falta el enlace"
        description="Abre el enlace completo que te han enviado."
      />
    </PageScreen>
  );
}
