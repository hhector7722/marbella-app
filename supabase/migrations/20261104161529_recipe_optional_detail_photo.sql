-- Optional image used only in the recipe detail view.
-- When NULL, the existing photo_url remains the image for both views.
alter table public.recipes
  add column if not exists photo_detail_url text;
