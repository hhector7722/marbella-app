-- Migration: RPC for atomic persistence of document evidence

CREATE OR REPLACE FUNCTION public.persist_document_evidence(
  p_invoice_id UUID,
  p_file_version_hash TEXT,
  p_extractor_version TEXT,
  p_raw_json_artifact JSONB,
  p_status public.extraction_status,
  p_tables JSONB
) RETURNS JSONB AS $$
DECLARE
  v_extraction_id UUID;
  v_table_id UUID;
  v_column_id UUID;
  v_row_id UUID;
  v_table JSONB;
  v_column JSONB;
  v_row JSONB;
  v_cell JSONB;
  v_result JSONB;
  v_row_mapping JSONB := '{}'::JSONB;
BEGIN
  INSERT INTO public.document_extractions (
    invoice_id, file_version_hash, extractor_version, raw_json_artifact, status
  ) VALUES (
    p_invoice_id, p_file_version_hash, p_extractor_version, p_raw_json_artifact, p_status
  ) RETURNING id INTO v_extraction_id;

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
          array[(v_table->>'index')::TEXT || '_' || (v_row->>'index')::TEXT], 
          to_jsonb(v_row_id)
        );

        FOR v_cell IN SELECT * FROM jsonb_array_elements(v_row->'cells') LOOP
          SELECT id INTO v_column_id FROM public.document_columns 
          WHERE table_id = v_table_id AND col_index = (v_cell->>'column_index')::INT;

          INSERT INTO public.document_cells (table_id, row_id, column_id, raw_value)
          VALUES (v_table_id, v_row_id, v_column_id, v_cell->>'raw_value');
        END LOOP;
      END LOOP;
    END LOOP;
  END IF;

  v_result := jsonb_build_object(
    'extraction_id', v_extraction_id,
    'row_mapping', v_row_mapping
  );
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
