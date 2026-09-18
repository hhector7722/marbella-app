'use client';

import { useRef } from 'react';
import { Calendar } from 'lucide-react';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/button';
import { appendGmailAddress, digitsPhoneEs } from '@/lib/alta-laboral/contact.ts';
import { formatCivilDateEs } from '@/lib/alta-laboral/dates.ts';
import { nacionalidadOptions } from '@/lib/alta-laboral/nacionalidades.ts';
import type { CandidateFields } from '@/lib/alta-laboral/types.ts';

type Props = {
  values: CandidateFields;
  errors: Partial<Record<keyof CandidateFields, string>>;
  onChange: (field: keyof CandidateFields, value: string) => void;
  instancePrefix: string;
  disabled?: boolean;
};

function openDatePicker(input: HTMLInputElement | null) {
  if (!input) return;
  const picker = input as HTMLInputElement & { showPicker?: () => void };
  if (typeof picker.showPicker === 'function') picker.showPicker();
  else {
    input.focus();
    input.click();
  }
}

function AltaBirthDateControl({
  id,
  value,
  onChange,
  disabled,
  error,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const label = value ? formatCivilDateEs(value) : 'Elegir fecha';

  return (
    <div className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => openDatePicker(ref.current)}
        className="flex w-full min-h-[var(--tactil-minimo)] items-center gap-1.5 rounded-[var(--radio-control)] border border-[var(--color-borde-marcado)] bg-[var(--color-superficie)] px-[var(--espacio-2)] text-left text-base font-bold text-[var(--color-texto)]"
        aria-invalid={error ? true : undefined}
      >
        <Calendar size={14} className="shrink-0 opacity-80" aria-hidden />
        <span className="min-w-0 truncate">{label}</span>
      </button>
      <input
        ref={ref}
        type="date"
        data-picker="overlay"
        tabIndex={-1}
        aria-hidden
        value={value}
        min="1920-01-01"
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

export function AltaCandidateFields({ values, errors, onChange, instancePrefix, disabled }: Props) {
  const nacionalidades = nacionalidadOptions(values.nacionalidad);
  const phone = digitsPhoneEs(values.phone);

  return (
    <div data-alta-candidate-fields className="grid grid-cols-2 items-start gap-x-2 gap-y-2">
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
            <option value="">Elige nacionalidad</option>
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
            error={errors.fechaNacimiento}
          />
        </Field>
      </div>
      <div className="col-span-2 min-w-0">
        <Field instance={`${instancePrefix}-domicilio`} label="Domicilio completo" htmlFor={`${instancePrefix}-domicilio`} error={errors.domicilio}>
          <textarea
            id={`${instancePrefix}-domicilio`}
            rows={2}
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
      <div className="flex min-w-0 flex-col">
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
        <Button
          type="button"
          variant="secondary"
          instance={`${instancePrefix}-gmail`}
          layout="hug"
          className="self-start"
          disabled={disabled}
          onClick={() => onChange('email', appendGmailAddress(values.email))}
        >
          @gmail.com
        </Button>
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
