'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageScreen } from '@/components/dashboard/DashboardDetailLayout';
import { Button } from '@/components/ui/button';
import { DocumentListRow } from '@/components/ui/DocumentListRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/modal';
import { Notice } from '@/components/ui/Notice';
import { createEmploymentIntake, type IntakeListItem } from '@/app/actions/employment-intakes';

type Props = {
  items: IntakeListItem[];
};

export function AltasListClient({ items }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const onCreate = async () => {
    setCreating(true);
    try {
      const res = await createEmploymentIntake();
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      const url = `${window.location.origin}${res.path}`;
      setLink(url);
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Enlace copiado');
      } catch {
        toast.message('Copia el enlace para enviarlo');
      }
      router.refresh();
    } finally {
      setCreating(false);
    }
  };

  return (
    <PageScreen
      title="Altas laborales"
      backHref="/master/dashboard"
      template="list"
      footerSlot={
        <Button type="button" variant="primary" instance="altas-nueva" loading={creating} onClick={onCreate} layout="fill">
          Nueva alta
        </Button>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          instance="altas-empty"
          variant="none"
          title="Todavía no hay altas"
          description="Crea un enlace y envíaselo al trabajador nuevo."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <DocumentListRow
              key={item.id}
              instance={`alta-row-${item.id}`}
              title={item.name}
              subtitle={`${item.statusLabel}${item.email ? ` · ${item.email}` : ''}`}
              onOpen={() => router.push(`/dashboard/altas/${item.id}`)}
            />
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(link)}
        onClose={() => setLink(null)}
        title="Enlace para el trabajador"
        instance="alta-link-creado"
        variant="standard"
      >
        {link ? (
          <div className="flex flex-col gap-4">
            <Notice instance="alta-link-aviso" variant="info">
              Envíale este enlace. Caduca a los 14 días y solo sirve una vez.
            </Notice>
            <p className="break-all text-sm">{link}</p>
            <Button
              type="button"
              variant="primary"
              instance="alta-link-copiar"
              onClick={() => {
                void navigator.clipboard.writeText(link);
                toast.success('Enlace copiado');
              }}
            >
              Copiar
            </Button>
          </div>
        ) : null}
      </Modal>
    </PageScreen>
  );
}
