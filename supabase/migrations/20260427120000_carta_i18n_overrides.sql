-- Carta i18n: nombres por idioma (ES/CA/EN) a nivel override
-- - La SSOT sigue siendo digital_menu_overrides (editable por manager)
-- - Las vistas consumen estos campos con fallback:
--   override_nombre_<lang> -> override_nombre -> articulo_nombre

begin;

alter table public.digital_menu_overrides
  add column if not exists override_nombre_es text;

alter table public.digital_menu_overrides
  add column if not exists override_nombre_ca text;

alter table public.digital_menu_overrides
  add column if not exists override_nombre_en text;

comment on column public.digital_menu_overrides.override_nombre_es is 'Nombre en carta (ES). Fallback: override_nombre -> bdp_articulos.nombre.';
comment on column public.digital_menu_overrides.override_nombre_ca is 'Nombre en carta (CA). Fallback: override_nombre -> bdp_articulos.nombre.';
comment on column public.digital_menu_overrides.override_nombre_en is 'Nombre en carta (EN). Fallback: override_nombre -> bdp_articulos.nombre.';

notify pgrst, 'reload schema';

commit;

