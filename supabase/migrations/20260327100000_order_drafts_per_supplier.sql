-- =============================================
-- Order drafts: shared per supplier (not per user)
-- So any user opening that supplier sees the same draft.
-- =============================================

-- 1. Add supplier_id (nullable first for backfill)
ALTER TABLE public.order_drafts
  ADD COLUMN IF NOT EXISTS supplier_id bigint REFERENCES public.suppliers(id) ON DELETE CASCADE;

-- 2. Backfill: set supplier_id from ingredient's supplier name
UPDATE public.order_drafts od
SET supplier_id = (
  SELECT s.id FROM public.suppliers s
  INNER JOIN public.ingredients i ON i.id = od.ingredient_id AND TRIM(BOTH FROM COALESCE(i.supplier, '')) = TRIM(BOTH FROM s.name)
  LIMIT 1
)
WHERE od.supplier_id IS NULL;

-- 3. Remove rows we could not backfill (no matching supplier)
DELETE FROM public.order_drafts WHERE supplier_id IS NULL;

-- 4. Make supplier_id NOT NULL
ALTER TABLE public.order_drafts ALTER COLUMN supplier_id SET NOT NULL;

-- 5. Drop policy that depends on user_id (must be before dropping column)
DROP POLICY IF EXISTS "Users can manage own drafts" ON public.order_drafts;

-- 6. Drop old PK and user_id
ALTER TABLE public.order_drafts DROP CONSTRAINT IF EXISTS order_drafts_pkey;
ALTER TABLE public.order_drafts DROP COLUMN IF EXISTS user_id;

-- 6b. Deduplicate: keep one row per (supplier_id, ingredient_id), the one with latest updated_at
DELETE FROM public.order_drafts od
WHERE od.ctid NOT IN (
  SELECT DISTINCT ON (supplier_id, ingredient_id) ctid
  FROM public.order_drafts
  ORDER BY supplier_id, ingredient_id, updated_at DESC NULLS LAST
);

-- 7. New primary key: one draft per supplier per ingredient
ALTER TABLE public.order_drafts
  ADD CONSTRAINT order_drafts_pkey PRIMARY KEY (supplier_id, ingredient_id);

-- 8. RLS: any authenticated user can read/write drafts (shared per supplier)
CREATE POLICY "Authenticated can manage drafts by supplier"
  ON public.order_drafts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
