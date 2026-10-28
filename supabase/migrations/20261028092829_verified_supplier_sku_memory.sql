
CREATE TABLE IF NOT EXISTS public.purchase_supplier_sku_rules (
 supplier_id bigint NOT NULL REFERENCES public.suppliers(id),
 supplier_code text NOT NULL CHECK (supplier_code ~ '^[A-Z0-9_-]{2,40}$'),
 expected_description text NOT NULL,
 ingredient_id uuid NOT NULL REFERENCES public.ingredients(id),
 mapping_version_id uuid NOT NULL REFERENCES public.purchase_mapping_versions(id),
 owner_confirmed_at timestamptz NOT NULL DEFAULT now(),
 note text NOT NULL DEFAULT '',
 PRIMARY KEY (supplier_id,supplier_code)
);
ALTER TABLE public.purchase_supplier_sku_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.purchase_supplier_sku_rules FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.purchase_supplier_sku_rules TO service_role;

INSERT INTO public.purchase_mapping_versions
(supplier_id,supplier_item_name,ingredient_id,conversion_factor,line_billing_unit,line_content_qty,line_content_unit,status,confirmed_by,confirmed_at,idempotency_key,note)
SELECT s.id, v.description,i.id,1,'ud',1,'ud','confirmed',p.id,now(),
 'owner-verified-sanilec-sku-20261028:' || v.code,
 'Confirmado por el propietario: el albarán factura estropajos individuales; sin recepción retroactiva'
FROM (VALUES
 ('BA1160','ESTROPAJO NANAS (PAK.12) mult RPP: ENV/2023/000017227','Estropajo'),
 ('BA1180','ESTROPAJO UNINOX (Pack 6 Uds.) mult RPP: ENV/2023/000017227','Estropajo')
) AS v(code,description,ingredient_name)
JOIN public.suppliers s ON s.name='Sanilec'
JOIN public.ingredients i ON i.name=v.ingredient_name
JOIN public.profiles p ON lower(p.email)='hhector7722@gmail.com' AND p.role='manager'
WHERE NOT EXISTS (SELECT 1 FROM public.purchase_mapping_versions old
 WHERE old.idempotency_key='owner-verified-sanilec-sku-20261028:' || v.code);

WITH seed (code,description,ingredient_name,billing,factor) AS (VALUES
 ('TW1330','^ BOWL BIONIC NATURAL 350ml. Caja (24 pak x50Uds.) gp RPP: ENV/2023/000001721','Bol 350 ml','pack',50::numeric),
 ('TW5100','^ PALETINA MADERA CAFE 0,5x11,4x0,15 cms. (Pak 1.000 Uds) gp','Paletinas café','pack',1000::numeric),
 ('TW1073','BANDEJA Bionic 700 MI 27x16,7x2,6 cm Bagazo Kraft (Pack 50 uds) (Caja 8 packs)gp','Bandejas bocadillos','pack',50::numeric),
 ('TW1750','VASO CARTON Kraft 8oz (Pak 50 Uds)(Cj.20 Paks) do RPP: ENV/2023/000030369','Vasos 240ml','pack',50::numeric),
 ('QM3081','MULTIGRAS PLANCHAS Desengrasante temp. moderada Env. 6 kg. dm RPP: ENV/2023/000','Desengrasante','kg',1::numeric),
 ('BA1180','ESTROPAJO UNINOX (Pack 6 Uds.) mult RPP: ENV/2023/000017227','Estropajo','ud',1::numeric),
 ('BA1160','ESTROPAJO NANAS (PAK.12) mult RPP: ENV/2023/000017227','Estropajo','ud',1::numeric)
)
INSERT INTO public.purchase_supplier_sku_rules
(supplier_id,supplier_code,expected_description,ingredient_id,mapping_version_id,note)
SELECT s.id,seed.code,seed.description,i.id,v.id,
 'Equivalencias de cantidades y presentación confirmadas 28/10/2026; historial conservado.'
FROM seed
JOIN public.suppliers s ON s.name='Sanilec'
JOIN public.ingredients i ON i.name=seed.ingredient_name
JOIN LATERAL (
 SELECT mv.id FROM public.purchase_mapping_versions mv
 WHERE mv.supplier_id=s.id AND mv.ingredient_id=i.id AND mv.status='confirmed'
 AND lower(mv.line_billing_unit)=seed.billing AND mv.conversion_factor=seed.factor
 AND (mv.supplier_item_name=seed.description
   OR (seed.code IN ('TW1330','TW1750','QM3081')
   AND mv.supplier_item_name ILIKE CASE seed.code
   WHEN 'TW1330' THEN '%BOWL BIONIC NATURAL 350%'
   WHEN 'TW1750' THEN '%VASO CARTON Kraft 8oz%'
   ELSE '%MULTIGRAS PLANCHAS%' END))
 ORDER BY (mv.supplier_item_name=seed.description) DESC,mv.created_at DESC LIMIT 1
) v ON true
ON CONFLICT (supplier_id,supplier_code) DO UPDATE
 SET expected_description=EXCLUDED.expected_description,ingredient_id=EXCLUDED.ingredient_id,
 mapping_version_id=EXCLUDED.mapping_version_id,owner_confirmed_at=now(),note=EXCLUDED.note;

DO $$ BEGIN
 IF (SELECT count(*) FROM public.purchase_supplier_sku_rules r JOIN public.suppliers s ON s.id=r.supplier_id WHERE s.name='Sanilec' AND r.supplier_code IN ('TW1330','TW5100','TW1073','TW1750','QM3081','BA1180','BA1160')) <> 7 THEN
 RAISE EXCEPTION 'Incomplete owner-verified Sanilec rules';
 END IF;
END $$;