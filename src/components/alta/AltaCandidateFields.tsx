'use client';

import type { ReactNode } from 'react';
import { Field } from '@/components/ui/Field';
import { digitsPhoneEs, DEFAULT_CANDIDATE_EMAIL } from '@/lib/alta-laboral/contact.ts';
import { formatCivilDateEs } from '@/lib/alta-laboral/dates.ts';
import { nacionalidadOptions } from '@/lib/alta-laboral/nacionalidades.ts';
import type { CandidateFields } from '@/lib/alta-laboral/types.ts';

type Props = {
  values: CandidateFields;
  errors: Partial<Record<keyof CandidateFields, string>>;
  onChange: (field: keyof CandidateFields, value: string) => void;
  instancePrefix: string;
  disabled?: boolean;
  children?: ReactNode;
};

function placeCaretAtStart(input: HTMLInputElement) {
  if (input.value !== DEFAULT_CANDIDATE_EMAIL) return;
  requestAnimationFrame(() => input.setSelectionRange(0, 0));
}

function AltaBirthDateControl({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <div data-alta-date-wrap>
      <input
        tabIndex={-1}
        readOnly
        disabled={disabled}
        value={value ? formatCivilDateEs(value) : ''}
        aria-hidden
      />
      <input
        id={id}
        type="date"
        data-alta-date="cover"
        value={value}
        min="1920-01-01"
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          const picker = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
          if (typeof picker.showPicker !== 'function') return;
          try {
            picker.showPicker();
          } catch {
            /* el clic nativo ya abre el calendario */
          }
        }}
        disabled={disabled}
      />
    </div>
  );
}

export function AltaCandidateFields({ values, errors, onChange, instancePrefix, disabled, children }: Props) {
  const nacionalidades = nacionalidadOptions(values.nacionalidad);
  const phone = digitsPhoneEs(values.phone);

  return (
    <div data-alta-candidate-fields className="grid grid-cols-2 items-start gap-x-2">
      <div className="min-w-0">
        <Field instance={`${instancePrefix}-first-name`} label="Nombre" htmlFor={`${instancePrefix}-first-name`} error={errors.firstName}>
          <input
            id={`${instancePrefix}-first-name`}
            autoComplete="given-name"
            value={values.firstName}
            onChange={(e) => onChange('firstName', e.target.value)}
            disabled={disabled}
          />
        </Field>
      </div>
      <div className="min-w-0">
        <Field instance={`${instancePrefix}-last-name`} label="Apellidos" htmlFor={`${instancePrefix}-last-name`} error={errors.lastName}>
          <input
            id={`${instancePrefix}-last-name`}
            autoComplete="family-name"
            value={values.lastName}
            onChange={(e) => onChange('lastName', e.target.value)}
            disabled={disabled}
          />
        </Field>
      </div>
      <div className="min-w-0">
        <Field instance={`${instancePrefix}-dni`} label="NIF / NIE / Pasaporte" htmlFor={`${instancePrefix}-dni`} error={errors.dni}>
          <input id={`${instancePrefix}-dni`} value={values.dni} onChange={(e) => onChange('dni', e.target.value)} disabled={disabled} />
        </Field>
      </div>
      <div className="min-w-0">
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
      </div>
      <div className="min-w-0">
        <Field instance={`${instancePrefix}-nacionalidad`} label="Nacionalidad" htmlFor={`${instancePrefix}-nacionalidad`} error={errors.nacionalidad}>
          <select
            id={`${instancePrefix}-nacionalidad`}
            value={values.nacionalidad}
            onChange={(e) => onChange('nacionalidad', e.target.value)}
            disabled={disabled}
          >
            <option value="" />
            {nacionalidades.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="min-w-0">
        <Field
          instance={`${instancePrefix}-nacimiento`}
          label="Fecha de nacimiento"
          htmlFor={`${instancePrefix}-nacimiento`}
          error={errors.fechaNacimiento}
        >
          <AltaBirthDateControl
            id={`${instancePrefix}-nacimiento`}
            value={values.fechaNacimiento}
            onChange={(next) => onChange('fechaNacimiento', next)}
            disabled={disabled}
          />
        </Field>
      </div>
      <div className="col-span-2 min-w-0">
        <Field instance={`${instancePrefix}-domicilio`} label="Domicilio completo" htmlFor={`${instancePrefix}-domicilio`} error={errors.domicilio}>
          <input
            id={`${instancePrefix}-domicilio`}
            autoComplete="street-address"
            value={values.domicilio}
            onChange={(e) => onChange('domicilio', e.target.value)}
            disabled={disabled}
          />
        </Field>
      </div>
      <div className="min-w-0">
        <Field instance={`${instancePrefix}-phone`} label="Teléfono" htmlFor={`${instancePrefix}-phone`} error={errors.phone}>
          <input
            id={`${instancePrefix}-phone`}
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={9}
            value={phone}
            onChange={(e) => onChange('phone', digitsPhoneEs(e.target.value))}
            disabled={disabled}
          />
        </Field>
      </div>
      <div className="min-w-0">
        <Field instance={`${instancePrefix}-email`} label="Correo electrónico" htmlFor={`${instancePrefix}-email`} error={errors.email}>
          <input
            id={`${instancePrefix}-email`}
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => onChange('email', e.target.value)}
            onFocus={(e) => placeCaretAtStart(e.currentTarget)}
            disabled={disabled}
          />
        </Field>
      </div>
      <div className="col-span-2 min-w-0">
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
      {children}
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
  email: DEFAULT_CANDIDATE_EMAIL,
  bankAccount: '',
};
