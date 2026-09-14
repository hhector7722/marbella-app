-- K3 · Cola durable de Docling, exclusivamente de evidencia documental.
--
-- El worker no recibe una key de Supabase ni permisos de Data API. Solo llama
-- a una Edge Function con token propio; esta entrega una URL firmada efímera y
-- persiste evidencia. Esta migración no toca ingredientes, precios, mapeos
-- definitivos, escandallos ni stock.

-- Una misma versión de archivo puede tener varias extracciones inmutables,
-- una por extractor/configuración. Conserva Gemini histórico y añade Docling
-- sin sobreescribirlo.
DROP INDEX IF EXISTS public.document_extractions_invoice_id_file_version_hash_key;
CREATE UNIQUE INDEX IF NOT EXISTS document_extractions_document_version_extractor_key
  ON public.document_extractions (invoice_id, file_version_hash, extractor_version);

-- Eliminar cascadas de la cadena documental: la retención no depende de que
-- una ruta de aplicación intente borrar la cabecera por accidente.
ALTER TABLE public.document_extractions
  DROP CONSTRAINT IF EXISTS document_extractions_invoice_id_fkey,
  ADD CONSTRAINT document_extractions_invoice_id_fkey
    FOREIGN KEY (invoice_id) REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT;
ALTER TABLE public.document_tables
  DROP CONSTRAINT IF EXISTS document_tables_extraction_id_fkey,
  ADD CONSTRAINT document_tables_extraction_id_fkey
    FOREIGN KEY (extraction_id) REFERENCES public.document_extractions(id) ON DELETE RESTRICT;
ALTER TABLE public.document_columns
  DROP CONSTRAINT IF EXISTS document_columns_table_id_fkey,
  ADD CONSTRAINT document_columns_table_id_fkey
    FOREIGN KEY (table_id) REFERENCES public.document_tables(id) ON DELETE RESTRICT;
ALTER TABLE public.document_rows
  DROP CONSTRAINT IF EXISTS document_rows_table_id_fkey,
  ADD CONSTRAINT document_rows_table_id_fkey
    FOREIGN KEY (table_id) REFERENCES public.document_tables(id) ON DELETE RESTRICT;
ALTER TABLE public.document_cells
  DROP CONSTRAINT IF EXISTS document_cells_column_id_table_id_fkey,
  ADD CONSTRAINT document_cells_column_id_table_id_fkey
    FOREIGN KEY (column_id, table_id) REFERENCES public.document_columns(id, table_id) ON DELETE RESTRICT,
  DROP CONSTRAINT IF EXISTS document_cells_row_id_table_id_fkey,
  ADD CONSTRAINT document_cells_row_id_table_id_fkey
    FOREIGN KEY (row_id, table_id) REFERENCES public.document_rows(id, table_id) ON DELETE RESTRICT;
ALTER TABLE public.purchase_line_provenance
  DROP CONSTRAINT IF EXISTS purchase_line_provenance_document_row_id_fkey,
  ADD CONSTRAINT purchase_line_provenance_document_row_id_fkey
    FOREIGN KEY (document_row_id) REFERENCES public.document_rows(id) ON DELETE RESTRICT,
  DROP CONSTRAINT IF EXISTS purchase_line_provenance_invoice_line_id_fkey,
  ADD CONSTRAINT purchase_line_provenance_invoice_line_id_fkey
    FOREIGN KEY (invoice_line_id) REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT;

