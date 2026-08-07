-- Fase 2: Soporte para múltiples liquidaciones y atomicidad de lote mensual

-- Añadir columna settlement_hash
ALTER TABLE employee_payroll_facts
ADD COLUMN IF NOT EXISTS settlement_hash TEXT NULL;

-- Eliminar el índice único antiguo que forzaba 1 liquidación por tipo
DROP INDEX IF EXISTS idx_unique_active_payroll_fact;

-- Crear el nuevo índice único que permite varias liquidaciones si su hash es distinto
CREATE UNIQUE INDEX idx_unique_active_payroll_fact
    ON employee_payroll_facts (user_id, period_ym, settlement_hash)
    WHERE status = 'active' AND settlement_hash IS NOT NULL;

-- Eliminar la función antigua de inserción individual para evitar uso obsoleto
DROP FUNCTION IF EXISTS record_payroll_fact_atomic;

-- Crear la función de reemplazo atómico mensual
CREATE OR REPLACE FUNCTION replace_payroll_month_atomic(
    p_period_ym TEXT,
    p_facts JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_now TIMESTAMPTZ := now();
    v_fact JSONB;
    v_inserted_count INT := 0;
BEGIN
    -- 0. Adquirir candado transaccional para este mes concreto.
    -- Evita Write Skew si dos procesos intentan reemplazar el mismo mes simultáneamente.
    -- Al ser _xact_lock, PostgreSQL lo libera automáticamente al hacer COMMIT o ROLLBACK.
    PERFORM pg_advisory_xact_lock(hashtext('payroll_import_' || p_period_ym));

    -- 1. Invalidar transaccionalmente todo el lote anterior
    UPDATE employee_payroll_facts
    SET status = 'superseded',
        superseded_at = v_now
    WHERE period_ym = p_period_ym
      AND status = 'active';

    -- 2. Insertar todos los nuevos hechos contables
    FOR v_fact IN SELECT * FROM jsonb_array_elements(p_facts)
    LOOP
        INSERT INTO employee_payroll_facts (
            user_id,
            period_ym,
            settlement_type,
            version,
            status,
            total_company_cost,
            gross_salary,
            ss_employee,
            ss_company,
            tc1_cost,
            net_salary,
            document_id,
            created_by,
            created_at,
            settlement_hash
        ) VALUES (
            (v_fact->>'user_id')::UUID,
            p_period_ym,
            COALESCE(v_fact->>'settlement_type', 'ordinary'),
            1,
            'active',
            (v_fact->>'total_company_cost')::NUMERIC,
            (v_fact->>'gross_salary')::NUMERIC,
            (v_fact->>'ss_employee')::NUMERIC,
            (v_fact->>'ss_company')::NUMERIC,
            (v_fact->>'tc1_cost')::NUMERIC,
            (v_fact->>'net_salary')::NUMERIC,
            NULLIF(v_fact->>'document_id', '')::UUID,
            NULLIF(v_fact->>'created_by', '')::UUID,
            v_now,
            v_fact->>'settlement_hash'
        );
        v_inserted_count := v_inserted_count + 1;
    END LOOP;

    -- Si todo fue bien, PostgreSQL hace COMMIT automáticamente al salir
    RETURN jsonb_build_object(
        'success', true,
        'inserted_count', v_inserted_count
    );
EXCEPTION
    WHEN OTHERS THEN
        -- Si hay cualquier fallo (ej. unique constraint violation, parse error) 
        -- aborta la transacción entera.
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;
