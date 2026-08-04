-- FASE 2: Función Transaccional Atómica para Escritura de Hechos Contables y Audit Ledger
--
-- Garantiza en una única transacción PostgreSQL (ACID):
-- 1. Bloqueo de fila para concurrencia (FOR UPDATE)
-- 2. Cálculo de versión incremental N + 1
-- 3. Inserción del nuevo hecho contable como 'active'
-- 4. Actualización del hecho previo a 'superseded' con estampa temporal y enlace superseded_by
-- 5. Rollback total automático en caso de cualquier fallo

CREATE OR REPLACE FUNCTION record_payroll_fact_atomic(
    p_user_id UUID,
    p_period_ym TEXT,
    p_settlement_type TEXT DEFAULT 'ordinary',
    p_total_company_cost NUMERIC(12, 2) DEFAULT 0,
    p_document_id UUID DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_fact_id UUID := NULL;
    v_old_version INT := 0;
    v_new_version INT := 1;
    v_new_fact_id UUID;
    v_now TIMESTAMPTZ := now();
BEGIN
    -- 1. Bloqueo a nivel de fila para evitar race conditions en lecturas/escrituras concurrentes
    SELECT id, version INTO v_old_fact_id, v_old_version
    FROM employee_payroll_facts
    WHERE user_id = p_user_id
      AND period_ym = p_period_ym
      AND settlement_type = p_settlement_type
      AND status = 'active'
    FOR UPDATE;

    IF v_old_fact_id IS NOT NULL THEN
        v_new_version := v_old_version + 1;

        -- Marcar el viejo como superseded primero para no violar el índice único parcial
        UPDATE employee_payroll_facts
        SET status = 'superseded',
            superseded_at = v_now
        WHERE id = v_old_fact_id;
    END IF;

    -- 2. Insertar el nuevo hecho contable activo
    INSERT INTO employee_payroll_facts (
        user_id,
        period_ym,
        settlement_type,
        version,
        status,
        total_company_cost,
        document_id,
        created_by,
        created_at
    ) VALUES (
        p_user_id,
        p_period_ym,
        p_settlement_type,
        v_new_version,
        'active',
        p_total_company_cost,
        p_document_id,
        p_created_by,
        v_now
    ) RETURNING id INTO v_new_fact_id;

    -- 3. Enlazar la referencia superseded_by en el registro viejo
    IF v_old_fact_id IS NOT NULL THEN
        UPDATE employee_payroll_facts
        SET superseded_by = v_new_fact_id
        WHERE id = v_old_fact_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'fact_id', v_new_fact_id,
        'version', v_new_version,
        'superseded_fact_id', v_old_fact_id
    );
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error transaccional al registrar hecho contable: %', SQLERRM;
END;
$$;

-- Permisos de ejecución para usuarios autenticados
GRANT EXECUTE ON FUNCTION record_payroll_fact_atomic TO authenticated;
