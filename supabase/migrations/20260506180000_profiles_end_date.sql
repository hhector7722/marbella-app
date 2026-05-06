-- Añade fecha de finalización del trabajador.
-- Regla de producto: si existe end_date (no NULL), el empleado se considera inactivo y no debe aparecer en listados por defecto.

alter table if exists public.profiles
add column if not exists end_date date;

comment on column public.profiles.end_date is
'Fecha de finalización del trabajador. Si no es NULL, el empleado se considera inactivo y se oculta por defecto en la app.';

