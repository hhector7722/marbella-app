-- La lectura de rectificaciones usa prefijos ALB-LINE-<uuid>-REV.
-- El índice btree normal no acelera LIKE con la colación de producción.
create index if not exists stock_movements_reference_doc_prefix_idx
  on public.stock_movements (reference_doc varchar_pattern_ops)
  where reference_doc is not null;
