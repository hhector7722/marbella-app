alter table public.recipe_kitchen_sheets
  add column if not exists orientation text not null default 'landscape'
    check (orientation in ('landscape', 'portrait'));

alter table public.recipe_kitchen_sheets
  add column if not exists main_image_url text;
