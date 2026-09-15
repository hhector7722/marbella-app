-- Corrección de 20260914210304_suppliers_normalize_operational_fields.
-- Conserva la nota legada y eleva solamente la categoría explícita que quedó
-- pendiente por una expresión regular demasiado escapada en la primera pasada.

BEGIN;

UPDATE public.suppliers
SET category = COALESCE(
    category,
    NULLIF(
        btrim(
            substring(
                notes
                FROM $legacy_category$^\s*Categoría\s*\(app\)\s*:\s*(.+)\s*$legacy_category$
            )
        ),
        ''
    )
)
WHERE notes ~ $legacy_category$^\s*Categoría\s*\(app\)\s*:\s*(.+)\s*$legacy_category$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.suppliers
        WHERE notes ~ $legacy_category$^\s*Categoría\s*\(app\)\s*:\s*(.+)\s*$legacy_category$
          AND category IS NULL
    ) THEN
        RAISE EXCEPTION 'Una categoría explícita en notes no pudo elevarse';
    END IF;
END
$$;

COMMIT;
