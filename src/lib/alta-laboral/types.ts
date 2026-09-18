export const INTAKE_STATUSES = [
  'pending_candidate',
  'submitted',
  'completed',
  'applied',
  'expired',
  'revoked',
] as const;

export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export const INTAKE_STATUS_LABEL: Record<IntakeStatus, string> = {
  pending_candidate: 'Pendiente de envío',
  submitted: 'Recibida',
  completed: 'Completada',
  applied: 'Aplicada',
  expired: 'Caducada',
  revoked: 'Revocada',
};

export type EmploymentIntakeRow = {
  id: string;
  token_hash: string;
  status: IntakeStatus;
  expires_at: string;
  created_by: string | null;
  created_at: string;
  submitted_at: string | null;
  completed_at: string | null;
  applied_at: string | null;
  revoked_at: string | null;
  first_name: string | null;
  last_name: string | null;
  dni: string | null;
  afiliacion_seguridad_social: string | null;
  nacionalidad: string | null;
  fecha_nacimiento: string | null;
  domicilio: string | null;
  phone: string | null;
  email: string | null;
  bank_account: string | null;
  dni_front_storage_path: string | null;
  dni_back_storage_path: string | null;
  categoria: string | null;
  tipo_contrato: string | null;
  weekly_hours: number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  profile_id: string | null;
};

export type CandidateFields = {
  firstName: string;
  lastName: string;
  dni: string;
  afiliacionSeguridadSocial: string;
  nacionalidad: string;
  fechaNacimiento: string;
  domicilio: string;
  phone: string;
  email: string;
  bankAccount: string;
};

export type ContractFields = {
  categoria: string;
  tipoContrato: string;
  weeklyHours: number | null;
  fechaInicio: string;
  fechaFin: string | null;
};

export type PublicIntakeState = 'open' | 'submitted' | 'expired' | 'invalid';
