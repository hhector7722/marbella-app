import type { EmploymentIntakeRow } from './types.ts';

type Person = {
  first_name: string | null; last_name: string | null; dni: string | null;
  afiliacion_seguridad_social: string | null; nacionalidad: string | null;
  fecha_nacimiento: string | null; domicilio: string | null; phone: string | null;
  email: string | null; bank_account: string | null; contracted_hours_weekly: number | null;
};
type Prior = Partial<EmploymentIntakeRow> | null;
type LastTerm = { weekly_hours: number | null } | null;

/** Una reincorporación es un expediente nuevo, nunca una edición del perfil ni del contrato anterior. */
export function buildRehireDraft(person: Person, prior: Prior, lastTerm: LastTerm) {
  const current = (value: string | null, previous: string | null | undefined) =>
    value?.trim() || previous?.trim() || null;
  return {
    first_name: current(person.first_name, prior?.first_name),
    last_name: current(person.last_name, prior?.last_name),
    dni: current(person.dni, prior?.dni),
    afiliacion_seguridad_social: current(person.afiliacion_seguridad_social, prior?.afiliacion_seguridad_social),
    nacionalidad: current(person.nacionalidad, prior?.nacionalidad),
    fecha_nacimiento: current(person.fecha_nacimiento, prior?.fecha_nacimiento),
    domicilio: current(person.domicilio, prior?.domicilio),
    phone: current(person.phone, prior?.phone),
    email: current(person.email, prior?.email),
    bank_account: current(person.bank_account, prior?.bank_account),
    categoria: prior?.categoria ?? null,
    tipo_contrato: prior?.tipo_contrato ?? null,
    weekly_hours: lastTerm?.weekly_hours ?? person.contracted_hours_weekly ?? prior?.weekly_hours ?? null,
    fecha_inicio: null,
    fecha_fin: null,
  };
}
