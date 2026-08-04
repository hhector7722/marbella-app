-- FASE 1: Persistencia del SSOT Contable de Nóminas (employee_payroll_facts)
--
-- Tabla dedicada de hechos contables individuales de nómina, desacoplada de los archivos PDF.
-- Soporta: Histórico Vivo (status = 'active'), Versionado, Varias Liquidaciones y Audit Ledger.

CREATE TABLE IF NOT EXISTS employee_payroll_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    period_ym TEXT NOT NULL, -- Ej: '2026-07'
    settlement_type TEXT NOT NULL DEFAULT 'ordinary'
        CHECK (settlement_type IN ('ordinary', 'complementary', 'severance', 'adjustment')),
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'superseded', 'cancelled')),
    total_company_cost NUMERIC(12, 2) NOT NULL CHECK (total_company_cost >= 0),
    document_id UUID NULL REFERENCES nominas(id) ON DELETE SET NULL,
    superseded_at TIMESTAMPTZ NULL,
    superseded_by UUID NULL REFERENCES employee_payroll_facts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NULL
);

-- Garantía absoluta SSOT a nivel de Base de Datos:
-- Máximo 1 hecho contable 'active' por trabajador, periodo y tipo de liquidación.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_payroll_fact
    ON employee_payroll_facts (user_id, period_ym, settlement_type)
    WHERE status = 'active';

-- Índices optimizados para lecturas SSOT en lote
CREATE INDEX IF NOT EXISTS idx_emp_payroll_facts_user_period_status
    ON employee_payroll_facts (user_id, period_ym, status);

CREATE INDEX IF NOT EXISTS idx_emp_payroll_facts_period_status
    ON employee_payroll_facts (period_ym, status);

-- RLS
ALTER TABLE employee_payroll_facts ENABLE ROW LEVEL SECURITY;

-- Lectura: Managers/Admins ven todo; usuarios ven sus propias nóminas activas
CREATE POLICY "Managers and Admins can manage all payroll facts"
    ON employee_payroll_facts
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('manager', 'admin', 'supervisor')
        )
    );

CREATE POLICY "Employees can read their active payroll facts"
    ON employee_payroll_facts
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid() AND status = 'active'
    );
