-- Restore the cash-closing breakdown for every employee role that can close cash.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.get_closing_sales_breakdown(date)'::regprocedure);
  old_check text := 'public.current_employee_role() IN (''manager'',''admin'')';
  new_check text := 'COALESCE(public.current_employee_role(), '''') IN (''manager'', ''admin'', ''supervisor'', ''staff'')';
BEGIN
  IF strpos(definition, old_check) = 0 THEN
    RAISE EXCEPTION 'Unexpected authorization check in get_closing_sales_breakdown(date)';
  END IF;

  EXECUTE replace(definition, old_check, new_check);
END;
$migration$;
