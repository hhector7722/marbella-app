-- Hotfix carta pública:
-- Las vistas de carta quedaron con security_invoker=true. Al entrar como anon,
-- las RLS de las tablas base filtraban todas las filas y /carta quedaba vacía.
--
-- La vista pública expone únicamente el subconjunto ya diseñado para QR/web.
-- v_digital_menu_items permanece inaccesible para anon y solo la consume la
-- vista pública (como owner) o usuarios autenticados.

begin;

alter view public.v_digital_menu_items
  set (security_invoker = false);

alter view public.v_public_menu_items
  set (security_invoker = false);

revoke all on public.v_digital_menu_items from public, anon;
grant select on public.v_digital_menu_items to authenticated;

revoke all on public.v_public_menu_items from public, anon, authenticated;
grant select on public.v_public_menu_items to anon, authenticated;

notify pgrst, 'reload schema';

commit;
