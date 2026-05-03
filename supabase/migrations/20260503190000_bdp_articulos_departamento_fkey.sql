-- PostgREST: habilitar embed `bdp_articulos(..., bdp_departamentos(...))` cuando exista FK explícita.
-- Si hay `departamento_id` que no existen en `bdp_departamentos`, esta migración fallará: corregir datos y reintentar.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bdp_articulos_departamento_id_fkey'
      and conrelid = 'public.bdp_articulos'::regclass
  ) then
    alter table public.bdp_articulos
      add constraint bdp_articulos_departamento_id_fkey
      foreign key (departamento_id) references public.bdp_departamentos(id)
      on delete set null;
  end if;
end $$;

notify pgrst, 'reload schema';
