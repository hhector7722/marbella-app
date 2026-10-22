-- TPV2 purchases are recorded immediately without touching any cash-box balance.
-- At closing, the database atomically posts a gross CLOSE_ENTRY and one OUT per purchase.
CREATE TABLE public.treasury_purchase_requests (
    id uuid PRIMARY KEY,
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.treasury_purchase_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.treasury_purchase_requests FROM anon, authenticated;

CREATE TABLE public.tpv2_pending_purchases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid REFERENCES public.treasury_purchase_requests(id),
    purchase_date date NOT NULL,
    occurred_at timestamptz NOT NULL,
    amount numeric(12,2) NOT NULL CHECK (amount > 0),
    notes text NOT NULL DEFAULT 'Compra',
    source_box_id uuid REFERENCES public.cash_boxes(id),
    breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
    legacy_movement_id uuid UNIQUE REFERENCES public.treasury_log(id) ON DELETE SET NULL,
    closing_id uuid REFERENCES public.cash_closings(id) ON DELETE SET NULL,
    treasury_movement_id uuid UNIQUE REFERENCES public.treasury_log(id) ON DELETE SET NULL,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tpv2_pending_by_date ON public.tpv2_pending_purchases(purchase_date) WHERE closing_id IS NULL;
CREATE INDEX tpv2_pending_by_close ON public.tpv2_pending_purchases(closing_id);
ALTER TABLE public.tpv2_pending_purchases ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.tpv2_pending_purchases TO authenticated;
CREATE POLICY tpv2_purchases_read_auth ON public.tpv2_pending_purchases
    FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

ALTER TABLE public.cash_closings
    ADD COLUMN tpv2_settlement_version smallint NOT NULL DEFAULT 0,
    ADD COLUMN tpv2_purchase_total numeric(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN physical_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN tpv2_purchase_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Preserve purchases made before this change, but not yet accounted for in a close.
-- Their original TPV2 movement stays intact; its mirror OUT in the initial box
-- is created only when the corresponding day is closed.
INSERT INTO public.tpv2_pending_purchases (
    purchase_date, occurred_at, amount, notes, source_box_id, breakdown, legacy_movement_id, created_by
)
SELECT (t.created_at AT TIME ZONE 'Europe/Madrid')::date,
       t.created_at, round(t.amount, 2), coalesce(t.notes, 'Compra'),
       t.box_id, coalesce(t.breakdown,'{}'::jsonb), t.id, t.user_id
FROM public.treasury_log t
JOIN public.cash_boxes b ON b.id = t.box_id
WHERE b.type = 'tpv' AND b.name ~* 'TPV[[:space:]]*2'
  AND t.type = 'OUT' AND t.amount > 0
  AND NOT EXISTS (
      SELECT 1 FROM public.cash_closings c
      WHERE c.closing_date = (t.created_at AT TIME ZONE 'Europe/Madrid')::date
  )
ON CONFLICT (legacy_movement_id) DO NOTHING;

-- One transaction for every source of a purchase, with a per-request idempotency key.
CREATE OR REPLACE FUNCTION public.register_multi_source_purchase(
    p_request_id uuid,
    p_sources jsonb,
    p_notes text,
    p_purchase_at timestamptz,
    p_change_amount numeric DEFAULT 0,
    p_change_box_id uuid DEFAULT NULL,
    p_change_breakdown jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid := auth.uid();
    v_entry jsonb;
    v_source text;
    v_box uuid;
    v_type text;
    v_name text;
    v_amount numeric(12,2);
    v_breakdown jsonb;
    v_purchase_day date;
    v_note text := coalesce(nullif(btrim(p_notes), ''), 'Compra');
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Sesión caducada. Vuelve a iniciar sesión.';
    END IF;
    IF p_request_id IS NULL OR p_purchase_at IS NULL OR jsonb_typeof(p_sources) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Compra incompleta';
    END IF;

    INSERT INTO public.treasury_purchase_requests (id, created_by)
    VALUES (p_request_id, v_user) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN
        IF NOT EXISTS (SELECT 1 FROM public.treasury_purchase_requests
                       WHERE id = p_request_id AND created_by = v_user) THEN
            RAISE EXCEPTION 'Identificador de compra ya utilizado';
        END IF;
        RETURN;
    END IF;

    v_purchase_day := (p_purchase_at AT TIME ZONE 'Europe/Madrid')::date;
    -- Serialise against finalising a close for this very same business day.
    PERFORM pg_advisory_xact_lock(79225, v_purchase_day - DATE '2000-01-01');

    FOR v_entry IN SELECT value FROM jsonb_array_elements(p_sources)
    LOOP
        v_source := v_entry->>'sourceId';
        v_amount := round((v_entry->>'amount')::numeric, 2);
        IF v_amount IS NULL OR v_amount <= 0 THEN CONTINUE; END IF;
        v_breakdown := coalesce(v_entry->'breakdown', '{}'::jsonb);
        IF jsonb_typeof(v_breakdown) <> 'object' THEN RAISE EXCEPTION 'Desglose inválido'; END IF;
        v_box := NULL;
        v_type := NULL;
        v_name := NULL;

        IF v_source IN ('tpv1','tpv2') THEN
            v_type := 'tpv';
            v_name := CASE WHEN v_source='tpv2' THEN 'TPV 2' ELSE 'TPV 1' END;
        ELSE
            BEGIN
                v_box := v_source::uuid;
            EXCEPTION WHEN invalid_text_representation THEN
                RAISE EXCEPTION 'Caja no válida';
            END;
            SELECT type, name INTO v_type, v_name FROM public.cash_boxes WHERE id = v_box;
            IF NOT FOUND THEN RAISE EXCEPTION 'Caja no encontrada'; END IF;
        END IF;

        IF v_type = 'tpv' AND v_name ~* 'TPV[[:space:]]*2' THEN
            IF EXISTS (SELECT 1 FROM public.cash_closings WHERE closing_date = v_purchase_day) THEN
                RAISE EXCEPTION 'Esta fecha ya tiene un cierre; no se pueden registrar compras TPV2';
            END IF;
            IF abs(coalesce((SELECT sum(key::numeric * value::numeric) FROM jsonb_each_text(v_breakdown)),0) - v_amount) > 0.011 THEN
                RAISE EXCEPTION 'Debes desglosar los billetes y monedas de TPV2 (% euros)', v_amount;
            END IF;
            INSERT INTO public.tpv2_pending_purchases
                (request_id, purchase_date, occurred_at, amount, notes, source_box_id, breakdown, created_by)
            VALUES (p_request_id, v_purchase_day, p_purchase_at, v_amount, v_note, v_box, v_breakdown, v_user);
        ELSIF v_source = 'tpv1' THEN
            -- The old fallback alias has no cash box; retain historical behaviour.
            CONTINUE;
        ELSE
            INSERT INTO public.treasury_log
                (box_id, type, amount, breakdown, notes, user_id, created_at)
            VALUES (v_box, 'OUT', v_amount, v_breakdown, v_note, v_user, p_purchase_at);
        END IF;
    END LOOP;

    IF coalesce(p_change_amount, 0) >= 0.01 THEN
        IF p_change_box_id IS NULL THEN RAISE EXCEPTION 'Falta la caja de destino del cambio'; END IF;
        INSERT INTO public.treasury_log
            (box_id, type, amount, breakdown, notes, user_id, created_at)
        VALUES (p_change_box_id, 'IN', round(p_change_amount,2),
                coalesce(p_change_breakdown,'{}'::jsonb), 'Cambio (compra)', v_user, p_purchase_at);
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.register_multi_source_purchase(uuid,jsonb,text,timestamptz,numeric,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_multi_source_purchase(uuid,jsonb,text,timestamptz,numeric,uuid,jsonb) TO authenticated;

-- Store official gross cash denominations and physical inventory independently.
CREATE OR REPLACE FUNCTION public.merge_cash_denominations(
    p_base jsonb, p_delta jsonb, p_sign integer DEFAULT 1
) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT coalesce(jsonb_object_agg(denomination, qty), '{}'::jsonb)
    FROM (
        SELECT denomination, sum(quantity) AS qty
        FROM (
            SELECT key AS denomination, value::numeric AS quantity
            FROM jsonb_each_text(coalesce(p_base, '{}'::jsonb))
            UNION ALL
            SELECT key, p_sign * value::numeric
            FROM jsonb_each_text(coalesce(p_delta, '{}'::jsonb))
        ) entries
        GROUP BY denomination
        HAVING sum(quantity) <> 0
    ) totals;
$$;

CREATE OR REPLACE FUNCTION public.prepare_tpv2_cash_closing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_purchase_total numeric(12,2);
    v_purchase_breakdown jsonb := '{}'::jsonb;
    v_purchase record;
    v_physical_sum numeric;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.tpv2_settlement_version = 1 THEN
            IF NEW.closing_date <> OLD.closing_date THEN
                RAISE EXCEPTION 'No se puede cambiar la fecha de un cierre conciliado';
            END IF;
            IF abs(coalesce(NEW.cash_counted,0) - coalesce(NEW.cash_withdrawn,0)
                   - OLD.tpv2_purchase_total) > 0.011 THEN
                RAISE EXCEPTION 'El efectivo oficial debe incluir las compras TPV2';
            END IF;
            IF NEW.breakdown IS DISTINCT FROM OLD.breakdown THEN
                NEW.physical_breakdown := public.merge_cash_denominations(
                    NEW.breakdown, OLD.tpv2_purchase_breakdown, -1
                );
                IF EXISTS (
                    SELECT 1 FROM jsonb_each_text(NEW.physical_breakdown)
                    WHERE value::numeric < 0
                ) THEN
                    RAISE EXCEPTION 'El desglose no puede tener menos monedas que las compras TPV2';
                END IF;
            ELSE
                NEW.physical_breakdown := OLD.physical_breakdown;
            END IF;
            SELECT coalesce(sum(key::numeric * value::numeric),0)
              INTO v_physical_sum FROM jsonb_each_text(NEW.physical_breakdown);
            IF abs(v_physical_sum - coalesce(NEW.cash_withdrawn,0)) > 0.011 THEN
                RAISE EXCEPTION 'El desglose fisico no coincide con el efectivo ingresado';
            END IF;
            NEW.tpv2_purchase_total := OLD.tpv2_purchase_total;
            NEW.tpv2_purchase_breakdown := OLD.tpv2_purchase_breakdown;
            NEW.tpv2_settlement_version := 1;
        END IF;
        RETURN NEW;
    END IF;

    PERFORM pg_advisory_xact_lock(79225, NEW.closing_date - DATE '2000-01-01');
    IF EXISTS (SELECT 1 FROM public.cash_closings c WHERE c.closing_date=NEW.closing_date) THEN
        RAISE EXCEPTION 'Ya existe un cierre para esta fecha';
    END IF;
    SELECT coalesce(sum(amount),0) INTO v_purchase_total
    FROM public.tpv2_pending_purchases
    WHERE purchase_date=NEW.closing_date AND closing_id IS NULL;
    IF abs(coalesce(NEW.cash_counted,0) - coalesce(NEW.cash_withdrawn,0)
           - v_purchase_total) > 0.011 THEN
        RAISE EXCEPTION 'Las compras TPV2 han cambiado. Vuelve a cargar el cierre.';
    END IF;
    FOR v_purchase IN
        SELECT breakdown FROM public.tpv2_pending_purchases
        WHERE purchase_date = NEW.closing_date AND closing_id IS NULL
    LOOP
        v_purchase_breakdown := public.merge_cash_denominations(
            v_purchase_breakdown, v_purchase.breakdown
        );
    END LOOP;
    NEW.physical_breakdown := coalesce(NEW.breakdown,'{}'::jsonb);
    SELECT coalesce(sum(key::numeric * value::numeric),0)
      INTO v_physical_sum FROM jsonb_each_text(NEW.physical_breakdown);
    IF abs(v_physical_sum - coalesce(NEW.cash_withdrawn,0)) > 0.011 THEN
        RAISE EXCEPTION 'El desglose de efectivo fisico no coincide con el contado';
    END IF;
    NEW.breakdown := public.merge_cash_denominations(
        NEW.physical_breakdown, v_purchase_breakdown
    );
    NEW.tpv2_purchase_breakdown := v_purchase_breakdown;
    NEW.tpv2_purchase_total := v_purchase_total;
    NEW.tpv2_settlement_version := 1;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_prepare_tpv2_cash_closing ON public.cash_closings;
CREATE TRIGGER trg_prepare_tpv2_cash_closing
BEFORE INSERT OR UPDATE ON public.cash_closings
FOR EACH ROW EXECUTE FUNCTION public.prepare_tpv2_cash_closing();

-- The same database transaction posts both independently visible movements.
CREATE OR REPLACE FUNCTION public.fn_on_cash_closing_confirmed_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_notes text;
    v_op_box_id uuid;
    v_entry_amount numeric;
    v_purchase record;
    v_movement_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.treasury_log WHERE closing_id = OLD.id;
        RETURN OLD;
    END IF;

    v_notes := 'Cierre ' || ltrim(to_char(NEW.closing_date,'DD'),'0') ||
               '-' || to_char(NEW.closing_date,'MM-YY');
    SELECT id INTO v_op_box_id FROM public.cash_boxes WHERE type='operational' LIMIT 1;
    IF v_op_box_id IS NULL THEN RAISE EXCEPTION 'Falta la Caja inicial'; END IF;
    v_entry_amount := CASE WHEN NEW.tpv2_settlement_version = 1
                          THEN coalesce(NEW.cash_counted,0)
                          ELSE coalesce(NEW.cash_withdrawn,0) END;

    IF TG_OP = 'INSERT' THEN
        IF v_entry_amount > 0 THEN
            INSERT INTO public.treasury_log
                (box_id,type,amount,breakdown,user_id,notes,closing_id)
            VALUES (v_op_box_id,'CLOSE_ENTRY',v_entry_amount,
                    CASE WHEN NEW.tpv2_settlement_version = 1 THEN NEW.physical_breakdown ELSE coalesce(NEW.breakdown,'{}'::jsonb) END,NEW.closed_by,v_notes,NEW.id);
        END IF;
        IF NEW.tpv2_settlement_version = 1 THEN
            FOR v_purchase IN
                SELECT * FROM public.tpv2_pending_purchases
                WHERE purchase_date=NEW.closing_date AND closing_id IS NULL
                ORDER BY occurred_at,id FOR UPDATE
            LOOP
                INSERT INTO public.treasury_log
                    (box_id,type,amount,breakdown,user_id,notes,closing_id)
                VALUES (v_op_box_id,'OUT',v_purchase.amount,'{}'::jsonb,
                        coalesce(v_purchase.created_by,NEW.closed_by),
                        'Compra TPV2 · ' || v_purchase.notes,NEW.id)
                RETURNING id INTO v_movement_id;

                UPDATE public.tpv2_pending_purchases
                SET closing_id=NEW.id, treasury_movement_id=v_movement_id
                WHERE id=v_purchase.id;
            END LOOP;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE public.treasury_log SET amount=v_entry_amount,
            breakdown=CASE WHEN NEW.tpv2_settlement_version = 1 THEN NEW.physical_breakdown ELSE coalesce(NEW.breakdown,'{}'::jsonb) END,notes=v_notes
        WHERE closing_id=NEW.id AND type='CLOSE_ENTRY';
        IF NOT FOUND AND v_entry_amount>0 THEN
            INSERT INTO public.treasury_log
                (box_id,type,amount,breakdown,user_id,notes,closing_id)
            VALUES (v_op_box_id,'CLOSE_ENTRY',v_entry_amount,
                    CASE WHEN NEW.tpv2_settlement_version = 1 THEN NEW.physical_breakdown ELSE coalesce(NEW.breakdown,'{}'::jsonb) END,NEW.closed_by,v_notes,NEW.id);
        ELSIF v_entry_amount<=0 THEN
            DELETE FROM public.treasury_log WHERE closing_id=NEW.id AND type='CLOSE_ENTRY';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
