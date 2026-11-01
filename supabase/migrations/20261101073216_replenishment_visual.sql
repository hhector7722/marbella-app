-- Reposición visual: configuración operativa, independiente del stock contable.
-- El escaneo no escribe stock_movements ni modifica el inventario.
CREATE TABLE IF NOT EXISTS public.replenishment_fridges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.replenishment_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fridge_id uuid NOT NULL REFERENCES public.replenishment_fridges(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id),
  label text NOT NULL DEFAULT '' CHECK (char_length(label) <= 80),
  level_number integer NOT NULL CHECK (level_number BETWEEN 1 AND 30),
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 500),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS replenishment_slots_fridge_order_idx
  ON public.replenishment_slots(fridge_id, level_number, sort_order);

ALTER TABLE public.replenishment_fridges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replenishment_slots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.replenishment_fridges FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.replenishment_slots FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.replenishment_fridges TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.replenishment_slots TO authenticated;

-- Piloto privado: ni la lectura ni la escritura se conceden a otros empleados,
-- aunque intenten acceder directamente a la API de Supabase.
CREATE POLICY replenishment_fridges_owner ON public.replenishment_fridges
  FOR ALL TO authenticated
  USING (lower(coalesce((SELECT auth.jwt() ->> 'email'), '')) = 'hhector7722@gmail.com')
  WITH CHECK (lower(coalesce((SELECT auth.jwt() ->> 'email'), '')) = 'hhector7722@gmail.com');

CREATE POLICY replenishment_slots_owner ON public.replenishment_slots
  FOR ALL TO authenticated
  USING (lower(coalesce((SELECT auth.jwt() ->> 'email'), '')) = 'hhector7722@gmail.com')
  WITH CHECK (lower(coalesce((SELECT auth.jwt() ->> 'email'), '')) = 'hhector7722@gmail.com');
