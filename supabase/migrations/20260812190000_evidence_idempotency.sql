-- Idempotencia Evidence: una extracción por (invoice, versión documental)
-- + provenance no duplicada por (línea, fila documental)
-- + RPC persist_document_evidence atómica ante reintentos/concurrencia

-- 1) file_version_hash obligatorio (hoy: 0 NULL en producción)
ALTER TABLE public.document_extractions
  ALTER COLUMN file_version_hash SET NOT NULL;

-- 2) Clave de idempotencia documental
CREATE UNIQUE INDEX IF NOT EXISTS document_extractions_invoice_id_file_version_hash_key
  ON public.document_extractions (invoice_id, file_version_hash);

-- 3) Provenance: no duplicar el mismo vínculo línea↔fila
CREATE UNIQUE INDEX IF NOT EXISTS purchase_line_provenance_line_row_key
  ON public.purchase_line_provenance (invoice_line_id, document_row_id);

-- 4) RPC atómica e idempotente
CREATE OR REPLACE FUNCTION public.persist_document_evidence(
  p_invoice_id UUID,
  p_file_version_hash TEXT,
  p_extractor_version TEXT,
  p_raw_json_artifact JSONB,
  p_status public.extraction_status,
  p_tables JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_extraction_id UUID;
  v_table_id UUID;
  v_column_id UUID;
  v_row_id UUID;
  v_table JSONB;
  v_column JSONB;
  v_row JSONB;
  v_cell JSONB;
  v_row_mapping JSONB := '{}'::JSONB;
  v_hash TEXT;
  v_inserted BOOLEAN := false;
BEGIN
  v_hash := btrim(coalesce(p_file_version_hash, ''));
  IF v_hash = '' THEN
    RAISE EXCEPTION 'persist_document_evidence: p_file_version_hash es obligatorio';
  END IF;

  -- Camino rápido: ya existe esta versión documental
  SELECT id INTO v_extraction_id
  FROM public.document_extractions
  WHERE invoice_id = p_invoice_id
    AND file_version_hash = v_hash
  LIMIT 1;

  IF v_extraction_id IS NOT NULL THEN
    SELECT coalesce(
      (
        SELECT jsonb_object_agg(key, value)
        FROM (
          SELECT (dt.table_index::text || '_' || dr.row_index::text) AS key,
                 to_jsonb(dr.id) AS value
          FROM public.document_tables dt
          JOIN public.document_rows dr ON dr.table_id = dt.id
          WHERE dt.extraction_id = v_extraction_id
        ) s
      ),
      '{}'::jsonb
    )
    INTO v_row_mapping;

    RETURN jsonb_build_object(
      'extraction_id', v_extraction_id,
      'row_mapping', v_row_mapping,
      'inserted', false
    );
  END IF;

  BEGIN
    INSERT INTO public.document_extractions (
      invoice_id, file_version_hash, extractor_version, raw_json_artifact, status
    ) VALUES (
      p_invoice_id, v_hash, p_extractor_version, p_raw_json_artifact, p_status
    )
    RETURNING id INTO v_extraction_id;
    v_inserted := true;
  EXCEPTION
    WHEN unique_violation THEN
      -- Carrera: otro proceso insertó la misma (invoice, hash)
      SELECT id INTO v_extraction_id
      FROM public.document_extractions
      WHERE invoice_id = p_invoice_id
        AND file_version_hash = v_hash
      LIMIT 1;

      SELECT coalesce(
        (
          SELECT jsonb_object_agg(key, value)
          FROM (
            SELECT (dt.table_index::text || '_' || dr.row_index::text) AS key,
                   to_jsonb(dr.id) AS value
            FROM public.document_tables dt
            JOIN public.document_rows dr ON dr.table_id = dt.id
            WHERE dt.extraction_id = v_extraction_id
          ) s
        ),
        '{}'::jsonb
      )
      INTO v_row_mapping;

      RETURN jsonb_build_object(
        'extraction_id', v_extraction_id,
        'row_mapping', v_row_mapping,
        'inserted', false
      );
  END;

  IF p_status = 'success' AND p_tables IS NOT NULL THEN
    FOR v_table IN SELECT * FROM jsonb_array_elements(p_tables) LOOP
      INSERT INTO public.document_tables (extraction_id, table_index)
      VALUES (v_extraction_id, (v_table->>'index')::INT)
      RETURNING id INTO v_table_id;

      FOR v_column IN SELECT * FROM jsonb_array_elements(v_table->'columns') LOOP
        INSERT INTO public.document_columns (table_id, col_index, original_name)
        VALUES (v_table_id, (v_column->>'index')::INT, v_column->>'name')
        RETURNING id INTO v_column_id;
      END LOOP;

      FOR v_row IN SELECT * FROM jsonb_array_elements(v_table->'rows') LOOP
        INSERT INTO public.document_rows (table_id, row_index)
        VALUES (v_table_id, (v_row->>'index')::INT)
        RETURNING id INTO v_row_id;

        v_row_mapping := jsonb_set(
          v_row_mapping,
          ARRAY[(v_table->>'index')::TEXT || '_' || (v_row->>'index')::TEXT],
          to_jsonb(v_row_id)
        );

        FOR v_cell IN SELECT * FROM jsonb_array_elements(v_row->'cells') LOOP
          SELECT id INTO v_column_id
          FROM public.document_columns
          WHERE table_id = v_table_id
            AND col_index = (v_cell->>'column_index')::INT;

          INSERT INTO public.document_cells (table_id, row_id, column_id, raw_value)
          VALUES (v_table_id, v_row_id, v_column_id, v_cell->>'raw_value');
        END LOOP;
      END LOOP;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'extraction_id', v_extraction_id,
    'row_mapping', v_row_mapping,
    'inserted', v_inserted
  );
END;
$$;
