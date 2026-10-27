-- Remitentes confirmados por el responsable de La Marbella, 27/10/2026.
-- Asociación por correo COMPLETO, nunca por dominio, porque hay Gmail y no-reply compartidos.
CREATE TABLE IF NOT EXISTS public.purchase_supplier_sender_addresses (
  sender_email text PRIMARY KEY CHECK (sender_email = lower(btrim(sender_email))
    AND sender_email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+),
  supplier_id bigint NOT NULL REFERENCES public.suppliers(id),
  confirmed_by_owner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_supplier_sender_addresses_supplier_idx
 ON public.purchase_supplier_sender_addresses (supplier_id);
ALTER TABLE public.purchase_supplier_sender_addresses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.purchase_supplier_sender_addresses FROM PUBLIC,anon;
GRANT SELECT ON public.purchase_supplier_sender_addresses TO authenticated;
DROP POLICY IF EXISTS purchase_supplier_sender_addresses_manager_read
 ON public.purchase_supplier_sender_addresses;
CREATE POLICY purchase_supplier_sender_addresses_manager_read
 ON public.purchase_supplier_sender_addresses FOR SELECT TO authenticated
 USING ((select auth.uid()) IS NOT NULL AND public.is_purchase_manager_or_admin());

DO $data$
DECLARE missing_names text;
BEGIN
  WITH seed(supplier_name,email) AS (VALUES
    ('Sanilec','pedido@sanilec.es'),
    ('Ametller','contabilidad.horeca@ametllerorigen.cat'),
    ('Shers','otificaciones@spairal.com'),
    ('Shers','grupserhs@grupserhs.com'),
    ('Fritz Ravich','peterdelperal@gmail.com'),
    ('Carnicas Pijuan','carnicaspijuan@gmail.com'),
    ('Sant Aniol','no-reply@santaniol.com'),
    ('Sant Aniol','sroca@santaniol.com'),
    ('Nestle','delegacion.barcelona@es.froneri.com'),
    ('Abril','julian@disabril.com'),
    ('Videla','facturacion@grupovidela.com'),
    ('Vino','x.castellet@cellercapcanes.com'),
    ('Santa Teresa','info@grupsantateresa.com'),
    ('Meritem','gjubert@meritem.es'),
    ('Panabad','facturacion@panabad.com'),
    ('Panabad','administracion@panabad.com'),
    ('Panabad','compras@panabad.com'),
    ('Zander','facturacion@zanderfoods.com')
  )
  SELECT string_agg(DISTINCT seed.supplier_name, ', ' ORDER BY seed.supplier_name)
   INTO missing_names
  FROM seed LEFT JOIN public.suppliers s ON lower(s.name)=lower(seed.supplier_name)
  WHERE s.id IS NULL;
  IF missing_names IS NOT NULL THEN
    RAISE EXCEPTION 'No se encontraron proveedores al registrar remitentes: %',missing_names;
  END IF;
  WITH seed(supplier_name,email) AS (VALUES
    ('Sanilec','pedido@sanilec.es'),
    ('Ametller','contabilidad.horeca@ametllerorigen.cat'),
    ('Shers','otificaciones@spairal.com'),
    ('Shers','grupserhs@grupserhs.com'),
    ('Fritz Ravich','peterdelperal@gmail.com'),
    ('Carnicas Pijuan','carnicaspijuan@gmail.com'),
    ('Sant Aniol','no-reply@santaniol.com'),
    ('Sant Aniol','sroca@santaniol.com'),
    ('Nestle','delegacion.barcelona@es.froneri.com'),
    ('Abril','julian@disabril.com'),
    ('Videla','facturacion@grupovidela.com'),
    ('Vino','x.castellet@cellercapcanes.com'),
    ('Santa Teresa','info@grupsantateresa.com'),
    ('Meritem','gjubert@meritem.es'),
    ('Panabad','facturacion@panabad.com'),
    ('Panabad','administracion@panabad.com'),
    ('Panabad','compras@panabad.com'),
    ('Zander','facturacion@zanderfoods.com')
  )
  INSERT INTO public.purchase_supplier_sender_addresses(sender_email,supplier_id,confirmed_by_owner)
  SELECT lower(seed.email),s.id,true
  FROM seed JOIN public.suppliers s ON lower(s.name)=lower(seed.supplier_name)
  ON CONFLICT (sender_email) DO UPDATE
    SET supplier_id=EXCLUDED.supplier_id,confirmed_by_owner=true;
END;
$data$;

-- Historical Gmail inbox (if already received) gets candidate supplier without
-- affecting its review status or any stock.
UPDATE public.purchase_email_documents doc
SET supplier_id=m.supplier_id
FROM public.purchase_supplier_sender_addresses m
WHERE doc.sender_email=m.sender_email AND doc.status='received' AND doc.supplier_id IS NULL;
),
  supplier_id bigint NOT NULL REFERENCES public.suppliers(id),
  confirmed_by_owner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_supplier_sender_addresses_supplier_idx
 ON public.purchase_supplier_sender_addresses (supplier_id);
