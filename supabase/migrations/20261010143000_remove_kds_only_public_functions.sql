-- Funciones RPC/trigger exclusivas del KDS, sin consumidores tras archivar.
-- RESTRICT por defecto: si existiera una dependencia desconocida, falla
-- toda la migración sin borrar objetos ajenos.
SET LOCAL lock_timeout = '5s';
DROP FUNCTION IF EXISTS public.fn_trg_process_kds_from_sala_v1();
DROP FUNCTION IF EXISTS public.fn_trg_process_kds_from_sala();
DROP FUNCTION IF EXISTS public.fn_process_comandero_event();
DROP FUNCTION IF EXISTS public.fn_emit_kds_events_from_sala(text,text,text,jsonb,text,text,text);
DROP FUNCTION IF EXISTS public.fn_calculate_and_insert_delta(text,text,text,jsonb,text,text);
DROP FUNCTION IF EXISTS public.fn_calculate_and_insert_delta(text,text,text,jsonb);
DROP FUNCTION IF EXISTS public.fn_calculate_and_insert_delta(integer,jsonb,text,text,text);
DROP FUNCTION IF EXISTS public.fncalcdelta(text,text,text,jsonb,text,text);
DROP FUNCTION IF EXISTS public.fncalcdelta(text,text,text,jsonb,text);
DROP FUNCTION IF EXISTS public.kds_ingest_event(text,text,text,text,integer,text,text,integer);
DROP FUNCTION IF EXISTS public.normalize_kds_name(text);
