-- Inventario · Borrador compartido del recuento (como pedidos).
--
-- El borrador no es el recuento: es el estado vivo de lo que se está contando.
-- Es compartido: cualquiera que abra Inventario ve lo que han apuntado los
-- demás, en tiempo real, y las cantidades persisten aunque se cierre la app.
-- Se vacía al guardar o al pulsar «Nuevo». El recuento capturado y certificado
-- vive en inventory_counts / inventory_count_lines (ADR-0019).

CREATE TABLE IF NOT EXISTS public.inventory_count_drafts (
  ingredient_id uuid PRIMARY KEY REFERENCES public.ingredients(id) ON DELETE CASCADE,
  quantity_barra numeric NOT NULL DEFAULT 0,
  quantity_camara numeric NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_count_drafts ENABLE ROW LEVEL SECURITY;

-- Compartido: cualquier persona autenticada lee y escribe el borrador.
DROP POLICY IF EXISTS inventory_count_drafts_authenticated ON public.inventory_count_drafts;
CREATE POLICY inventory_count_drafts_authenticated ON public.inventory_count_drafts
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.inventory_count_drafts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventory_count_drafts TO authenticated;

-- Realtime: que todos los dispositivos vean el mismo borrador en vivo.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_count_drafts;
  EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
  END;
END $$;
