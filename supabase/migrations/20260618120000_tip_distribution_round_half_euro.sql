-- ==============================================================================
-- confirm_tip_distribution: redondeo de total_amount al múltiplo de 0,50 € más cercano
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.confirm_tip_distribution(
    p_start_date date,
    p_end_date date,
    p_notes text DEFAULT NULL
)
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
    v_preview jsonb;
    v_distribution_id uuid;
    v_weekday_total numeric;
    v_weekend_total numeric;
    v_staff jsonb;
    v_uid uuid;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: authentication required';
    END IF;

    IF NOT public.is_manager_or_admin() THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: only manager/admin can confirm tip distribution';
    END IF;

    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: start_date and end_date are required';
    END IF;
    IF p_end_date < p_start_date THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: end_date must be >= p_start_date';
    END IF;

    v_preview := public.get_tip_pool_preview(p_start_date, p_end_date);

    v_weekday_total := COALESCE((v_preview->'pools'->'weekday'->>'cashTotal')::numeric, 0);
    v_weekend_total := COALESCE((v_preview->'pools'->'weekend'->>'cashTotal')::numeric, 0);
    v_staff := COALESCE(v_preview->'staff', '[]'::jsonb);

    INSERT INTO public.tip_distribution_history (
        period_start,
        period_end,
        weekday_total,
        weekend_total,
        confirmed_by,
        notes
    )
    VALUES (
        p_start_date,
        p_end_date,
        v_weekday_total,
        v_weekend_total,
        v_uid,
        p_notes
    )
    RETURNING id INTO v_distribution_id;

    INSERT INTO public.tip_distribution_lines (
        distribution_id,
        user_id,
        weekday_hours,
        weekend_hours,
        jornadas_totales,
        jornadas_con_olvido,
        tji_pct,
        penalizacion_pct,
        weekday_hours_effective,
        weekend_hours_effective,
        weekday_amount,
        weekend_amount,
        total_amount,
        weekday_bonus,
        weekend_bonus,
        is_sanctioned
    )
    SELECT
        v_distribution_id,
        (elem->>'id')::uuid,
        COALESCE((elem->>'weekdayHours')::numeric, 0),
        COALESCE((elem->>'weekendHours')::numeric, 0),
        COALESCE((elem->>'jornadasTotales')::int, 0),
        COALESCE((elem->>'jornadasConOlvido')::int, 0),
        COALESCE((elem->>'tjiPct')::numeric, 0),
        COALESCE((elem->>'penalizacionPct')::int, 0),
        COALESCE((elem->>'weekdayHoursEffective')::numeric, 0),
        COALESCE((elem->>'weekendHoursEffective')::numeric, 0),
        COALESCE((elem->>'weekdayAmount')::numeric, 0),
        COALESCE((elem->>'weekendAmount')::numeric, 0),
        ROUND(COALESCE((elem->>'totalAmount')::numeric, 0) * 2) / 2,
        CASE
            WHEN COALESCE((elem->>'isSanctioned')::boolean, false) THEN 0
            WHEN COALESCE((elem->>'weekdayAmount')::numeric, 0) + COALESCE((elem->>'weekendAmount')::numeric, 0) > 0
            THEN ROUND(
                COALESCE((elem->>'bonusAmount')::numeric, 0)
                * COALESCE((elem->>'weekdayAmount')::numeric, 0)
                / (
                    COALESCE((elem->>'weekdayAmount')::numeric, 0)
                    + COALESCE((elem->>'weekendAmount')::numeric, 0)
                ),
                2
            )
            ELSE COALESCE((elem->>'bonusAmount')::numeric, 0)
        END,
        CASE
            WHEN COALESCE((elem->>'isSanctioned')::boolean, false) THEN 0
            WHEN COALESCE((elem->>'weekdayAmount')::numeric, 0) + COALESCE((elem->>'weekendAmount')::numeric, 0) > 0
            THEN COALESCE((elem->>'bonusAmount')::numeric, 0)
                - ROUND(
                    COALESCE((elem->>'bonusAmount')::numeric, 0)
                    * COALESCE((elem->>'weekdayAmount')::numeric, 0)
                    / (
                        COALESCE((elem->>'weekdayAmount')::numeric, 0)
                        + COALESCE((elem->>'weekendAmount')::numeric, 0)
                    ),
                    2
                )
            ELSE 0
        END,
        COALESCE((elem->>'isSanctioned')::boolean, false)
    FROM jsonb_array_elements(v_staff) AS elem
    WHERE (elem->>'id') IS NOT NULL;

    RETURN v_distribution_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_tip_distribution(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_tip_distribution(date, date, text) TO authenticated;

COMMENT ON FUNCTION public.confirm_tip_distribution(date, date, text) IS
    'Confirma reparto de propinas; total_amount redondeado al múltiplo de 0,50 € más cercano. Solo manager/admin.';
