import type { CandidateFields, ContractFields, EmploymentIntakeRow } from './types.ts';

export function candidateToRow(fields: CandidateFields): Partial<EmploymentIntakeRow> {
  return {
    first_name: fields.firstName,
    last_name: fields.lastName,
    dni: fields.dni,
    afiliacion_seguridad_social: fields.afiliacionSeguridadSocial,
    nacionalidad: fields.nacionalidad,
    fecha_nacimiento: fields.fechaNacimiento,
    domicilio: fields.domicilio,
    phone: fields.phone,
    email: fields.email,
    bank_account: fields.bankAccount,
  };
}

export function contractToRow(fields: ContractFields): Partial<EmploymentIntakeRow> {
  return {
    categoria: fields.categoria,
    tipo_contrato: fields.tipoContrato,
    weekly_hours: fields.weeklyHours,
    fecha_inicio: fields.fechaInicio,
    fecha_fin: fields.fechaFin,
  };
}

export type ProfilePersonalPatch = {
  first_name: string;
  last_name: string;
  dni: string;
  afiliacion_seguridad_social: string;
  nacionalidad: string;
  fecha_nacimiento: string;
  domicilio: string;
  phone: string;
  email: string;
  bank_account: string;
  joining_date: string | null;
  end_date: string | null;
  contracted_hours_weekly: number;
  role: string;
  visible_in_plantilla: boolean;
};

export function intakeToProfilePatch(row: EmploymentIntakeRow): ProfilePersonalPatch {
  return {
    first_name: row.first_name ?? '',
    last_name: row.last_name ?? '',
    dni: row.dni ?? '',
    afiliacion_seguridad_social: row.afiliacion_seguridad_social ?? '',
    nacionalidad: row.nacionalidad ?? '',
    fecha_nacimiento: row.fecha_nacimiento ?? '',
    domicilio: row.domicilio ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    bank_account: row.bank_account ?? '',
    joining_date: row.fecha_inicio,
    end_date: row.fecha_fin,
    contracted_hours_weekly: Number(row.weekly_hours ?? 0),
    role: 'staff',
    visible_in_plantilla: true,
  };
}

export function existingProfileHasSensitiveData(profile: {
  dni?: string | null;
  bank_account?: string | null;
}): boolean {
  return Boolean(String(profile.dni ?? '').trim() || String(profile.bank_account ?? '').trim());
}
