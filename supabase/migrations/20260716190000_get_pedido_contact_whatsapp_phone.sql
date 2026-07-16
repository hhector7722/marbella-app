-- Teléfono WhatsApp del contacto del pedido cliente (perfil Héctor).
-- Readable por anon para la pantalla post-envío pública.
create or replace function public.get_pedido_contact_whatsapp_phone()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(trim(p.phone), '')
  from public.profiles p
  where lower(trim(coalesce(p.email, ''))) = 'hhector7722@gmail.com'
  limit 1;
$$;

comment on function public.get_pedido_contact_whatsapp_phone() is
  'Devuelve el teléfono de profiles (hhector7722@gmail.com) para WhatsApp post-pedido cliente.';

revoke all on function public.get_pedido_contact_whatsapp_phone() from public;
grant execute on function public.get_pedido_contact_whatsapp_phone() to anon;
grant execute on function public.get_pedido_contact_whatsapp_phone() to authenticated;
