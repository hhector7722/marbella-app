'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageScreen } from '@/components/dashboard/DashboardDetailLayout';
import { prepareIntakeImage } from '@/lib/alta-laboral/image-compression.ts';
import styles from './AltaManagement.module.css';
import { AltaCandidateFields } from '@/components/alta/AltaCandidateFields';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import { Button } from '@/components/ui/button';
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
  const [documentPaths, setDocumentPaths] = useState({
    front: intake.dni_front_storage_path,
    back: intake.dni_back_storage_path,
  });
  const [uploadingSide, setUploadingSide] = useState<'delantera' | 'trasera' | null>(null);
  const [documentVersion, setDocumentVersion] = useState(0);

  const status = displayStatus(intake);
  const merged: EmploymentIntakeRow = {
    ...intake,
    dni_front_storage_path: documentPaths.front,
    dni_back_storage_path: documentPaths.back,
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

  const onDocument = async (side: 'delantera' | 'trasera', file: File | null) => {
    if (!file) return;
    setUploadingSide(side);
    try {
      const prepared = await prepareIntakeImage(file);
      const body = new FormData();
      body.set('side', side);
      body.set('image', prepared);
      const response = await fetch(`/api/dashboard/altas/${intake.id}/documents`, {
        method: 'POST',
        body,
      });
      const result = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        path?: string;
      } | null;
      if (!response.ok || !result?.success || !result.path) {
        toast.error(result?.error ?? 'No se pudo guardar la imagen');
        return;
      }
      setDocumentPaths((previous) => ({
        ...previous,
        [side === 'delantera' ? 'front' : 'back']: result.path!,
      }));
      setDocumentVersion((version) => version + 1);
      toast.success('Documento actualizado en este expediente');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo preparar la imagen');
    } finally {
      setUploadingSide(null);
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
    if (intake.profile_id) {
      setPendingProfileId(intake.profile_id);
      setConfirmOverwrite(true);
      return;
    }
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
      maxWidthClass="max-w-4xl"
      className={styles.screen}
    >
      <div className={styles.formContent}>
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

        <section className={styles.formSection}>
          <h2>Datos del trabajador</h2>
          <p className={styles.sectionDescription}>
            Información de este expediente. Los cambios no modifican automáticamente la ficha del usuario.
          </p>
          <AltaCandidateFields
            values={candidate}
            errors={{}}
            onChange={(field, value) => setCandidate((prev) => ({ ...prev, [field]: value }))}
            instancePrefix="alta-detail"
            disabled={applied}
          />
        </section>

        <section className={styles.formSection}>
          <h2>Documento de identidad</h2>
          <p className={styles.sectionDescription}>
            Se incluyen ambas caras en el PDF. Puedes sustituirlas sin modificar los documentos del perfil.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(['delantera', 'trasera'] as const).map((side) => {
              const path = side === 'delantera' ? documentPaths.front : documentPaths.back;
              return (
                <label key={side} className={styles.documentPreview}>
                  <span className={styles.documentLabel}>
                    {side === 'delantera' ? 'Anverso' : 'Reverso'}
                  </span>
                  {path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/alta/intake-image?id=${intake.id}&side=${side}&v=${documentVersion}`}
                      alt={side === 'delantera' ? 'Documento anverso' : 'Documento reverso'}
                    />
                  ) : (
                    <span className={styles.missingDocument}>Imagen pendiente</span>
                  )}
                  <span className="text-center text-xs font-semibold text-sky-800">
                    {uploadingSide === side ? 'Guardando imagen…' : path ? 'Cambiar imagen' : 'Subir imagen'}
                  </span>
                  <input
                    type="file" accept="image/jpeg,image/png,image/webp"
                    className="sr-only" disabled={applied || Boolean(uploadingSide)}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0] ?? null;
                      void onDocument(side, file);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              );
            })}
          </div>
        </section>

        <section className={styles.formSection}>
          <h2>Condiciones del nuevo contrato</h2>
          <p className={styles.sectionDescription}>
            Confirma categoría, modalidad, jornada y nuevas fechas antes de enviarlo a gestoría.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field instance="alta-categoria" label="Categoría" htmlFor="alta-categoria">
              <input id="alta-categoria" value={contract.categoria}
                onChange={(e) => setContract((c) => ({ ...c, categoria: e.target.value }))} disabled={applied} />
            </Field>
            <Field instance="alta-tipo" label="Tipo de contrato" htmlFor="alta-tipo">
              <input id="alta-tipo" value={contract.tipoContrato}
                onChange={(e) => setContract((c) => ({ ...c, tipoContrato: e.target.value }))} disabled={applied} />
            </Field>
            <Field instance="alta-horas" label="Horas semanales" htmlFor="alta-horas">
              <input id="alta-horas" type="number" min="0" step="0.5"
                value={contract.weeklyHours == null ? '' : String(contract.weeklyHours)}
                onChange={(e) => setContract((c) => ({
                  ...c, weeklyHours: e.target.value === '' ? null : Number(e.target.value),
                }))} disabled={applied} />
            </Field>
            <Field instance="alta-inicio" label="Fecha de inicio" htmlFor="alta-inicio">
              <input id="alta-inicio" type="date" value={contract.fechaInicio}
                onChange={(e) => setContract((c) => ({ ...c, fechaInicio: e.target.value }))} disabled={applied} />
            </Field>
            <Field instance="alta-fin" label="Fecha de finalización" htmlFor="alta-fin" hint="Vacío si es indefinido">
              <input id="alta-fin" type="date" value={contract.fechaFin ?? ''}
                onChange={(e) => setContract((c) => ({ ...c, fechaFin: e.target.value }))} disabled={applied} />
            </Field>
          </div>
        </section>

        <div className={styles.formFooter}>
          <Button type="button" variant="secondary" instance="alta-guardar" loading={saving} onClick={() => void save()} disabled={applied}>
            Guardar
          </Button>
          <Button type="button" variant="primary" instance="alta-pdf" onClick={() => void onPdf()} disabled={!ready}>
            Generar PDF
          </Button>
          <Button type="button" variant="secondary" instance="alta-crear-usuario" onClick={() => void onCreateUser()} disabled={applied || !ready}>
            {intake.profile_id ? 'Aplicar contrato' : 'Crear usuario'}
          </Button>
          <Button type="button" variant="secondary" instance="alta-vincular" onClick={() => setLinkOpen(true)} disabled={applied || !ready || Boolean(intake.profile_id)}>
            Vincular a un perfil
          </Button>
          {(status === 'pending_candidate' || status === 'submitted') && !intake.profile_id ? (
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
        title="Confirmar cambios del usuario"
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
        Esta acción sí modificará datos del usuario y sus condiciones laborales. No es necesaria para generar
        el PDF ni enviarlo a gestoría. ¿Quieres aplicar estos datos al perfil?
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
