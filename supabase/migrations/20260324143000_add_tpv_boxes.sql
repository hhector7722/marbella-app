-- Migration to add virtual TPV boxes for image management
-- This allows TPV 1 and TPV 2 to have persistent image_url values

-- 1. Correct check constraint to allow 'tpv' type
ALTER TABLE public.cash_boxes DROP CONSTRAINT IF EXISTS cash_boxes_type_check;
ALTER TABLE public.cash_boxes ADD CONSTRAINT cash_boxes_type_check CHECK (type IN ('operational', 'change', 'tpv'));

-- 2. Insert TPV 1
INSERT INTO public.cash_boxes (name, type)
VALUES ('TPV 1', 'tpv')
ON CONFLICT (name) DO NOTHING;

-- 3. Insert TPV 2
INSERT INTO public.cash_boxes (name, type)
VALUES ('TPV 2', 'tpv')
ON CONFLICT (name) DO NOTHING;
