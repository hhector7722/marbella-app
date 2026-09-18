import type { EmploymentIntakeRow } from './types.ts';

export type MissingAltaField = { key: string; label: string };

const REQUIRED_FOR_PDF: Array<{ key: keyof EmploymentIntakeRow; label: string }> = [
  { key: 'first_name', label: 'Nombre' },
  { key: 'last_name', label: 'Apellidos' },
  { key: 'dni', label: 'NIF / NIE / Pasaporte' },
  { key: 'afiliacion_seguridad_social', label: 'Nº de afiliación a la S.S.' },
  { key: 'nacionalidad', label: 'Nacionalidad' },
  { key: 'fecha_nacimiento', label: 'Fecha de nacimiento' },
  { key: 'domicilio', label: 'Domicilio completo' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'email', label: 'Correo electrónico' },
  { key: 'bank_account', label: 'IBAN' },
  { key: 'dni_front_storage_path', label: 'Imagen delantera del documento' },
  { key: 'dni_back_storage_path', label: 'Imagen trasera del documento' },
  { key: 'categoria', label: 'Categoría' },
  { key: 'tipo_contrato', label: 'Tipo de contrato' },
  { key: 'weekly_hours', label: 'Horas semanales' },
  { key: 'fecha_inicio', label: 'Fecha de inicio' },
];

function isFilled(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  return String(value).trim() !== '';
}

export function missingAltaPdfFields(row: EmploymentIntakeRow): MissingAltaField[] {
  return REQUIRED_FOR_PDF.flatMap((field) =>
    isFilled(row[field.key]) ? [] : [{ key: field.key, label: field.label }],
  );
}

export function canGenerateAltaPdf(row: EmploymentIntakeRow): boolean {
  return missingAltaPdfFields(row).length === 0;
}
