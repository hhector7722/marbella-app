import { AltaPublicScreen } from '@/components/alta/AltaPublicScreen';
import { EmptyState } from '@/components/ui/EmptyState';

export default function AltaIndexPage() {
  return (
    <AltaPublicScreen>
      <EmptyState
        instance="alta-index-missing"
        variant="error"
        title="Falta el enlace"
        description="Abre el enlace completo que te han enviado."
      />
    </AltaPublicScreen>
  );
}
