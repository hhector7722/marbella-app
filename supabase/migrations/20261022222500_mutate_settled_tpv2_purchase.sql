-- Preserve movement display order and expose the original purchase timestamp.
CREATE OR REPLACE VIEW public.v_treasury_movements_balance
WITH (security_invoker = true) AS
SELECT t.id,t.box_id,t.type,t.amount,
       CASE WHEN p.id IS NOT NULL THEN p.breakdown ELSE t.breakdown END AS breakdown,
       CASE WHEN p.id IS NOT NULL THEN p.notes ELSE t.notes END AS notes,
       t.created_at,t.user_id,t.closing_id,
       SUM(CASE WHEN t.type IN ('IN','CLOSE_ENTRY') THEN t.amount
                WHEN t.type='OUT' THEN -t.amount ELSE 0::numeric END)
       OVER (PARTITION BY t.box_id ORDER BY t.created_at,t.id ROWS UNBOUNDED PRECEDING)
       AS running_balance,
       p.id AS tpv2_purchase_id,
       p.occurred_at AS tpv2_purchase_occurred_at
FROM public.treasury_log t
LEFT JOIN public.tpv2_pending_purchases p ON p.treasury_movement_id=t.id
WHERE t.type IN ('IN','OUT','CLOSE_ENTRY','ADJUSTMENT','SWAP');

-- Purchases settled into a close can be revised without changing actual deposited cash.
-- The trigger recalculates official gross totals from linked purchases on every close update.
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
            SELECT coalesce(sum(amount),0) INTO v_purchase_total
            FROM public.tpv2_pending_purchases
            WHERE closing_id = OLD.id;
            FOR v_purchase IN
                SELECT breakdown FROM public.tpv2_pending_purchases WHERE closing_id = OLD.id
            LOOP
                v_purchase_breakdown := public.merge_cash_denominations(v_purchase_breakdown, v_purchase.breakdown);
            END LOOP;
            IF abs(coalesce(NEW.cash_counted,0) - coalesce(NEW.cash_withdrawn,0)
                   - v_purchase_total) > 0.011 THEN
                RAISE EXCEPTION 'El efectivo oficial no coincide con las compras TPV2';
            END IF;
            IF NEW.breakdown IS DISTINCT FROM OLD.breakdown THEN
                NEW.physical_breakdown := public.merge_cash_denominations(
                    NEW.breakdown, v_purchase_breakdown, -1
                );
                IF EXISTS (
                    SELECT 1 FROM jsonb_each_text(NEW.physical_breakdown)
                    WHERE value::numeric < 0
                ) THEN
                    RAISE EXCEPTION 'El desglose no puede tener menos monedas que las compras TPV2';
                END IF;
            ELSE
                NEW.physical_breakdown := OLD.physical_breakdown;
                -- A purchase edit changes the OFFICIAL breakdown, not the physical deposit.
                NEW.breakdown := public.merge_cash_denominations(
                    OLD.physical_breakdown, v_purchase_breakdown
                );
            END IF;
            SELECT coalesce(sum(key::numeric * value::numeric),0)
              INTO v_physical_sum FROM jsonb_each_text(NEW.physical_breakdown);
            IF abs(v_physical_sum - coalesce(NEW.cash_withdrawn,0)) > 0.011 THEN
                RAISE EXCEPTION 'El desglose físico no coincide con el efectivo ingresado';
            END IF;
            NEW.tpv2_purchase_total := v_purchase_total;
            NEW.tpv2_purchase_breakdown := v_purchase_breakdown;
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
        RAISE EXCEPTION 'El desglose de efectivo físico no coincide con el contado';
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

CREATE TABLE public.tpv2_purchase_change_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    purchase_id uuid NOT NULL,
    closing_id uuid NOT NULL,
    action text NOT NULL CHECK (action IN ('update','delete')),
    old_purchase jsonb NOT NULL,
    new_purchase jsonb,
    changed_by uuid NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tpv2_purchase_change_audit ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.tpv2_purchase_change_audit TO authenticated;
