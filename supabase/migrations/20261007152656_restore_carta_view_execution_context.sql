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
