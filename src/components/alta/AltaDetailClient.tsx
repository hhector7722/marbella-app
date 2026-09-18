'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageScreen } from '@/components/dashboard/DashboardDetailLayout';
import { AltaCandidateFields } from '@/components/alta/AltaCandidateFields';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/modal';
import { Notice } from '@/components/ui/Notice';
import {
  applyIntakeCreateUser,
  applyIntakeLinkProfile,
  revokeEmploymentIntake,
  saveEmploymentIntake,
} from '@/app/actions/employment-intakes';
import { canGenerateAltaPdf, missingAltaPdfFields } from '@/lib/alta-laboral/completeness.ts';
import { INTAKE_STATUS_LABEL, type CandidateFields, type ContractFields, type EmploymentIntakeRow } from '@/lib/alta-laboral/types.ts';
import { displayStatus } from '@/lib/alta-laboral/dates.ts';

type ProfileOption = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  avatar_url: string | null;
};

type Props = {
  intake: EmploymentIntakeRow;
  profiles: ProfileOption[];
};

function candidateFromRow(row: EmploymentIntakeRow): CandidateFields {
  return {
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    dni: row.dni ?? '',
    afiliacionSeguridadSocial: row.afiliacion_seguridad_social ?? '',
    nacionalidad: row.nacionalidad ?? '',
    fechaNacimiento: row.fecha_nacimiento ?? '',
    domicilio: row.domicilio ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    bankAccount: row.bank_account ?? '',
  };
}

function contractFromRow(row: EmploymentIntakeRow): ContractFields {
  return {
    categoria: row.categoria ?? '',
    tipoContrato: row.tipo_contrato ?? '',
    weeklyHours: row.weekly_hours == null ? null : Number(row.weekly_hours),
    fechaInicio: row.fecha_inicio ?? '',
    fechaFin: row.fecha_fin ?? '',
  };
}

