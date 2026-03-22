-- Horas redondeadas (Marbella) por usuario en una fecha laboral (Madrid).
-- Usado en coste laboral: % M.O./ventas prorrateando venta del día por horas trabajadas.
CREATE OR REPLACE FUNCTION public.get_daily_rounded_hours_by_user(p_date date)
RETURNS TABLE (user_id uuid, hours numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        tl.user_id,
        SUM(public.fn_round_marbella_hours(tl.total_hours))::numeric AS hours
    FROM public.time_logs tl
    WHERE public.get_working_date(tl.clock_in) = p_date
      AND tl.total_hours IS NOT NULL
    GROUP BY tl.user_id
    HAVING SUM(public.fn_round_marbella_hours(tl.total_hours)) > 0;
$$;

COMMENT ON FUNCTION public.get_daily_rounded_hours_by_user(date) IS
    'Suma de horas redondeadas por usuario en un día (get_working_date = Madrid).';

GRANT EXECUTE ON FUNCTION public.get_daily_rounded_hours_by_user(date) TO authenticated;
