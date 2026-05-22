-- Carta QR (/carta): lectura de categorías menú y portadas para anon.
-- Sin esto, el catálogo puede quedar vacío y Plato Marbella no se reagrupa como en staff.

begin;

alter table public.categories enable row level security;

drop policy if exists "categories_anon_authenticated_read_menu" on public.categories;
create policy "categories_anon_authenticated_read_menu"
  on public.categories
  for select
  to anon, authenticated
  using (scope = 'menu');

notify pgrst, 'reload schema';

commit;
