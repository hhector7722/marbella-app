-- Sucesora segura de 20260908150000_suppliers_add_fields.
--
-- La fuente histórica queda archivada y no se ejecuta: sus tipos `time` y
-- `numeric` eliminaban información de reglas operativas como "Lunes o martes"
-- y "5 cajas", y su conversión de reliability descartaba "Alta".
--
-- `notes` se conserva literalmente como evidencia legada. Los ocho campos
-- operativos pasan a ser columnas de texto porque el uso real no se limita a
-- una hora ni a un importe monetario. La única normalización derivada es la
-- puntuación 1–5 de fiabilidad; los demás literales se conservan completos.

BEGIN;

-- Validación previa: ninguna nota que parezca JSON puede convertirse de forma
-- silenciosa. La migración completa revierte si aparece una nueva nota inválida
-- entre la auditoría y la aplicación.
DO $$
DECLARE
    supplier_row record;
    payload jsonb;
BEGIN
    FOR supplier_row IN
        SELECT id, notes
        FROM public.suppliers
        WHERE notes IS NOT NULL
          AND btrim(notes) LIKE '{%'
    LOOP
        BEGIN
            payload := supplier_row.notes::jsonb;
        EXCEPTION WHEN others THEN
            RAISE EXCEPTION
                'suppliers.notes de id % parece JSON pero no es válido; la migración no puede continuar',
                supplier_row.id;
        END;

        IF jsonb_typeof(payload) <> 'object' THEN
            RAISE EXCEPTION
                'suppliers.notes de id % debe ser un objeto JSON para normalizarse',
                supplier_row.id;
        END IF;
    END LOOP;
END
$$;

ALTER TABLE public.suppliers
    ADD COLUMN IF NOT EXISTS category text,
    ADD COLUMN IF NOT EXISTS order_deadline text,
    ADD COLUMN IF NOT EXISTS min_order text,
    ADD COLUMN IF NOT EXISTS order_channel text,
    ADD COLUMN IF NOT EXISTS contact_name text,
    ADD COLUMN IF NOT EXISTS payment_method text,
    ADD COLUMN IF NOT EXISTS instructions text,
    ADD COLUMN IF NOT EXISTS observations text,
    ADD COLUMN IF NOT EXISTS reliability_score smallint GENERATED ALWAYS AS (
        CASE
            WHEN NULLIF(btrim(reliability), '') ~ '^[1-5]$'
                THEN btrim(reliability)::smallint
            ELSE NULL
        END
    ) STORED,
    ADD COLUMN IF NOT EXISTS reliability_review_required boolean GENERATED ALWAYS AS (
        COALESCE(
            NULLIF(btrim(reliability), '') IS NOT NULL
            AND btrim(reliability) !~ '^[1-5]$',
            false
        )
    ) STORED;

-- Sólo se elevan valores completos. No se modifica `notes`: es la evidencia
-- original de los 17 objetos JSON ya existentes.
WITH json_notes AS (
    SELECT id, notes::jsonb AS payload
    FROM public.suppliers
    WHERE notes IS NOT NULL
      AND btrim(notes) LIKE '{%'
)
UPDATE public.suppliers AS supplier
SET
    category = COALESCE(supplier.category, NULLIF(json_notes.payload ->> 'category', '')),
    order_deadline = COALESCE(supplier.order_deadline, NULLIF(json_notes.payload ->> 'order_deadline', '')),
    min_order = COALESCE(supplier.min_order, NULLIF(json_notes.payload ->> 'min_order', '')),
    order_channel = COALESCE(supplier.order_channel, NULLIF(json_notes.payload ->> 'order_channel', '')),
    contact_name = COALESCE(supplier.contact_name, NULLIF(json_notes.payload ->> 'contact_name', '')),
    payment_method = COALESCE(supplier.payment_method, NULLIF(json_notes.payload ->> 'payment_method', '')),
    instructions = COALESCE(supplier.instructions, NULLIF(json_notes.payload ->> 'instructions', '')),
    observations = COALESCE(supplier.observations, NULLIF(json_notes.payload ->> 'observations', ''))
