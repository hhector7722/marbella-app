-- Supabase's default grants explicitly give anon EXECUTE on newly created routines.
-- The function already validates auth.uid and manager role; remove that exposure.
REVOKE ALL ON FUNCTION public.mutate_settled_tpv2_purchase(uuid,text,text,jsonb,timestamptz)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mutate_settled_tpv2_purchase(uuid,text,text,jsonb,timestamptz)
    TO authenticated;

REVOKE ALL ON TABLE public.tpv2_purchase_change_audit FROM anon, authenticated;
GRANT SELECT ON TABLE public.tpv2_purchase_change_audit TO authenticated;
