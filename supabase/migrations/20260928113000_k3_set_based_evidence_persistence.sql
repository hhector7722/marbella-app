-- K3 · Persistencia set-based de evidencia Docling.
--
-- La implementación anterior insertaba tabla -> columnas -> filas -> celdas
-- mediante bucles PL/pgSQL y hacía un SELECT adicional por cada celda.
-- En documentos grandes esa amplificación provocó statement_timeout.
--
-- Se conserva exactamente la firma, autorización, idempotencia y row_mapping.
-- Solo cambia la estrategia interna de persistencia: una cadena de CTEs
-- set-based inserta cada nivel y enlaza las claves mediante RETURNING.

CREATE OR REPLACE FUNCTION public.persist_document_evidence(
  p_invoice_id uuid,
  p_file_version_hash text,
  p_extractor_version text,
  p_raw_json_artifact jsonb,
  p_status public.extraction_status,
  p_tables jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_extraction_id uuid;
  v_row_mapping jsonb := '{}'::jsonb;
  v_hash text;
  v_extractor text;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT EXISTS (
       SELECT 1
       FROM public.purchase_invoices pi
       WHERE pi.id = p_invoice_id
         AND (pi.created_by = auth.uid() OR public.is_purchase_manager_or_admin())
     ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  v_hash := btrim(coalesce(p_file_version_hash, ''));
  v_extractor := btrim(coalesce(p_extractor_version, ''));
  IF v_hash = '' OR v_extractor = '' THEN
    RAISE EXCEPTION 'persist_document_evidence: hash y extractor_version son obligatorios';
  END IF;

  SELECT id
  INTO v_extraction_id
  FROM public.document_extractions
  WHERE invoice_id = p_invoice_id
    AND file_version_hash = v_hash
    AND extractor_version = v_extractor
  LIMIT 1;

  IF v_extraction_id IS NOT NULL THEN
    SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    INTO v_row_mapping
    FROM (
      SELECT
        dt.table_index::text || '_' || dr.row_index::text AS key,
        to_jsonb(dr.id) AS value
      FROM public.document_tables dt
      JOIN public.document_rows dr ON dr.table_id = dt.id
      WHERE dt.extraction_id = v_extraction_id
    ) existing_rows;

    RETURN jsonb_build_object(
      'extraction_id', v_extraction_id,
      'row_mapping', v_row_mapping,
      'inserted', false
    );
  END IF;

  BEGIN
    INSERT INTO public.document_extractions (
      invoice_id,
      file_version_hash,
      extractor_version,
      raw_json_artifact,
      status
    )
    VALUES (
      p_invoice_id,
      v_hash,
      v_extractor,
      p_raw_json_artifact,
      p_status
    )
    RETURNING id INTO v_extraction_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id
    INTO v_extraction_id
    FROM public.document_extractions
    WHERE invoice_id = p_invoice_id
      AND file_version_hash = v_hash
      AND extractor_version = v_extractor
    LIMIT 1;

    SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    INTO v_row_mapping
    FROM (
      SELECT
        dt.table_index::text || '_' || dr.row_index::text AS key,
        to_jsonb(dr.id) AS value
      FROM public.document_tables dt
      JOIN public.document_rows dr ON dr.table_id = dt.id
      WHERE dt.extraction_id = v_extraction_id
    ) existing_rows;

    RETURN jsonb_build_object(
      'extraction_id', v_extraction_id,
      'row_mapping', v_row_mapping,
      'inserted', false
    );
  END;

  IF p_status = 'success'
     AND p_tables IS NOT NULL
     AND jsonb_typeof(p_tables) = 'array' THEN
    WITH table_data AS (
      SELECT
        value AS table_json,
        (value->>'index')::integer AS table_index
      FROM jsonb_array_elements(p_tables)
    ),
    inserted_tables AS (
      INSERT INTO public.document_tables (extraction_id, table_index)
      SELECT v_extraction_id, td.table_index
      FROM table_data td
      RETURNING id, table_index
    ),
    column_data AS (
      SELECT
        it.id AS table_id,
        (column_item.value->>'index')::integer AS col_index,
        column_item.value->>'name' AS original_name
      FROM table_data td
      JOIN inserted_tables it ON it.table_index = td.table_index
      CROSS JOIN LATERAL jsonb_array_elements(
        coalesce(td.table_json->'columns', '[]'::jsonb)
      ) AS column_item(value)
    ),
    inserted_columns AS (
      INSERT INTO public.document_columns (table_id, col_index, original_name)
      SELECT cd.table_id, cd.col_index, cd.original_name
      FROM column_data cd
      RETURNING id, table_id, col_index
    ),
    row_data AS (
      SELECT
        it.id AS table_id,
        it.table_index,
        (row_item.value->>'index')::integer AS row_index,
        row_item.value AS row_json
      FROM table_data td
      JOIN inserted_tables it ON it.table_index = td.table_index
      CROSS JOIN LATERAL jsonb_array_elements(
        coalesce(td.table_json->'rows', '[]'::jsonb)
      ) AS row_item(value)
    ),
    inserted_rows AS (
      INSERT INTO public.document_rows (table_id, row_index)
      SELECT rd.table_id, rd.row_index
      FROM row_data rd
      RETURNING id, table_id, row_index
    ),
    inserted_cells AS (
      INSERT INTO public.document_cells (table_id, row_id, column_id, raw_value)
      SELECT
        rd.table_id,
        ir.id,
        ic.id,
        cell_item.value->>'raw_value'
      FROM row_data rd
      JOIN inserted_rows ir
        ON ir.table_id = rd.table_id
       AND ir.row_index = rd.row_index
      CROSS JOIN LATERAL jsonb_array_elements(
        coalesce(rd.row_json->'cells', '[]'::jsonb)
      ) AS cell_item(value)
      JOIN inserted_columns ic
        ON ic.table_id = rd.table_id
       AND ic.col_index = (cell_item.value->>'column_index')::integer
      RETURNING id
    )
    SELECT coalesce(
      jsonb_object_agg(
        it.table_index::text || '_' || ir.row_index::text,
        to_jsonb(ir.id)
      ),
      '{}'::jsonb
    )
    INTO v_row_mapping
    FROM inserted_rows ir
    JOIN inserted_tables it ON it.id = ir.table_id;

    -- Fuerza la dependencia lógica para que el propósito del CTE de celdas
    -- quede explícito también para futuros mantenedores. Los DML CTE se
    -- ejecutan una sola vez aunque su RETURNING no sea consumido.
    PERFORM 1 FROM public.document_extractions WHERE id = v_extraction_id;
  END IF;

  RETURN jsonb_build_object(
    'extraction_id', v_extraction_id,
    'row_mapping', v_row_mapping,
    'inserted', true
  );
END;
$$;
