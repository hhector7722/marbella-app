-- ==============================================================================
-- SEED CUENTA CORRIENTE MANAGER (LIBRO MAYOR PERSONAL)
-- Fuente: IMPORTAR-FACT.csv (crédito mensual 141,90€ + gastos asociados)
-- Cuenta exclusiva para el manager con email hhector7722@gmail.com
-- Asociada al user.id maestro baacc78a-b7da-438e-8ea4-c9f3ce6f90e6
-- ==============================================================================

DO $$
DECLARE
    v_master_user_id CONSTANT UUID := 'baacc78a-b7da-438e-8ea4-c9f3ce6f90e6';
BEGIN
    -- Inserción masiva de movimientos del histórico (2025–2026)
    INSERT INTO public.manager_ledger (movement_type, amount, concept, date, created_by)
    VALUES
        -- 2025-01
        ('entrada', 141.90, 'Crèdit mensual',    TIMESTAMPTZ '2025-01-01 10:01:00+01', v_master_user_id),
        ('salida',    5.84, 'Sant Aniol',        TIMESTAMPTZ '2025-01-20 10:02:00+01', v_master_user_id),
        ('salida',  100.00, 'Ordinador',         TIMESTAMPTZ '2025-01-21 10:03:00+01', v_master_user_id),

        -- 2025-02
        ('entrada', 141.90, 'Crèdit mensual',    TIMESTAMPTZ '2025-02-01 10:00:00+01', v_master_user_id),
        ('salida',  178.72, 'Bon Preu',          TIMESTAMPTZ '2025-02-25 10:00:00+01', v_master_user_id),

        -- 2025-03
        ('entrada', 141.90, 'Crèdit mensual',    TIMESTAMPTZ '2025-03-01 10:00:00+01', v_master_user_id),
        ('salida',  100.00, 'Ordinador',         TIMESTAMPTZ '2025-03-07 10:00:00+01', v_master_user_id),
        ('salida',    5.84, 'Sant Aniol',        TIMESTAMPTZ '2025-03-12 10:00:00+01', v_master_user_id),
        ('salida',   32.48, 'Bon Preu',          TIMESTAMPTZ '2025-03-18 10:00:00+01', v_master_user_id),
        ('salida',   70.06, 'Bon Preu',          TIMESTAMPTZ '2025-03-18 10:00:00+01', v_master_user_id),

        -- 2025-04
        ('entrada', 141.90, 'Crèdit mensual',    TIMESTAMPTZ '2025-04-01 10:04:00+02', v_master_user_id),
        ('salida',  100.00, 'Ordinador',         TIMESTAMPTZ '2025-04-01 10:05:00+02', v_master_user_id),

        -- 2025-05
        ('entrada', 141.90, 'Crèdit mensual',    TIMESTAMPTZ '2025-05-01 10:06:00+02', v_master_user_id),
        ('salida',  165.50, 'Bon Preu',          TIMESTAMPTZ '2025-05-01 10:07:00+02', v_master_user_id),

        -- 2025-06
        ('salida',  100.00, 'Bon Preu',          TIMESTAMPTZ '2025-06-01 10:08:00+02', v_master_user_id),
        ('entrada', 141.90, 'Crèdit mensual',    TIMESTAMPTZ '2025-06-01 10:09:00+02', v_master_user_id),
        ('salida',  100.00, 'Bon Preu',          TIMESTAMPTZ '2025-06-01 10:10:00+02', v_master_user_id),

        -- 2025-07
        ('salida',    5.84, 'Sant Aniol',        TIMESTAMPTZ '2025-07-01 10:11:00+02', v_master_user_id),
        ('entrada', 141.90, 'Crèdit mensual',    TIMESTAMPTZ '2025-07-01 10:12:00+02', v_master_user_id),

        -- 2025-08
        ('entrada', 141.90, 'Crèdit mensual',    TIMESTAMPTZ '2025-08-01 10:13:00+02', v_master_user_id),

        -- 2025-09
        ('entrada', 141.90, 'Crèdit mensual',    TIMESTAMPTZ '2025-09-01 10:00:00+02', v_master_user_id),
        ('salida',   50.36, 'Bon Preu',          TIMESTAMPTZ '2025-09-10 10:00:00+02', v_master_user_id),
        ('salida',   73.95, 'Bon Preu',          TIMESTAMPTZ '2025-09-22 10:00:00+02', v_master_user_id),
        ('salida',   46.82, 'Bon Preu',          TIMESTAMPTZ '2025-09-28 10:00:00+02', v_master_user_id),

        -- 2025-10
        ('entrada', 141.90, 'Crèdit mensual',    TIMESTAMPTZ '2025-10-01 10:00:00+02', v_master_user_id),

        -- 2025-11
        ('entrada', 141.90, 'Crèdit mensual',    TIMESTAMPTZ '2025-11-01 10:00:00+01', v_master_user_id),
        ('salida',   40.98, 'Bon Preu',          TIMESTAMPTZ '2025-11-06 10:00:00+01', v_master_user_id),
        ('salida',  219.33, 'Bon Preu',          TIMESTAMPTZ '2025-11-29 21:32:00+01', v_master_user_id),

        -- 2025-12
        ('entrada', 141.90, 'Crèdit mensual',    TIMESTAMPTZ '2025-12-01 10:01:00+01', v_master_user_id),
        ('salida',   73.55, 'Cafetera',          TIMESTAMPTZ '2025-12-16 05:07:00+01', v_master_user_id),
        ('salida',  308.45, 'Bon Preu',          TIMESTAMPTZ '2025-12-28 15:33:00+01', v_master_user_id),

        -- 2026-01..03
        ('entrada', 141.90, 'Credit mensual',    TIMESTAMPTZ '2026-01-01 03:52:00+01', v_master_user_id),
        ('entrada', 141.90, 'Credit mensual',    TIMESTAMPTZ '2026-02-01 03:52:00+01', v_master_user_id),
        ('entrada', 141.90, 'Credit mensual',    TIMESTAMPTZ '2026-03-01 03:52:00+01', v_master_user_id);
END $$;

