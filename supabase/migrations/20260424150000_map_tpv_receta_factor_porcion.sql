-- map_tpv_receta: asegurar columna factor_porcion para mapeo TPV→receta
-- Necesario para editor `/dashboard/recetas-tpv` y para deducción de stock por ventas.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'map_tpv_receta'
      and column_name = 'factor_porcion'
  ) then
    alter table public.map_tpv_receta
      add column factor_porcion numeric(10,2) not null default 1.00;
  end if;
end $$;