FROM json_notes
WHERE supplier.id = json_notes.id;

-- La única nota no JSON usa el formato legado de categoría. Se conserva la
-- nota completa y sólo se eleva su valor inequívoco.
UPDATE public.suppliers
SET category = COALESCE(
    category,
    NULLIF(
        btrim(regexp_replace(notes, '^\\s*Categoría\\s*\\(app\\)\\s*:\\s*', '', 'i')),
        ''
    )
)
WHERE notes ~ '^\\s*Categoría\\s*\\(app\\)\\s*:';

-- Validación posterior a la normalización, antes de declarar constraints.
DO $$
DECLARE
    missing_structured_value_count integer;
BEGIN
    SELECT count(*)
    INTO missing_structured_value_count
    FROM public.suppliers AS supplier
    CROSS JOIN LATERAL (SELECT supplier.notes::jsonb AS payload) AS source
    WHERE supplier.notes IS NOT NULL
      AND btrim(supplier.notes) LIKE '{%'
      AND (
          (NULLIF(source.payload ->> 'category', '') IS NOT NULL AND supplier.category IS NULL)
          OR (NULLIF(source.payload ->> 'order_deadline', '') IS NOT NULL AND supplier.order_deadline IS NULL)
          OR (NULLIF(source.payload ->> 'min_order', '') IS NOT NULL AND supplier.min_order IS NULL)
          OR (NULLIF(source.payload ->> 'order_channel', '') IS NOT NULL AND supplier.order_channel IS NULL)
          OR (NULLIF(source.payload ->> 'contact_name', '') IS NOT NULL AND supplier.contact_name IS NULL)
          OR (NULLIF(source.payload ->> 'payment_method', '') IS NOT NULL AND supplier.payment_method IS NULL)
          OR (NULLIF(source.payload ->> 'instructions', '') IS NOT NULL AND supplier.instructions IS NULL)
          OR (NULLIF(source.payload ->> 'observations', '') IS NOT NULL AND supplier.observations IS NULL)
      );

    IF missing_structured_value_count <> 0 THEN
        RAISE EXCEPTION
            'La normalización de suppliers dejó % valores no vacíos sin su columna operativa',
            missing_structured_value_count;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.suppliers
        WHERE notes ~ '^\\s*Categoría\\s*\\(app\\)\\s*:'
          AND category IS NULL
    ) THEN
        RAISE EXCEPTION 'Una nota legada de categoría no pudo normalizarse';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.suppliers
        WHERE NULLIF(btrim(reliability), '') IS NOT NULL
          AND btrim(reliability) !~ '^[1-5]$'
          AND reliability_review_required IS NOT TRUE
    ) THEN
        RAISE EXCEPTION 'Un valor cualitativo de reliability quedó sin revisión explícita';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'suppliers_reliability_score_range'
          AND conrelid = 'public.suppliers'::regclass
    ) THEN
        ALTER TABLE public.suppliers
            ADD CONSTRAINT suppliers_reliability_score_range
            CHECK (reliability_score IS NULL OR reliability_score BETWEEN 1 AND 5);
    END IF;
END
$$;

COMMENT ON COLUMN public.suppliers.notes IS
    'Contenido legado conservado literalmente; no es la fuente operativa de los campos normalizados.';
COMMENT ON COLUMN public.suppliers.order_deadline IS
    'Regla completa de plazo de pedido en texto operativo; no se reduce a una hora.';
COMMENT ON COLUMN public.suppliers.min_order IS
    'Condición completa de pedido mínimo en texto operativo; puede expresar importe o unidades.';
COMMENT ON COLUMN public.suppliers.reliability IS
    'Valor literal de fiabilidad introducido o heredado; se conserva sin conversión destructiva.';
COMMENT ON COLUMN public.suppliers.reliability_score IS
    'Proyección generada de reliability únicamente para los literales 1 a 5.';
COMMENT ON COLUMN public.suppliers.reliability_review_required IS
    'Proyección generada: true cuando reliability contiene un literal no vacío distinto de 1 a 5.';

COMMIT;
