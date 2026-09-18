'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { PageScreen } from '@/components/dashboard/DashboardDetailLayout';
import { AltaCandidateFields, EMPTY_CANDIDATE } from '@/components/alta/AltaCandidateFields';
import type { CandidateFields } from '@/lib/alta-laboral/types.ts';
import type { PublicIntakeState } from '@/lib/alta-laboral/types.ts';

type Props = {
  token: string;
  state: PublicIntakeState;
};

export function AltaPublicForm({ token, state }: Props) {
  const [values, setValues] = useState<CandidateFields>(EMPTY_CANDIDATE);
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (state === 'invalid') {
    return (
      <PageScreen title="Alta laboral" showBackButton={false} template="form" maxWidthClass="max-w-lg">
        <EmptyState instance="alta-public-invalid" variant="error" title="Este enlace no es válido" description="Pide un enlace nuevo a quien te lo envió." />
      </PageScreen>
    );
  }

  if (state === 'expired') {
    return (
      <PageScreen title="Alta laboral" showBackButton={false} template="form" maxWidthClass="max-w-lg">
        <EmptyState instance="alta-public-expired" variant="error" title="Este enlace ha caducado" description="Pide un enlace nuevo." />
      </PageScreen>
    );
  }

  if (state === 'submitted' || sent) {
    return (
      <PageScreen title="Alta laboral" showBackButton={false} template="form" maxWidthClass="max-w-lg">
        <EmptyState
          instance="alta-public-sent"
          variant="none"
          title="Datos enviados"
          description="Ya los hemos recibido. Si hay que corregir algo, te escribiremos."
        />
      </PageScreen>
    );
  }

  const onChange = (field: keyof CandidateFields, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSending(true);
    try {
      const body = new FormData();
      for (const [key, value] of Object.entries(values)) {
        body.set(key, value);
      }
      if (front) body.set('dniFront', front);
      if (back) body.set('dniBack', back);
      const res = await fetch(`/api/alta/${encodeURIComponent(token)}`, { method: 'POST', body });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        setError(json.error ?? 'No se han podido enviar los datos');
        return;
      }
      setSent(true);
    } catch {
      setError('No se han podido enviar los datos');
    } finally {
      setSending(false);
    }
  };

  return (
    <PageScreen
      title="Alta laboral"
      subtitle="Datos para tu contrato"
      showBackButton={false}
      template="form"
      maxWidthClass="max-w-lg"
      footerSlot={
        <Button type="submit" form="alta-public-form" variant="primary" instance="alta-public-enviar" loading={sending} layout="fill">
          Enviar
        </Button>
      }
    >
      <form id="alta-public-form" className="flex flex-col gap-6" onSubmit={onSubmit}>
        <AltaCandidateFields values={values} errors={{}} onChange={onChange} instancePrefix="alta-public" />
        <Field instance="alta-public-dni-front" label="Documento de identidad (anverso)" htmlFor="alta-public-dni-front">
          <input
            id="alta-public-dni-front"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFront(e.target.files?.[0] ?? null)}
          />
        </Field>
        <Field instance="alta-public-dni-back" label="Documento de identidad (reverso)" htmlFor="alta-public-dni-back">
          <input
            id="alta-public-dni-back"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setBack(e.target.files?.[0] ?? null)}
          />
        </Field>
        {error ? (
          <Notice instance="alta-public-error" variant="critical" title="No se ha enviado">
            {error}
          </Notice>
        ) : null}
      </form>
    </PageScreen>
  );
}
