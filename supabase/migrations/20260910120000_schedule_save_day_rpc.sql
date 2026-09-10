-- Guardado atómico del horario de un día.
--
-- Todo el borrado e inserción del día ocurre en UNA sola transacción.
-- La función solo reescribe las filas de los trabajadores del payload
-- (delete por user_id + día + insert), de modo que los turnos de empleados
-- que el editor no gestiona (p.ej. no visibles en plantilla) NUNCA se borran.
--
-- SECURITY INVOKER: hereda el rol y las políticas RLS del llamador, por lo
-- que solo un manager (política "Managers full access") puede modificar datos.

CREATE OR REPLACE FUNCTION public.save_schedule_day(
    p_day_start timestamptz,
    p_day_end timestamptz,
    p_rows jsonb,
    p_remove_user_ids uuid[] DEFAULT '{}'::uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_row jsonb;
    v_user_id uuid;
    v_removed uuid;
    v_start timestamptz;
    v_end timestamptz;
    v_persisted jsonb;
    v_changes integer := 0;
BEGIN
    IF p_rows IS NULL THEN
        p_rows := '[]'::jsonb;
    END IF;

    IF p_remove_user_ids IS NULL THEN
        p_remove_user_ids := '{}'::uuid[];
    END IF;

    IF p_day_start IS NULL OR p_day_end IS NULL THEN
        RAISE EXCEPTION 'save_schedule_day: falta el rango del día (p_day_start/p_day_end)';
    END IF;

    IF jsonb_array_length(p_rows) = 0 AND array_length(p_remove_user_ids, 1) IS NULL THEN
        RETURN jsonb_build_object(
            'saved', 0,
            'removed', 0,
            'rows', '[]'::jsonb,
            'published', false
        );
    END IF;

    -- Reescribimos cada trabajador del payload: delete de SU(S) fila(s) del
    -- día + insert de la nueva. Al anclar por (user_id, día) nunca se borran
    -- filas de otros trabajadores y no se generan duplicados al reintentar.
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
    LOOP
        v_user_id := (v_row ->> 'user_id')::uuid;
        v_start := (v_row ->> 'start_time')::timestamptz;
        v_end := (v_row ->> 'end_time')::timestamptz;

        IF v_user_id IS NULL THEN
            RAISE EXCEPTION 'save_schedule_day: fila sin user_id';
        END IF;

        IF v_start IS NULL OR v_end IS NULL THEN
            RAISE EXCEPTION 'save_schedule_day: fila sin start_time/end_time para el usuario %', v_user_id;
        END IF;

        DELETE FROM public.shifts
        WHERE user_id = v_user_id
          AND start_time >= p_day_start
          AND start_time <= p_day_end;

        INSERT INTO public.shifts (
            user_id, start_time, end_time,
            notes, is_published, activity,
            draft_start_time, draft_end_time,
            draft_activity, draft_notes,
            event_start_time, event_end_time, event_participants,
            categoria, draft_categoria,
            activity_2, draft_activity_2,
            event_start_time_2, event_end_time_2, event_participants_2,
            categoria_2, draft_categoria_2
        )
        VALUES (
            v_user_id,
            v_start,
            v_end,
            v_row ->> 'notes',
            COALESCE((v_row ->> 'is_published')::boolean, false),
            NULLIF(v_row ->> 'activity', ''),
            (v_row ->> 'draft_start_time')::timestamptz,
            (v_row ->> 'draft_end_time')::timestamptz,
            NULLIF(v_row ->> 'draft_activity', ''),
            v_row ->> 'draft_notes',
            NULLIF(v_row ->> 'event_start_time', ''),
            NULLIF(v_row ->> 'event_end_time', ''),
            NULLIF((v_row ->> 'event_participants')::text, '')::integer,
            NULLIF(v_row ->> 'categoria', ''),
            NULLIF(v_row ->> 'draft_categoria', ''),
            NULLIF(v_row ->> 'activity_2', ''),
            NULLIF(v_row ->> 'draft_activity_2', ''),
            NULLIF(v_row ->> 'event_start_time_2', ''),
            NULLIF(v_row ->> 'event_end_time_2', ''),
            NULLIF((v_row ->> 'event_participants_2')::text, '')::integer,
            NULLIF(v_row ->> 'categoria_2', ''),
            NULLIF(v_row ->> 'draft_categoria_2', '')
        );

        v_changes := v_changes + 1;
    END LOOP;

    -- Retiramos del día los trabajadores que el editor quitó (solo los que el
    -- editor gestiona; nunca los turnos de empleados que no ve).
    FOREACH v_removed IN ARRAY p_remove_user_ids
    LOOP
        DELETE FROM public.shifts
        WHERE user_id = v_removed
          AND start_time >= p_day_start
          AND start_time <= p_day_end;

        v_changes := v_changes + 1;
    END LOOP;

    -- Devolvemos el estado persistido del día para que la capa superior
    -- verifique que lo guardado coincide con lo esperado.
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'user_id', s.user_id,
            'start_time', s.start_time,
            'end_time', s.end_time,
            'is_published', s.is_published,
            'activity', s.activity,
            'draft_activity', s.draft_activity,
            'draft_start_time', s.draft_start_time,
            'draft_end_time', s.draft_end_time,
            'notes', s.notes,
            'draft_notes', s.draft_notes,
            'event_start_time', s.event_start_time,
            'event_end_time', s.event_end_time,
            'event_participants', s.event_participants,
            'categoria', s.categoria,
            'draft_categoria', s.draft_categoria,
            'activity_2', s.activity_2,
            'draft_activity_2', s.draft_activity_2,
            'event_start_time_2', s.event_start_time_2,
            'event_end_time_2', s.event_end_time_2,
            'event_participants_2', s.event_participants_2,
            'categoria_2', s.categoria_2,
            'draft_categoria_2', s.draft_categoria_2
        ) ORDER BY s.start_time, s.user_id
    ), '[]'::jsonb)
    INTO v_persisted
    FROM public.shifts s
    WHERE s.start_time >= p_day_start
      AND s.start_time <= p_day_end;

    RETURN jsonb_build_object(
        'saved', v_changes,
        'rows', v_persisted,
        'published', (
            SELECT COALESCE(bool_and(s2.is_published), false)
            FROM public.shifts s2
            WHERE s2.start_time >= p_day_start AND s2.start_time <= p_day_end
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_schedule_day(timestamptz, timestamptz, jsonb, uuid[]) TO authenticated;