CREATE POLICY tpv2_purchase_change_audit_managers ON public.tpv2_purchase_change_audit
    FOR SELECT TO authenticated USING (public.is_manager_or_admin());

-- Authenticated managers perform adjustments in one DB transaction.
-- Both the close entry and TPV2 OUT reverse/reapply through existing treasury triggers.
CREATE OR REPLACE FUNCTION public.mutate_settled_tpv2_purchase(
    p_purchase_id uuid,
    p_action text,
    p_notes text DEFAULT NULL,
    p_breakdown jsonb DEFAULT NULL,
    p_occurred_at timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor uuid := auth.uid();
    v_purchase public.tpv2_pending_purchases%ROWTYPE;
    v_closing public.cash_closings%ROWTYPE;
    v_closing_id uuid;
    v_new_amount numeric(12,2);
    v_new_breakdown jsonb := '{}'::jsonb;
    v_new_purchase_total numeric(12,2);
    v_notes text;
    v_date timestamptz;
    v_key text;
    v_qty numeric;
    v_affected int;
BEGIN
    IF v_actor IS NULL OR NOT public.is_manager_or_admin() THEN
        RAISE EXCEPTION 'Solo un responsable puede editar o eliminar compras conciliadas';
    END IF;
    IF p_purchase_id IS NULL OR p_action NOT IN ('update','delete') THEN
        RAISE EXCEPTION 'Operación de compra inválida';
    END IF;

    SELECT closing_id INTO v_closing_id
    FROM public.tpv2_pending_purchases WHERE id=p_purchase_id;
    IF v_closing_id IS NULL THEN RAISE EXCEPTION 'No se encuentra una compra conciliada'; END IF;

    -- Consistent lock order: closing first, linked purchase second.
    SELECT * INTO v_closing FROM public.cash_closings
    WHERE id=v_closing_id FOR UPDATE;
    IF NOT FOUND OR v_closing.tpv2_settlement_version <> 1 THEN
        RAISE EXCEPTION 'El cierre no admite conciliación de compras TPV2';
    END IF;
    SELECT * INTO v_purchase FROM public.tpv2_pending_purchases
    WHERE id=p_purchase_id FOR UPDATE;
    IF NOT FOUND OR v_purchase.closing_id IS DISTINCT FROM v_closing.id OR v_purchase.treasury_movement_id IS NULL THEN
        RAISE EXCEPTION 'La compra ha cambiado; vuelve a abrir el movimiento';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.treasury_log
        WHERE id=v_purchase.treasury_movement_id AND closing_id=v_closing.id
        AND type='OUT' AND amount=v_purchase.amount
    ) THEN RAISE EXCEPTION 'La salida asociada al cierre ya no coincide'; END IF;

    IF p_action='update' THEN
        v_notes := btrim(coalesce(p_notes,''));
        IF v_notes = '' THEN RAISE EXCEPTION 'El concepto de compra es obligatorio'; END IF;
        IF jsonb_typeof(p_breakdown) IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'El desglose de billetes y monedas es obligatorio';
        END IF;
        FOR v_key, v_qty IN SELECT key,value::numeric FROM jsonb_each_text(p_breakdown)
        LOOP
            IF v_key::numeric NOT IN (0.01,0.02,0.05,0.1,0.2,0.5,1,2,5,10,20,50,100,200,500)
               OR v_qty <= 0 OR v_qty <> trunc(v_qty) OR v_qty > 10000 THEN
                RAISE EXCEPTION 'Billete, moneda o cantidad inválida';
            END IF;
            v_new_amount := coalesce(v_new_amount,0) + v_key::numeric * v_qty;
            v_new_breakdown := v_new_breakdown || jsonb_build_object(v_key,v_qty);
        END LOOP;
        v_new_amount := round(coalesce(v_new_amount,0),2);
        IF v_new_amount <= 0 THEN RAISE EXCEPTION 'La compra debe tener un importe positivo'; END IF;
        v_date := coalesce(p_occurred_at,v_purchase.occurred_at);
        IF (v_date AT TIME ZONE 'Europe/Madrid')::date <> v_closing.closing_date THEN
            RAISE EXCEPTION 'La compra debe conservar la fecha del cierre';
        END IF;
        UPDATE public.tpv2_pending_purchases
        SET notes=v_notes,amount=v_new_amount,breakdown=v_new_breakdown,occurred_at=v_date
        WHERE id=p_purchase_id;
        UPDATE public.treasury_log SET amount=v_new_amount,notes=v_notes
        WHERE id=v_purchase.treasury_movement_id AND type='OUT' AND closing_id=v_closing.id;
        GET DIAGNOSTICS v_affected=ROW_COUNT;
        IF v_affected <> 1 THEN RAISE EXCEPTION 'No se ha podido actualizar el movimiento'; END IF;
        IF v_purchase.legacy_movement_id IS NOT NULL THEN
            UPDATE public.treasury_log
            SET amount=v_new_amount,breakdown=v_new_breakdown,notes=v_notes,created_at=v_date
            WHERE id=v_purchase.legacy_movement_id AND type='OUT';
            GET DIAGNOSTICS v_affected=ROW_COUNT;
            IF v_affected <> 1 THEN RAISE EXCEPTION 'No se ha podido actualizar el movimiento TPV2 original'; END IF;
        END IF;
    ELSE
        DELETE FROM public.treasury_log
        WHERE id=v_purchase.treasury_movement_id AND type='OUT' AND closing_id=v_closing.id;
        GET DIAGNOSTICS v_affected=ROW_COUNT;
        IF v_affected <> 1 THEN RAISE EXCEPTION 'No se ha podido eliminar la salida de Caja inicial'; END IF;
        IF v_purchase.legacy_movement_id IS NOT NULL THEN
            DELETE FROM public.treasury_log
            WHERE id=v_purchase.legacy_movement_id AND type='OUT';
            GET DIAGNOSTICS v_affected=ROW_COUNT;
            IF v_affected <> 1 THEN RAISE EXCEPTION 'No se ha podido eliminar el movimiento TPV2 original'; END IF;
        END IF;
        DELETE FROM public.tpv2_pending_purchases WHERE id=p_purchase_id;
    END IF;

    SELECT coalesce(sum(amount),0) INTO v_new_purchase_total
    FROM public.tpv2_pending_purchases WHERE closing_id=v_closing.id;

    -- The BEFORE UPDATE trigger merges the linked denomination breakdown with
    -- the original physical breakdown, while AFTER UPDATE updates CLOSE_ENTRY.
    UPDATE public.cash_closings
    SET cash_counted = coalesce(cash_withdrawn,0) + v_new_purchase_total,
        difference = coalesce(cash_withdrawn,0) + v_new_purchase_total - coalesce(cash_expected,0)
    WHERE id=v_closing.id;
    GET DIAGNOSTICS v_affected=ROW_COUNT;
    IF v_affected <> 1 THEN RAISE EXCEPTION 'No se ha podido conciliar el cierre'; END IF;

    INSERT INTO public.tpv2_purchase_change_audit
        (purchase_id,closing_id,action,old_purchase,new_purchase,changed_by)
    VALUES (
        p_purchase_id,v_closing.id,p_action,to_jsonb(v_purchase),
        CASE WHEN p_action='update'
        THEN (SELECT to_jsonb(p) FROM public.tpv2_pending_purchases p WHERE id=p_purchase_id)
        ELSE NULL END,
        v_actor
    );
END;
$$;
REVOKE ALL ON FUNCTION public.mutate_settled_tpv2_purchase(uuid,text,text,jsonb,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mutate_settled_tpv2_purchase(uuid,text,text,jsonb,timestamptz) TO authenticated;
