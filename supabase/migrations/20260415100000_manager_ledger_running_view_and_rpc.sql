-- Libro Mayor (manager_ledger): saldo acumulado en BD + mutaciones con fecha contable
-- El running_balance se calcula con ventana ORDER BY date ASC, id ASC (recalcula todo el flujo al cambiar fechas/importes).

CREATE OR REPLACE VIEW public.v_manager_ledger_with_running AS
SELECT
    ml.id,
    ml.movement_type,
    ml.amount,
    ml.concept,
    ml.date,
    ml.created_by,
    SUM(
        CASE
            WHEN ml.movement_type = 'entrada' THEN ml.amount
            ELSE -ml.amount
        END
    ) OVER (
        ORDER BY ml.date ASC, ml.id ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_balance
FROM public.manager_ledger ml;

COMMENT ON VIEW public.v_manager_ledger_with_running IS
    'Movimientos del libro mayor con saldo acumulado global (ventana sobre date, id).';

GRANT SELECT ON public.v_manager_ledger_with_running TO authenticated;
GRANT SELECT ON public.v_manager_ledger_with_running TO service_role;

-- Fecha contable a mediodía Europe/Madrid (evita cortes de día por TZ al enviar solo YYYY-MM-DD)
CREATE OR REPLACE FUNCTION public.manager_ledger_business_ts(p_entry_date date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
SELECT ((p_entry_date + time '12:00') AT TIME ZONE 'Europe/Madrid');
$$;

CREATE OR REPLACE FUNCTION public.manager_ledger_insert_entry(
    p_movement_type text,
    p_amount numeric,
    p_concept text,
    p_entry_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'manager'
    ) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    IF p_movement_type IS NULL OR p_movement_type NOT IN ('entrada', 'salida') THEN
        RAISE EXCEPTION 'invalid movement_type';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'invalid amount';
    END IF;

    IF p_concept IS NULL OR btrim(p_concept) = '' THEN
        RAISE EXCEPTION 'concept required';
    END IF;

    IF p_entry_date IS NULL THEN
        RAISE EXCEPTION 'entry_date required';
    END IF;

    INSERT INTO public.manager_ledger (movement_type, amount, concept, date, created_by)
    VALUES (
        p_movement_type,
        p_amount,
        btrim(p_concept),
        public.manager_ledger_business_ts(p_entry_date),
        auth.uid()
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.manager_ledger_update_entry(
    p_id uuid,
    p_movement_type text,
    p_amount numeric,
    p_concept text,
    p_entry_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'manager'
    ) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    IF p_movement_type IS NULL OR p_movement_type NOT IN ('entrada', 'salida') THEN
        RAISE EXCEPTION 'invalid movement_type';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'invalid amount';
    END IF;

    IF p_concept IS NULL OR btrim(p_concept) = '' THEN
        RAISE EXCEPTION 'concept required';
    END IF;

    IF p_entry_date IS NULL THEN
        RAISE EXCEPTION 'entry_date required';
    END IF;

    UPDATE public.manager_ledger
    SET
        movement_type = p_movement_type,
        amount = p_amount,
        concept = btrim(p_concept),
        date = public.manager_ledger_business_ts(p_entry_date)
    WHERE id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'entry not found';
    END IF;
END;
$$;

ALTER FUNCTION public.manager_ledger_insert_entry(text, numeric, text, date) OWNER TO postgres;
ALTER FUNCTION public.manager_ledger_update_entry(uuid, text, numeric, text, date) OWNER TO postgres;
ALTER FUNCTION public.manager_ledger_business_ts(date) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.manager_ledger_insert_entry(text, numeric, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manager_ledger_update_entry(uuid, text, numeric, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manager_ledger_business_ts(date) TO authenticated;
