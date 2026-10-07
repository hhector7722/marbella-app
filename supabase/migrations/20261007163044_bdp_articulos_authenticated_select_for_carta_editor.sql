-- Restore authenticated read access required by the internal carta editor.
-- /staff/carta builds its editable catalogue client-side from map_tpv_receta
-- joined with bdp_articulos. RLS without a SELECT policy returned zero articles.

drop policy if exists "bdp_articulos_authenticated_select" on public.bdp_articulos;

create policy "bdp_articulos_authenticated_select"
  on public.bdp_articulos
  for select
  to authenticated
  using (true);
