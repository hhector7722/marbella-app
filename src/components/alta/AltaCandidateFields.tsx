'use client';

import { Field } from '@/components/ui/Field';
import type { CandidateFields } from '@/lib/alta-laboral/types.ts';

type Props = {
  values: CandidateFields;
  errors: Partial<Record<keyof CandidateFields, string>>;
  onChange: (field: keyof CandidateFields, value: string) => void;
  instancePrefix: string;
  disabled?: boolean;
};

export function AltaCandidateFields({ values, errors, onChange, instancePrefix, disabled }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <Field instance={`${instancePrefix}-first-name`} label="Nombre" htmlFor={`${instancePrefix}-first-name`} error={errors.firstName}>
        <input
          id={`${instancePrefix}-first-name`}
          autoComplete="given-name"
          value={values.firstName}
          onChange={(e) => onChange('firstName', e.target.value)}
          disabled={disabled}
        />
      </Field>
      <Field instance={`${instancePrefix}-last-name`} label="Apellidos" htmlFor={`${instancePrefix}-last-name`} error={errors.lastName}>
        <input
          id={`${instancePrefix}-last-name`}
          autoComplete="family-name"
          value={values.lastName}
          onChange={(e) => onChange('lastName', e.target.value)}
          disabled={disabled}
        />
      </Field>
      <Field instance={`${instancePrefix}-dni`} label="NIF / NIE / Pasaporte" htmlFor={`${instancePrefix}-dni`} error={errors.dni}>
        <input id={`${instancePrefix}-dni`} value={values.dni} onChange={(e) => onChange('dni', e.target.value)} disabled={disabled} />
      </Field>
      <Field
        instance={`${instancePrefix}-ss`}
        label="Nº de afiliación a la S.S."
        htmlFor={`${instancePrefix}-ss`}
        error={errors.afiliacionSeguridadSocial}
      >
        <input
          id={`${instancePrefix}-ss`}
          value={values.afiliacionSeguridadSocial}
          onChange={(e) => onChange('afiliacionSeguridadSocial', e.target.value)}
          disabled={disabled}
        />
      </Field>
      <Field instance={`${instancePrefix}-nacionalidad`} label="Nacionalidad" htmlFor={`${instancePrefix}-nacionalidad`} error={errors.nacionalidad}>
        <input
          id={`${instancePrefix}-nacionalidad`}
          value={values.nacionalidad}
          onChange={(e) => onChange('nacionalidad', e.target.value)}
          disabled={disabled}
        />
      </Field>
      <Field
        instance={`${instancePrefix}-nacimiento`}
        label="Fecha de nacimiento"
        htmlFor={`${instancePrefix}-nacimiento`}
        error={errors.fechaNacimiento}
      >
        <input
          id={`${instancePrefix}-nacimiento`}
          type="date"
          value={values.fechaNacimiento}
          onChange={(e) => onChange('fechaNacimiento', e.target.value)}
          disabled={disabled}
        />
      </Field>
      <Field instance={`${instancePrefix}-domicilio`} label="Domicilio completo" htmlFor={`${instancePrefix}-domicilio`} error={errors.domicilio}>
        <textarea
          id={`${instancePrefix}-domicilio`}
          rows={3}
          value={values.domicilio}
          onChange={(e) => onChange('domicilio', e.target.value)}
          disabled={disabled}
        />
      </Field>
      <Field instance={`${instancePrefix}-phone`} label="Teléfono" htmlFor={`${instancePrefix}-phone`} error={errors.phone}>
        <input
          id={`${instancePrefix}-phone`}
          type="tel"
          autoComplete="tel"
          value={values.phone}
          onChange={(e) => onChange('phone', e.target.value)}
          disabled={disabled}
        />
      </Field>
      <Field instance={`${instancePrefix}-email`} label="Correo electrónico" htmlFor={`${instancePrefix}-email`} error={errors.email}>
        <input
          id={`${instancePrefix}-email`}
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => onChange('email', e.target.value)}
          disabled={disabled}
        />
      </Field>
      <Field instance={`${instancePrefix}-iban`} label="IBAN" htmlFor={`${instancePrefix}-iban`} error={errors.bankAccount}>
        <input
          id={`${instancePrefix}-iban`}
          autoComplete="off"
          value={values.bankAccount}
          onChange={(e) => onChange('bankAccount', e.target.value)}
          disabled={disabled}
        />
      </Field>
    </div>
  );
}

export const EMPTY_CANDIDATE: CandidateFields = {
  firstName: '',
  lastName: '',
  dni: '',
  afiliacionSeguridadSocial: '',
  nacionalidad: '',
  fechaNacimiento: '',
  domicilio: '',
  phone: '',
  email: '',
  bankAccount: '',
};
