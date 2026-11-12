-- Endurecer funciones heredadas SECURITY DEFINER accesibles desde Data API.
-- No modificar resultados de perfiles autorizados; no confiar en controles de frontend.
DO $marbella_harden$
DECLARE
  f record;
  original text;
  body_sql text;
  replacement_sql text;
  ddl text;
  role_gate text := '((auth.uid() IS NOT NULL AND public.current_employee_role() IN (''manager'',''admin'')) OR COALESCE(auth.jwt()->>''role'','''')=''service_role'')';
  marker text := 'marbella_sales_role_gate_v1';
BEGIN
  FOR f IN
    SELECT p.oid, p.proname, l.lanname, pg_get_functiondef(p.oid) AS source_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' AND p.proname IN (
      'get_closing_sales_breakdown',
      'get_daily_sales_proration_weights_by_user',
      'get_hourly_sales_vs_labor',
      'get_product_sales_ranking',
      'get_ticket_sales_summary',
      'get_tickets_marbella_page',
      'get_weekday_ticket_analysis'
    )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',f.oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated,service_role',f.oid::regprocedure);
    IF f.proname NOT IN (
      'get_closing_sales_breakdown',
      'get_product_sales_ranking',
      'get_ticket_sales_summary',
      'get_tickets_marbella_page'
    ) OR position(marker in f.source_def)>0 THEN
      CONTINUE;
    END IF;
    original := f.source_def;
    IF f.lanname='plpgsql' THEN
      IF position('$function$' in original)=0 THEN RAISE EXCEPTION 'Unexpected delimiter for %',f.oid::regprocedure; END IF;
      body_sql := split_part(original,'$function$',2);
      IF position('BEGIN' in body_sql)=0 THEN RAISE EXCEPTION 'Cannot locate main BEGIN in %',f.oid::regprocedure; END IF;
      replacement_sql := overlay(body_sql placing
        'BEGIN' || chr(10) || '  -- ' || marker || chr(10) ||
        '  IF NOT ' || role_gate || ' THEN RAISE EXCEPTION ''forbidden''; END IF;' || chr(10)
        from position('BEGIN' in body_sql) for 5);
      ddl := replace(original, '$function$'||body_sql||'$function$',
        '$function$'||replacement_sql||'$function$');
      IF ddl=original THEN RAISE EXCEPTION 'Cannot rewrite PL/pgSQL function %',f.oid::regprocedure; END IF;
    ELSIF f.lanname='sql' THEN
      IF position('$function$' in original)=0 THEN RAISE EXCEPTION 'Unexpected SQL function delimiter for %',f.oid::regprocedure; END IF;
      body_sql := regexp_replace(btrim(split_part(original,'$function$',2)),';[[:space:]]*$','');
      IF f.proname='get_ticket_sales_summary' THEN
        replacement_sql := 'SELECT CASE WHEN '||role_gate||' THEN ('||body_sql||
          ') ELSE jsonb_build_object(''error'',''forbidden'') END;';
      ELSE
        replacement_sql := 'SELECT * FROM ('||body_sql||') AS authorized_rows WHERE '||role_gate||';';
      END IF;
      ddl := replace(original, '$function$'||split_part(original,'$function$',2)||'$function$',
        '$function$'||chr(10)||'-- '||marker||chr(10)||replacement_sql||chr(10)||'$function$');
      IF ddl=original THEN RAISE EXCEPTION 'Cannot rewrite SQL function %',f.oid::regprocedure; END IF;
    ELSE
      RAISE EXCEPTION 'Unexpected language % for %',f.lanname,f.oid::regprocedure;
    END IF;
    EXECUTE ddl;
  END LOOP;
END;
$marbella_harden$;