export function AltaDetailClient({ intake, profiles }: Props) {
  const router = useRouter();
  const [candidate, setCandidate] = useState<CandidateFields>(() => candidateFromRow(intake));
  const [contract, setContract] = useState<ContractFields>(() => contractFromRow(intake));
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);

  const status = displayStatus(intake);
  const merged: EmploymentIntakeRow = {
    ...intake,
    first_name: candidate.firstName,
    last_name: candidate.lastName,
    dni: candidate.dni,
    afiliacion_seguridad_social: candidate.afiliacionSeguridadSocial,
    nacionalidad: candidate.nacionalidad,
    fecha_nacimiento: candidate.fechaNacimiento,
    domicilio: candidate.domicilio,
    phone: candidate.phone,
    email: candidate.email,
    bank_account: candidate.bankAccount,
    categoria: contract.categoria,
    tipo_contrato: contract.tipoContrato,
    weekly_hours: contract.weeklyHours,
    fecha_inicio: contract.fechaInicio,
    fecha_fin: contract.fechaFin || null,
  };
  const missing = missingAltaPdfFields(merged);
  const ready = canGenerateAltaPdf(merged);
  const applied = status === 'applied';

  const employees = useMemo(
    () =>
      profiles.map((p) => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        email: p.email,
        avatar_url: p.avatar_url,
      })),
    [profiles],
  );

  const save = async () => {
    setSaving(true);
    try {
      const res = await saveEmploymentIntake(intake.id, { candidate, contract });
      if (!res.success) {
        toast.error(res.error);
        return false;
      }
      toast.success('Alta guardada');
      router.refresh();
      return true;
    } finally {
      setSaving(false);
    }
  };

  const onPdf = async () => {
    const saved = await save();
    if (!saved) return;
    if (!ready) {
      toast.error(`Faltan datos: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }
    window.location.assign(`/api/dashboard/altas/${intake.id}/pdf`);
  };

  const onCreateUser = async () => {
    const saved = await save();
    if (!saved) return;
    const res = await applyIntakeCreateUser(intake.id);
    if (!res.success) {
      if (res.needsLink) {
        toast.message(res.error);
        setLinkOpen(true);
        return;
      }
      toast.error(res.error);
      return;
    }
    setPassword(res.password);
    router.refresh();
  };

  const onLink = async (profileId: string, overwrite = false) => {
    const saved = await save();
    if (!saved) return;
    const res = await applyIntakeLinkProfile(intake.id, profileId, overwrite);
    if (!res.success && res.needsConfirm) {
      setLinkOpen(false);
      setPendingProfileId(profileId);
      setConfirmOverwrite(true);
      return;
    }
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success('Datos copiados al perfil');
    setLinkOpen(false);
    setConfirmOverwrite(false);
    router.refresh();
  };

  return (
    <PageScreen
      title={candidate.firstName ? `${candidate.firstName} ${candidate.lastName}`.trim() : 'Alta laboral'}
      subtitle={INTAKE_STATUS_LABEL[status]}
      backHref="/dashboard/altas"
      template="form"
      maxWidthClass="max-w-2xl"
    >
      <div className="flex flex-col gap-8">
        {status === 'pending_candidate' ? (
          <Notice instance="alta-waiting" variant="info">
            El trabajador todavía no ha enviado el formulario.
          </Notice>
        ) : null}

        {!ready && status !== 'pending_candidate' ? (
          <Notice instance="alta-missing" variant="warning" title="Faltan datos para el PDF">
            {missing.map((f) => f.label).join(', ')}
          </Notice>
        ) : null}

        <section className="flex flex-col gap-4">
          <h2 className="text-base font-semibold">Datos del trabajador</h2>
          <AltaCandidateFields
            values={candidate}
            errors={{}}
            onChange={(field, value) => setCandidate((prev) => ({ ...prev, [field]: value }))}
            instancePrefix="alta-detail"
            disabled={applied}
          />
          <div className="grid grid-cols-2 gap-3">
            {intake.dni_front_storage_path ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/alta/intake-image?id=${intake.id}&side=delantera`}
                alt="Documento anverso"
                className="w-full rounded-[var(--radio-control)]"
              />
            ) : (
              <EmptyState instance="alta-no-front" variant="none" title="Sin anverso" />
            )}
            {intake.dni_back_storage_path ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/alta/intake-image?id=${intake.id}&side=trasera`}
                alt="Documento reverso"
                className="w-full rounded-[var(--radio-control)]"
              />
            ) : (
              <EmptyState instance="alta-no-back" variant="none" title="Sin reverso" />
            )}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-base font-semibold">Datos del contrato</h2>
          <Field instance="alta-categoria" label="Categoría" htmlFor="alta-categoria">
            <input
              id="alta-categoria"
              value={contract.categoria}
              onChange={(e) => setContract((c) => ({ ...c, categoria: e.target.value }))}
              disabled={applied}
            />
          </Field>
          <Field instance="alta-tipo" label="Tipo de contrato" htmlFor="alta-tipo">
            <input
              id="alta-tipo"
              value={contract.tipoContrato}
              onChange={(e) => setContract((c) => ({ ...c, tipoContrato: e.target.value }))}
              disabled={applied}
            />
          </Field>
          <Field instance="alta-horas" label="Horas semanales" htmlFor="alta-horas">
            <input
              id="alta-horas"
              type="number"
              min="0"
              step="0.5"
              value={contract.weeklyHours == null ? '' : String(contract.weeklyHours)}
              onChange={(e) =>
                setContract((c) => ({
                  ...c,
                  weeklyHours: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
              disabled={applied}
            />
          </Field>
          <Field instance="alta-inicio" label="Fecha de inicio" htmlFor="alta-inicio">
            <input
              id="alta-inicio"
              type="date"
              value={contract.fechaInicio}
              onChange={(e) => setContract((c) => ({ ...c, fechaInicio: e.target.value }))}
              disabled={applied}
            />
          </Field>
          <Field instance="alta-fin" label="Fecha de finalización" htmlFor="alta-fin" hint="Vacío si es indefinido">
            <input
              id="alta-fin"
              type="date"
              value={contract.fechaFin ?? ''}
              onChange={(e) => setContract((c) => ({ ...c, fechaFin: e.target.value }))}
              disabled={applied}
            />
          </Field>
        </section>

        <div className="flex flex-col gap-3">
          <Button type="button" variant="secondary" instance="alta-guardar" loading={saving} onClick={() => void save()} disabled={applied}>
            Guardar
          </Button>
          <Button type="button" variant="primary" instance="alta-pdf" onClick={() => void onPdf()} disabled={!ready}>
            Generar PDF
          </Button>
          <Button type="button" variant="secondary" instance="alta-crear-usuario" onClick={() => void onCreateUser()} disabled={applied || !ready}>
            Crear usuario
          </Button>
          <Button type="button" variant="secondary" instance="alta-vincular" onClick={() => setLinkOpen(true)} disabled={applied || !ready}>
            Vincular a un perfil
          </Button>
          {status === 'pending_candidate' || status === 'submitted' ? (
            <Button
              type="button"
              variant="destructive"
              instance="alta-revocar"
              onClick={async () => {
                const res = await revokeEmploymentIntake(intake.id);
                if (!res.success) toast.error(res.error);
                else {
                  toast.success('Enlace revocado');
                  router.push('/dashboard/altas');
                }
              }}
            >
              Revocar enlace
            </Button>
          ) : null}
        </div>
      </div>

      <StaffSelectionModal
        isOpen={linkOpen}
        onClose={() => setLinkOpen(false)}
        onSelect={(employee) => {
          void onLink(employee.id);
        }}
        employees={employees}
        title="Vincular a un perfil"
        usageId="alta-vincular-perfil"
        usageLabel="Vincular alta a perfil"
        variant="profile-list"
      />

      <Modal
        open={confirmOverwrite}
        onClose={() => setConfirmOverwrite(false)}
        title="Sustituir datos del perfil"
        instance="alta-overwrite"
        variant="standard"
        layer="derived"
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="secondary" instance="alta-overwrite-no" onClick={() => setConfirmOverwrite(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              instance="alta-overwrite-si"
              onClick={() => pendingProfileId && void onLink(pendingProfileId, true)}
            >
              Sustituir
            </Button>
          </div>
        }
      >
        Este perfil ya tiene documento o IBAN. Si continúas, se sustituyen por los de esta alta.
      </Modal>

      <Modal
        open={Boolean(password)}
        onClose={() => setPassword(null)}
        title="Cuenta creada"
        instance="alta-password"
        variant="standard"
      >
        {password ? (
          <div className="flex flex-col gap-4">
            <Notice instance="alta-password-aviso" variant="warning" title="Guárdala ahora">
              Esta contraseña solo se muestra una vez. Envíasela al trabajador.
            </Notice>
            <p className="font-mono text-lg tracking-wide">{password}</p>
            <Button
              type="button"
              variant="primary"
              instance="alta-password-copiar"
              onClick={() => {
                void navigator.clipboard.writeText(password);
                toast.success('Contraseña copiada');
              }}
            >
              Copiar contraseña
            </Button>
          </div>
        ) : null}
      </Modal>
    </PageScreen>
  );
}
