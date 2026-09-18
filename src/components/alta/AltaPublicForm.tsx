'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { AltaPublicScreen } from '@/components/alta/AltaPublicScreen';
import { AltaCandidateFields, EMPTY_CANDIDATE } from '@/components/alta/AltaCandidateFields';
import { candidateFieldsSchema } from '@/lib/alta-laboral/schema.ts';
import type { CandidateFields } from '@/lib/alta-laboral/types.ts';
import type { PublicIntakeState } from '@/lib/alta-laboral/types.ts';

type Props = {
  token: string;
  state: PublicIntakeState;
};

function fieldErrorsFromIssues(
  issues: { path: PropertyKey[]; message: string }[],
): Partial<Record<keyof CandidateFields, string>> {
  const next: Partial<Record<keyof CandidateFields, string>> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && next[key as keyof CandidateFields] == null) {
      next[key as keyof CandidateFields] = issue.message;
    }
  }
  return next;
}

function fileButtonLabel(file: File | null, fallback: string) {
  if (!file) return fallback;
  return file.name.length > 18 ? `${file.name.slice(0, 15)}…` : file.name;
}

function AltaIntakeFileButton({
  instance,
  caption,
  file,
  onFile,
}: {
  instance: string;
  caption: string;
  file: File | null;
  onFile: (file: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-[11px] font-black text-[var(--color-texto-invertido)]">{caption}</p>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <Button
        type="button"
        variant="secondary"
        instance={instance}
        layout="hug"
        className="mx-auto"
        onClick={() => ref.current?.click()}
      >
        {fileButtonLabel(file, 'Seleccionar archivo')}
      </Button>
    </div>
  );
}

export function AltaPublicForm({ token, state }: Props) {
  const [values, setValues] = useState<CandidateFields>(EMPTY_CANDIDATE);
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof CandidateFields, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (state === 'invalid') {
    return (
      <AltaPublicScreen>
        <EmptyState instance="alta-public-invalid" variant="error" title="Este enlace no es válido" description="Pide un enlace nuevo a quien te lo envió." />
      </AltaPublicScreen>
    );
  }

  if (state === 'expired') {
    return (
      <AltaPublicScreen>
        <EmptyState instance="alta-public-expired" variant="error" title="Este enlace ha caducado" description="Pide un enlace nuevo." />
      </AltaPublicScreen>
    );
  }

  if (state === 'submitted' || sent) {
    return (
      <AltaPublicScreen>
        <EmptyState
          instance="alta-public-sent"
          variant="none"
          title="Datos enviados"
          description="Ya los hemos recibido. Si hay que corregir algo, te escribiremos."
        />
      </AltaPublicScreen>
    );
  }

  const onChange = (field: keyof CandidateFields, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = candidateFieldsSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos');
      return;
    }
    if (!front || !back) {
      setError('Faltan las dos imágenes del documento');
      return;
    }
    setSending(true);
    try {
      const body = new FormData();
      for (const [key, value] of Object.entries(parsed.data)) {
        body.set(key, String(value));
      }
      body.set('dniFront', front);
      body.set('dniBack', back);
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
    <AltaPublicScreen
      footerSlot={
        <div data-alta-public-footer className="flex justify-center">
          <Button type="submit" form="alta-public-form" variant="primary" instance="alta-public-enviar" loading={sending} layout="hug">
            Enviar
          </Button>
        </div>
      }
    >
      <form id="alta-public-form" className="flex flex-col gap-3" onSubmit={onSubmit}>
        <AltaCandidateFields values={values} errors={errors} onChange={onChange} instancePrefix="alta-public" />
        <div data-alta-doc-picks className="grid grid-cols-2 gap-2 rounded-[var(--radio-control)] bg-[var(--color-envolvente)] px-2 py-3">
          <AltaIntakeFileButton instance="alta-public-dni-front" caption="Anverso" file={front} onFile={setFront} />
          <AltaIntakeFileButton instance="alta-public-dni-back" caption="Reverso" file={back} onFile={setBack} />
        </div>
        {error ? (
          <Notice instance="alta-public-error" variant="critical" title="No se ha enviado">
            {error}
          </Notice>
        ) : null}
      </form>
    </AltaPublicScreen>
  );
}
