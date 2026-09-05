-- Datos personales de la ficha de empleado en el perfil.
-- El campo de documento (NIF/NIE/Pasaporte) ya lo cubre profiles.dni.
-- Estas cuatro columnas se rellenan a mano; no hay productor que las calcule.

begin;

alter table public.profiles
  add column if not exists afiliacion_seguridad_social text,
  add column if not exists nacionalidad text,
  add column if not exists fecha_nacimiento date,
  add column if not exists domicilio text;

comment on column public.profiles.afiliacion_seguridad_social is
  'Número de afiliación a la Seguridad Social del empleado.';
comment on column public.profiles.nacionalidad is
  'Nacionalidad del empleado.';
comment on column public.profiles.fecha_nacimiento is
  'Fecha de nacimiento del empleado.';
comment on column public.profiles.domicilio is
  'Domicilio del empleado.';

notify pgrst, 'reload schema';

commit;