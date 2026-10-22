-- Exponer en Movimientos el concepto y los billetes originales de compras TPV2.
-- No copiar el desglose al OUT de treasury_log: su trigger volvería a descontar
-- estas denominaciones del inventario físico de Caja inicial.
UPDATE public.tpv2_pending_purchases
SET notes = btrim(regexp_replace(notes, ' \| TPV [12]: [0-9]+(\.[0-9]+)?€.*$', ''))
WHERE notes ~ ' \| TPV [12]: [0-9]+(\.[0-9]+)?€';

UPDATE public.treasury_log AS t
SET notes = p.notes
FROM public.tpv2_pending_purchases AS p
WHERE t.id = p.treasury_movement_id
  AND t.notes IS DISTINCT FROM p.notes;

-- El saldo sigue calculándose exclusivamente a partir de treasury_log.
-- La información de compra se aporta solo a la vista de consulta.
CREATE OR REPLACE VIEW public.v_treasury_movements_balance
WITH (security_invoker = true) AS
SELECT
    t.id,
    t.box_id,
    t.type,
    t.amount,
    CASE WHEN p.id IS NOT NULL THEN p.breakdown ELSE t.breakdown END AS breakdown,
    CASE WHEN p.id IS NOT NULL THEN p.notes ELSE t.notes END AS notes,
    t.created_at,
    t.user_id,
    t.closing_id,
    SUM(CASE
        WHEN t.type IN ('IN', 'CLOSE_ENTRY') THEN t.amount
        WHEN t.type = 'OUT' THEN -t.amount
        ELSE 0::numeric
    END) OVER (
        PARTITION BY t.box_id
        ORDER BY t.created_at, t.id
        ROWS UNBOUNDED PRECEDING
    ) AS running_balance,
    p.id AS tpv2_purchase_id
FROM public.treasury_log AS t
LEFT JOIN public.tpv2_pending_purchases AS p
    ON p.treasury_movement_id = t.id
WHERE t.type IN ('IN', 'OUT', 'CLOSE_ENTRY', 'ADJUSTMENT', 'SWAP');

-- El registro de cierre sigue con el mismo mecanismo atómico;
-- solo cambia el concepto del OUT para nuevas compras conciliadas.
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
                        v_purchase.notes,NEW.id)
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
