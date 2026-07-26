'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import {
  FieldShell,
  controlClassName,
  type FieldShellProps,
} from './field'

type FieldMeta = Pick<
  FieldShellProps,
  'label' | 'description' | 'hint' | 'error' | 'className'
>

type TextFieldProps = Omit<React.ComponentProps<'input'>, 'type'> &
  FieldMeta & { type?: 'text' | 'email' | 'password' | 'tel' | 'url' }

function TextField({
  id,
  label,
  description,
  hint,
  error,
  className,
  type = 'text',
  ...props
}: TextFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell
      id={fieldId}
      label={label}
      description={description}
      hint={hint}
      error={error}
      className={className}
    >
      <Input
        id={fieldId}
        type={type}
        aria-invalid={error ? true : undefined}
        className={cn(controlClassName, 'h-auto py-0')}
        {...props}
      />
    </FieldShell>
  )
}

type NumberFieldProps = Omit<React.ComponentProps<'input'>, 'type'> & FieldMeta

function NumberField({
  id,
  label,
  description,
  hint,
  error,
  className,
  ...props
}: NumberFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell
      id={fieldId}
      label={label}
      description={description}
      hint={hint}
      error={error}
      className={className}
    >
      <Input
        id={fieldId}
        type="number"
        inputMode="decimal"
        aria-invalid={error ? true : undefined}
        className={cn(controlClassName, 'h-auto py-0 tabular-nums')}
        {...props}
      />
    </FieldShell>
  )
}

type CurrencyFieldProps = Omit<React.ComponentProps<'input'>, 'type'> &
  FieldMeta & { currencySymbol?: string }

function CurrencyField({
  id,
  label,
  description,
  hint,
  error,
  className,
  currencySymbol = '€',
  ...props
}: CurrencyFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell
      id={fieldId}
      label={label}
      description={description}
      hint={hint}
      error={error}
      className={className}
    >
      <div className="relative">
        <span
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-bold text-mds-muted"
          aria-hidden
        >
          {currencySymbol}
        </span>
        <Input
          id={fieldId}
          type="text"
          inputMode="decimal"
          aria-invalid={error ? true : undefined}
          className={cn(controlClassName, 'h-auto py-0 pl-8 tabular-nums')}
          {...props}
        />
      </div>
    </FieldShell>
  )
}

type DateFieldProps = Omit<React.ComponentProps<'input'>, 'type'> & FieldMeta

/** Valor string `YYYY-MM-DD`. No parsear con `new Date('YYYY-MM-DD')`. */
function DateField({
  id,
  label,
  description,
  hint,
  error,
  className,
  ...props
}: DateFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell
      id={fieldId}
      label={label}
      description={description}
      hint={hint}
      error={error}
      className={className}
    >
      <Input
        id={fieldId}
        type="date"
        aria-invalid={error ? true : undefined}
        className={cn(controlClassName, 'h-auto py-0')}
        {...props}
      />
    </FieldShell>
  )
}

type TimeFieldProps = Omit<React.ComponentProps<'input'>, 'type'> & FieldMeta

function TimeField({
  id,
  label,
  description,
  hint,
  error,
  className,
  ...props
}: TimeFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell
      id={fieldId}
      label={label}
      description={description}
      hint={hint}
      error={error}
      className={className}
    >
      <Input
        id={fieldId}
        type="time"
        aria-invalid={error ? true : undefined}
        className={cn(controlClassName, 'h-auto py-0 tabular-nums')}
        {...props}
      />
    </FieldShell>
  )
}

type SelectOption = { value: string; label: string; disabled?: boolean }

type SelectFieldProps = Omit<React.ComponentProps<'select'>, 'children'> &
  FieldMeta & { options: SelectOption[]; placeholder?: string }

