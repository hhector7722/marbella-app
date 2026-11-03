-- The Hielo Fenix header classifier records an administrative audit event.
-- Allow that event without changing the OCR processing lifecycle or stock.
DO $migration$
DECLARE
  v_old text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_old
  FROM pg_constraint c
  WHERE c.conrelid = 'public.document_processing_job_events'::regclass
    AND c.conname = 'document_processing_job_events_event_type_check'
    AND c.contype = 'c';

  IF v_old IS NULL
    OR v_old NOT LIKE '%created%'
    OR v_old NOT LIKE '%leased%'
    OR v_old NOT LIKE '%completed%'
    OR v_old NOT LIKE '%failed%'
    OR v_old NOT LIKE '%requeued%'
    OR v_old LIKE '%classified_economic_invoice%'
  THEN RAISE EXCEPTION 'Unexpected document processing event constraint'; END IF;

  ALTER TABLE public.document_processing_job_events
    ADD CONSTRAINT document_processing_job_events_event_type_check_v2
    CHECK (event_type IN (
      'created', 'leased', 'completed', 'failed', 'requeued',
      'classified_economic_invoice'
    )) NOT VALID;
  ALTER TABLE public.document_processing_job_events
    VALIDATE CONSTRAINT document_processing_job_events_event_type_check_v2;
  ALTER TABLE public.document_processing_job_events
    DROP CONSTRAINT document_processing_job_events_event_type_check;
  ALTER TABLE public.document_processing_job_events
    RENAME CONSTRAINT document_processing_job_events_event_type_check_v2
    TO document_processing_job_events_event_type_check;
END;
$migration$;