ALTER TABLE public.purchase_supplier_sender_addresses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.purchase_supplier_sender_addresses FROM PUBLIC,anon;
GRANT SELECT ON public.purchase_supplier_sender_addresses TO authenticated;
DROP POLICY IF EXISTS purchase_supplier_sender_addresses_manager_read
 ON public.purchase_supplier_sender_addresses;
CREATE POLICY purchase_supplier_sender_addresses_manager_read
 ON public.purchase_supplier_sender_addresses FOR SELECT TO authenticated
 USING ((select auth.uid()) IS NOT NULL AND public.is_purchase_manager_or_admin());

DO $data$
DECLARE missing_names text;
BEGIN
  WITH seed(supplier_name,email) AS (VALUES
    ('Sanilec','pedido@sanilec.es'),
    ('Ametller','contabilidad.horeca@ametllerorigen.cat'),
    ('Shers','otificaciones@spairal.com'),
    ('Shers','grupserhs@grupserhs.com'),
    ('Fritz Ravich','peterdelperal@gmail.com'),
    ('Carnicas Pijuan','carnicaspijuan@gmail.com'),
    ('Sant Aniol','no-reply@santaniol.com'),
    ('Sant Aniol','sroca@santaniol.com'),
    ('Nestle','delegacion.barcelona@es.froneri.com'),
    ('Abril','julian@disabril.com'),
    ('Videla','facturacion@grupovidela.com'),
    ('Vino','x.castellet@cellercapcanes.com'),
    ('Santa Teresa','info@grupsantateresa.com'),
    ('Meritem','gjubert@meritem.es'),
    ('Panabad','facturacion@panabad.com'),
    ('Panabad','administracion@panabad.com'),
    ('Panabad','compras@panabad.com'),
    ('Zander','facturacion@zanderfoods.com')
  )
  SELECT string_agg(DISTINCT seed.supplier_name, ', ' ORDER BY seed.supplier_name)
   INTO missing_names
  FROM seed LEFT JOIN public.suppliers s ON lower(s.name)=lower(seed.supplier_name)
  WHERE s.id IS NULL;
  IF missing_names IS NOT NULL THEN
    RAISE EXCEPTION 'No se encontraron proveedores al registrar remitentes: %',missing_names;
  END IF;
  WITH seed(supplier_name,email) AS (VALUES
    ('Sanilec','pedido@sanilec.es'),
    ('Ametller','contabilidad.horeca@ametllerorigen.cat'),
    ('Shers','otificaciones@spairal.com'),
    ('Shers','grupserhs@grupserhs.com'),
    ('Fritz Ravich','peterdelperal@gmail.com'),
    ('Carnicas Pijuan','carnicaspijuan@gmail.com'),
    ('Sant Aniol','no-reply@santaniol.com'),
    ('Sant Aniol','sroca@santaniol.com'),
    ('Nestle','delegacion.barcelona@es.froneri.com'),
    ('Abril','julian@disabril.com'),
    ('Videla','facturacion@grupovidela.com'),
    ('Vino','x.castellet@cellercapcanes.com'),
    ('Santa Teresa','info@grupsantateresa.com'),
    ('Meritem','gjubert@meritem.es'),
    ('Panabad','facturacion@panabad.com'),
    ('Panabad','administracion@panabad.com'),
    ('Panabad','compras@panabad.com'),
    ('Zander','facturacion@zanderfoods.com')
  )
  INSERT INTO public.purchase_supplier_sender_addresses(sender_email,supplier_id,confirmed_by_owner)
  SELECT lower(seed.email),s.id,true
  FROM seed JOIN public.suppliers s ON lower(s.name)=lower(seed.supplier_name)
  ON CONFLICT (sender_email) DO UPDATE
    SET supplier_id=EXCLUDED.supplier_id,confirmed_by_owner=true;
END;
$data$;

-- Historical Gmail inbox (if already received) gets candidate supplier without
-- affecting its review status or any stock.
UPDATE public.purchase_email_documents doc
SET supplier_id=m.supplier_id
FROM public.purchase_supplier_sender_addresses m
WHERE doc.sender_email=m.sender_email AND doc.status='received' AND doc.supplier_id IS NULL;
