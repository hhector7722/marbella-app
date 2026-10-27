-- 18 full email addresses linked to 14 existing suppliers by the owner.
CREATE TABLE IF NOT EXISTS public.purchase_supplier_sender_addresses (
 sender_email text PRIMARY KEY,
 supplier_id bigint NOT NULL REFERENCES public.suppliers(id),
 confirmed_by_owner boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT purchase_supplier_sender_email_lowercase CHECK (sender_email=lower(btrim(sender_email))),
 CONSTRAINT purchase_supplier_sender_email_shape CHECK (position('@' in sender_email)>1)
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
ON CONFLICT(sender_email) DO UPDATE
 SET supplier_id=EXCLUDED.supplier_id,confirmed_by_owner=true;

DO $verify$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM public.purchase_supplier_sender_addresses
 WHERE confirmed_by_owner AND sender_email IN (
  'pedido@sanilec.es',
  'contabilidad.horeca@ametllerorigen.cat',
  'otificaciones@spairal.com',
  'grupserhs@grupserhs.com',
  'peterdelperal@gmail.com',
  'carnicaspijuan@gmail.com',
  'no-reply@santaniol.com',
  'sroca@santaniol.com',
  'delegacion.barcelona@es.froneri.com',
  'julian@disabril.com',
  'facturacion@grupovidela.com',
  'x.castellet@cellercapcanes.com',
  'info@grupsantateresa.com',
  'gjubert@meritem.es',
  'facturacion@panabad.com',
  'administracion@panabad.com',
  'compras@panabad.com',
  'facturacion@zanderfoods.com'
 );
 IF n<>18 THEN RAISE EXCEPTION 'Expected 18 confirmed email addresses; got %',n;END IF;
END;
$verify$;

UPDATE public.purchase_email_documents d SET supplier_id=m.supplier_id
FROM public.purchase_supplier_sender_addresses m
WHERE d.status='received' AND d.sender_email=m.sender_email AND d.supplier_id IS NULL;
