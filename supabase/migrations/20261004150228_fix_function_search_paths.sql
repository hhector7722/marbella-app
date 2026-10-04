-- Pin search_path on application functions flagged by the Supabase linter.
-- Function bodies and permissions are unchanged.
-- Applied to production as migration 20261004150228.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE (
      (n.nspname = 'public' AND p.proname IN (
        'current_employee_role',
        'trg_set_updated_at',
        'get_iso_week_start',
        'calculate_time_log_hours',
        'init_box_inventory',
        'close_weekly_hours',
        'update_weekly_bank',
        'set_weekly_target',
        'fn_round_marbella_hours',
        'get_manager_ledger_balance',
        'get_working_date',
        'fncalcdelta',
        'fn_calculate_and_insert_delta',
        'update_updated_at_column',
        'fn_process_comandero_event',
        'normalize_pricing_unit',
        'fn_emit_kds_events_from_sala',
        'ticket_effective_reception_ts',
        'calcular_cierre_dia',
        'fn_sync_cash_inventory',
        'fn_calculate_rounded_hours',
        'rpc_recalculate_all_balances',
        'fn_sync_cash_box_inventory',
        'get_daily_labor_cost',
        'get_cash_closings_summary',
        'process_cash_exchange',
        'normalize_kds_name',
        'get_theoretical_balance',
        'manager_ledger_business_ts',
        'rpc_recalculate_user_balances_from_week',
        'fn_trg_process_kds_from_sala_v1',
        'prevent_evidence_mutation',
        'rpc_recalculate_all_users_from_week',
        'get_weekly_worker_stats',
        'fn_trg_process_kds_from_sala',
        'get_financial_statement',
        'rpc_recalculate_all_balances_from_week',
        'update_activity_occurrences_updated_at',
        'delete_activity_occurrences_by_date',
        'replace_payroll_month_atomic',
        'get_my_employee_id',
        'get_ticket_lines',
        'fn_sync_box_inventory_v3',
        'invoice_line_price_to_purchase_unit',
        'menu_board_items_guard',
        'ingredient_prices_are_equal',
        'pack_price_for_target_current',
        'menu_board_categories_lock_layout'
      ))
      OR (n.nspname = 'kds_internal' AND p.proname = 'normalize_notes')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(coalesce(p.proconfig, array[]::text[])) AS c
      WHERE c LIKE 'search_path=%'
    )
  LOOP
    IF r.schema_name = 'kds_internal' THEN
      EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path TO kds_internal, public, extensions',
        r.schema_name,
        r.function_name,
        r.identity_args
      );
    ELSE
      EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path TO public, extensions',
        r.schema_name,
        r.function_name,
        r.identity_args
      );
    END IF;
  END LOOP;
END
$$;