-- RPC de evidencia: misma firma para no romper el escáner legado, pero
-- idempotencia por (documento, versión, extractor), nunca por documento solo.
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
  v_table_id uuid;
  v_column_id uuid;
  v_row_id uuid;
  v_table jsonb;
  v_column jsonb;
  v_row jsonb;
  v_cell jsonb;
  v_row_mapping jsonb := '{}'::jsonb;
  v_hash text;
  v_extractor text;
  v_inserted boolean := false;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.purchase_invoices pi
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

  SELECT id INTO v_extraction_id
  FROM public.document_extractions
  WHERE invoice_id = p_invoice_id
    AND file_version_hash = v_hash
    AND extractor_version = v_extractor
  LIMIT 1;

  IF v_extraction_id IS NOT NULL THEN
    SELECT coalesce((
      SELECT jsonb_object_agg(key, value)
      FROM (
        SELECT (dt.table_index::text || '_' || dr.row_index::text) AS key, to_jsonb(dr.id) AS value
        FROM public.document_tables dt
        JOIN public.document_rows dr ON dr.table_id = dt.id
        WHERE dt.extraction_id = v_extraction_id
      ) s
    ), '{}'::jsonb) INTO v_row_mapping;
    RETURN jsonb_build_object('extraction_id', v_extraction_id, 'row_mapping', v_row_mapping, 'inserted', false);
  END IF;

  BEGIN
    INSERT INTO public.document_extractions (
      invoice_id, file_version_hash, extractor_version, raw_json_artifact, status
    ) VALUES (
      p_invoice_id, v_hash, v_extractor, p_raw_json_artifact, p_status
    ) RETURNING id INTO v_extraction_id;
    v_inserted := true;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_extraction_id
    FROM public.document_extractions
    WHERE invoice_id = p_invoice_id
      AND file_version_hash = v_hash
      AND extractor_version = v_extractor
    LIMIT 1;
    SELECT coalesce((
      SELECT jsonb_object_agg(key, value)
      FROM (
        SELECT (dt.table_index::text || '_' || dr.row_index::text) AS key, to_jsonb(dr.id) AS value
        FROM public.document_tables dt
        JOIN public.document_rows dr ON dr.table_id = dt.id
        WHERE dt.extraction_id = v_extraction_id
      ) s
    ), '{}'::jsonb) INTO v_row_mapping;
    RETURN jsonb_build_object('extraction_id', v_extraction_id, 'row_mapping', v_row_mapping, 'inserted', false);
  END;

  IF p_status = 'success' AND p_tables IS NOT NULL THEN
    FOR v_table IN SELECT * FROM jsonb_array_elements(p_tables) LOOP
      INSERT INTO public.document_tables (extraction_id, table_index)
      VALUES (v_extraction_id, (v_table->>'index')::int)
      RETURNING id INTO v_table_id;

      FOR v_column IN SELECT * FROM jsonb_array_elements(v_table->'columns') LOOP
        INSERT INTO public.document_columns (table_id, col_index, original_name)
        VALUES (v_table_id, (v_column->>'index')::int, v_column->>'name')
        RETURNING id INTO v_column_id;
      END LOOP;

      FOR v_row IN SELECT * FROM jsonb_array_elements(v_table->'rows') LOOP
        INSERT INTO public.document_rows (table_id, row_index)
        VALUES (v_table_id, (v_row->>'index')::int)
        RETURNING id INTO v_row_id;
        v_row_mapping := jsonb_set(
          v_row_mapping,
          ARRAY[(v_table->>'index')::text || '_' || (v_row->>'index')::text],
          to_jsonb(v_row_id)
        );

        FOR v_cell IN SELECT * FROM jsonb_array_elements(v_row->'cells') LOOP
          SELECT id INTO v_column_id
          FROM public.document_columns
          WHERE table_id = v_table_id AND col_index = (v_cell->>'column_index')::int;
          INSERT INTO public.document_cells (table_id, row_id, column_id, raw_value)
          VALUES (v_table_id, v_row_id, v_column_id, v_cell->>'raw_value');
        END LOOP;
      END LOOP;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('extraction_id', v_extraction_id, 'row_mapping', v_row_mapping, 'inserted', v_inserted);
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'docling_job_status' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.docling_job_status AS ENUM ('pending', 'leased', 'completed', 'failed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.document_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
  storage_bucket text NOT NULL DEFAULT 'albaranes' CHECK (storage_bucket = 'albaranes'),
  storage_path text NOT NULL CHECK (length(btrim(storage_path)) > 0),
  file_version_hash text NOT NULL CHECK (length(btrim(file_version_hash)) > 0),
  extractor_version text NOT NULL CHECK (length(btrim(extractor_version)) > 0),
  status public.docling_job_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  extraction_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_extraction_id uuid REFERENCES public.document_extractions(id) ON DELETE RESTRICT,
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT document_processing_jobs_version_unique UNIQUE (invoice_id, file_version_hash, extractor_version),
  CONSTRAINT document_processing_jobs_lease_check CHECK (
    (status = 'leased' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'leased')
  )
);

CREATE INDEX IF NOT EXISTS document_processing_jobs_claim_idx
  ON public.document_processing_jobs (status, lease_expires_at, created_at);
