-- Una posición visible puede corresponder a una pila de varias latas.
-- En botellas sin apilar, el multiplicador es 1.
ALTER TABLE public.replenishment_slots
  ADD COLUMN IF NOT EXISTS units_per_position integer NOT NULL DEFAULT 1
  CHECK (units_per_position BETWEEN 1 AND 20);

COMMENT ON COLUMN public.replenishment_slots.units_per_position IS
  'Unidades físicas que se presuponen completas bajo una posición visible. La visión no confirma unidades ocultas.';
