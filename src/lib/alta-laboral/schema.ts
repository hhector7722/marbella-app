import { z } from 'zod';
import { parseCivilYmd } from '../hours-engine/labor-conditions.ts';

const MAX_LENGTH = 200;
const MAX_ADDRESS = 400;

function trimmed(max: number) {
  return z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, 'Obligatorio')
    .refine((v) => v.length <= max, 'Demasiado largo');
}

const civilDate = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => parseCivilYmd(v) != null, 'Fecha no válida');

const email = trimmed(MAX_LENGTH).refine(
  (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  'Correo no válido',
);

const iban = z
  .string()
  .transform((v) => v.replace(/\s+/g, '').toUpperCase())
  .refine((v) => v.length > 0, 'Obligatorio')
  .refine((v) => /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v), 'IBAN no válido');

export const candidateFieldsSchema = z.object({
  firstName: trimmed(MAX_LENGTH),
  lastName: trimmed(MAX_LENGTH),
  dni: trimmed(32),
  afiliacionSeguridadSocial: trimmed(32),
  nacionalidad: trimmed(MAX_LENGTH),
  fechaNacimiento: civilDate,
  domicilio: trimmed(MAX_ADDRESS),
  phone: trimmed(32),
  email,
  bankAccount: iban,
});

export const contractFieldsSchema = z
  .object({
    categoria: trimmed(MAX_LENGTH),
    tipoContrato: trimmed(MAX_LENGTH),
    weeklyHours: z.coerce.number().finite().min(0, 'Las horas no pueden ser negativas'),
    fechaInicio: civilDate,
    fechaFin: z
      .string()
      .transform((v) => v.trim())
      .refine((v) => v === '' || parseCivilYmd(v) != null, 'Fecha no válida')
      .transform((v) => (v === '' ? null : v)),
  })
  .superRefine((value, ctx) => {
    if (value.fechaFin && value.fechaFin < value.fechaInicio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La fecha de fin no puede ser anterior al inicio',
        path: ['fechaFin'],
      });
    }
  });

export type CandidateFieldsParsed = z.infer<typeof candidateFieldsSchema>;
export type ContractFieldsParsed = z.infer<typeof contractFieldsSchema>;