CREATE INDEX IF NOT EXISTS document_processing_jobs_invoice_idx
  ON public.document_processing_jobs (invoice_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.document_processing_job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.document_processing_jobs(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('created', 'leased', 'completed', 'failed')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_processing_job_events_job_idx
  ON public.document_processing_job_events (job_id, created_at);

CREATE OR REPLACE FUNCTION public.record_document_processing_job_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.document_processing_job_events (job_id, event_type, payload)
  VALUES (NEW.id, 'created', jsonb_build_object('requested_by', NEW.requested_by, 'extractor_version', NEW.extractor_version));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_processing_jobs_created_event ON public.document_processing_jobs;
CREATE TRIGGER document_processing_jobs_created_event
  AFTER INSERT ON public.document_processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.record_document_processing_job_created();

DROP TRIGGER IF EXISTS document_processing_job_events_append_only ON public.document_processing_job_events;
CREATE TRIGGER document_processing_job_events_append_only
  BEFORE UPDATE OR DELETE ON public.document_processing_job_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_k2_append_only_mutation();

-- Claim atómico: un único worker adquiere una fila pendiente o una lease
-- caducada. El token de lease nunca llega al Data API del worker.
CREATE OR REPLACE FUNCTION public.claim_docling_evidence_job(
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 900
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.document_processing_jobs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF p_lease_token IS NULL OR p_lease_seconds < 60 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'Lease inválida';
  END IF;

  WITH candidate AS (
    SELECT id
    FROM public.document_processing_jobs
    WHERE status = 'pending'
       OR (status = 'leased' AND lease_expires_at < now())
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.document_processing_jobs j
  SET status = 'leased',
      lease_token = p_lease_token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = j.attempt_count + 1,
      last_error = NULL
  FROM candidate
  WHERE j.id = candidate.id
  RETURNING j.* INTO v_job;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.document_processing_job_events (job_id, event_type, payload)
  VALUES (
    v_job.id,
    'leased',
    jsonb_build_object('attempt_count', v_job.attempt_count, 'lease_expires_at', v_job.lease_expires_at)
  );

  RETURN jsonb_build_object(
    'job_id', v_job.id,
    'invoice_id', v_job.invoice_id,
    'storage_bucket', v_job.storage_bucket,
    'storage_path', v_job.storage_path,
    'file_version_hash', v_job.file_version_hash,
    'extractor_version', v_job.extractor_version,
    'correlation_id', v_job.correlation_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_docling_evidence_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_evidence_extraction_id uuid,
  p_succeeded boolean,
  p_metrics jsonb DEFAULT '{}'::jsonb,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.docling_job_status;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE public.document_processing_jobs
  SET status = CASE WHEN p_succeeded THEN 'completed'::public.docling_job_status ELSE 'failed'::public.docling_job_status END,
      evidence_extraction_id = p_evidence_extraction_id,
      extraction_metrics = COALESCE(p_metrics, '{}'::jsonb),
      last_error = p_error,
      completed_at = now(),
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE id = p_job_id
    AND status = 'leased'
    AND lease_token = p_lease_token
  RETURNING status INTO v_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job no adquirido o lease caducada';
  END IF;

  INSERT INTO public.document_processing_job_events (job_id, event_type, payload)
  VALUES (
    p_job_id,
    CASE WHEN p_succeeded THEN 'completed' ELSE 'failed' END,
    jsonb_build_object('evidence_extraction_id', p_evidence_extraction_id, 'metrics', COALESCE(p_metrics, '{}'::jsonb), 'error', p_error)
  );
END;
$$;

ALTER TABLE public.document_processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_processing_job_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k3_document_processing_jobs_select_manager_admin ON public.document_processing_jobs;
CREATE POLICY k3_document_processing_jobs_select_manager_admin ON public.document_processing_jobs
  FOR SELECT TO authenticated
  USING (public.is_purchase_manager_or_admin());
DROP POLICY IF EXISTS k3_document_processing_jobs_insert_manager_admin ON public.document_processing_jobs;
CREATE POLICY k3_document_processing_jobs_insert_manager_admin ON public.document_processing_jobs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_purchase_manager_or_admin());
DROP POLICY IF EXISTS k3_document_processing_job_events_select_manager_admin ON public.document_processing_job_events;
CREATE POLICY k3_document_processing_job_events_select_manager_admin ON public.document_processing_job_events
  FOR SELECT TO authenticated
  USING (public.is_purchase_manager_or_admin());

REVOKE ALL ON TABLE public.document_processing_jobs, public.document_processing_job_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.document_processing_jobs, public.document_processing_job_events TO service_role;
GRANT SELECT, INSERT ON TABLE public.document_processing_jobs TO authenticated;
GRANT SELECT ON TABLE public.document_processing_job_events TO authenticated;

REVOKE ALL ON FUNCTION public.claim_docling_evidence_job(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_docling_evidence_job(uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.complete_docling_evidence_job(uuid, uuid, uuid, boolean, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_docling_evidence_job(uuid, uuid, uuid, boolean, jsonb, text) TO service_role;