function SelectField({
  id,
  label,
  description,
  hint,
  error,
  className,
  options,
  placeholder,
  ...props
}: SelectFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell
      id={fieldId}
      label={label}
      description={description}
      hint={hint}
      error={error}
      className={className}
    >
      <select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={cn(controlClassName, 'appearance-none')}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

type TextareaFieldProps = React.ComponentProps<'textarea'> & FieldMeta

function TextareaField({
  id,
  label,
  description,
  hint,
  error,
  className,
  rows = 4,
  ...props
}: TextareaFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell
      id={fieldId}
      label={label}
      description={description}
      hint={hint}
      error={error}
      className={className}
    >
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        className={cn(controlClassName, 'min-h-24 resize-y py-3')}
        {...props}
      />
    </FieldShell>
  )
}

type CheckboxFieldProps = Omit<React.ComponentProps<'input'>, 'type'> &
  FieldMeta

function CheckboxField({
  id,
  label,
  description,
  hint,
  error,
  className,
  ...props
}: CheckboxFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <div
      data-slot="mds-checkbox-field"
      className={cn('flex flex-col gap-1.5', className)}
    >
      <label
        htmlFor={fieldId}
        className="flex min-h-12 cursor-pointer items-start gap-3"
      >
        <input
          id={fieldId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          className="mt-1.5 size-5 shrink-0 rounded border-mds-border text-mds-primary accent-mds-primary focus-visible:ring-3 focus-visible:ring-mds-primary/20"
          {...props}
        />
        <span className="min-w-0 flex-1">
          {label ? (
            <span className="block text-sm font-bold text-mds-foreground">
              {label}
            </span>
          ) : null}
          {description ? (
            <span className="mt-0.5 block text-xs font-medium text-mds-muted">
              {description}
            </span>
          ) : null}
        </span>
      </label>
      {hint && !error ? (
        <p className="text-[10px] font-semibold text-mds-muted">{hint}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs font-bold text-mds-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

type SwitchFieldProps = Omit<React.ComponentProps<'input'>, 'type'> & FieldMeta

function SwitchField({
  id,
  label,
  description,
  hint,
  error,
  className,
  checked,
  ...props
}: SwitchFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <div
      data-slot="mds-switch-field"
      className={cn('flex flex-col gap-1.5', className)}
    >
      <label
        htmlFor={fieldId}
        className="flex min-h-12 cursor-pointer items-center justify-between gap-3"
      >
        <span className="min-w-0 flex-1">
          {label ? (
            <span className="block text-sm font-bold text-mds-foreground">
              {label}
            </span>
          ) : null}
          {description ? (
            <span className="mt-0.5 block text-xs font-medium text-mds-muted">
              {description}
            </span>
          ) : null}
        </span>
        <span className="relative inline-flex h-7 w-12 shrink-0 items-center">
          <input
            id={fieldId}
            type="checkbox"
            role="switch"
            checked={checked}
            aria-invalid={error ? true : undefined}
            className="peer sr-only"
            {...props}
          />
          <span
            aria-hidden
            className={cn(
              'absolute inset-0 rounded-full border border-mds-border bg-mds-muted-surface transition-colors',
              'peer-checked:border-mds-primary peer-checked:bg-mds-primary',
              'peer-focus-visible:ring-3 peer-focus-visible:ring-mds-primary/20'
            )}
          />
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute top-0.5 left-0.5 size-6 rounded-full bg-mds-surface shadow-sm transition-transform',
              'peer-checked:translate-x-5'
            )}
          />
        </span>
      </label>
      {hint && !error ? (
        <p className="text-[10px] font-semibold text-mds-muted">{hint}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs font-bold text-mds-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export {
  TextField,
  NumberField,
  CurrencyField,
  DateField,
  TimeField,
  SelectField,
  TextareaField,
  CheckboxField,
  SwitchField,
}
export type {
  TextFieldProps,
  NumberFieldProps,
  CurrencyFieldProps,
  DateFieldProps,
  TimeFieldProps,
  SelectFieldProps,
  SelectOption,
  TextareaFieldProps,
  CheckboxFieldProps,
  SwitchFieldProps,
}
