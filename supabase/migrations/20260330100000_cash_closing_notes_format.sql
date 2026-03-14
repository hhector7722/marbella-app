-- Formato de notas en /movements para cierres de caja: "Cierre dd-mm-aa" (sin comillas)

CREATE OR REPLACE FUNCTION public.fn_on_cash_closing_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_op_box_id UUID;
    v_notes TEXT;
BEGIN
    v_notes := 'Cierre ' || ltrim(to_char(NEW.closing_date, 'DD'), '0') || '-' || to_char(NEW.closing_date, 'MM-YY');

    SELECT id INTO v_op_box_id FROM cash_boxes WHERE type = 'operational' LIMIT 1;

    IF TG_OP = 'INSERT' THEN
        IF v_op_box_id IS NOT NULL AND NEW.cash_withdrawn > 0 THEN
            INSERT INTO treasury_log (box_id, type, amount, breakdown, user_id, notes, closing_id)
            VALUES (v_op_box_id, 'CLOSE_ENTRY', NEW.cash_withdrawn, NEW.breakdown, NEW.closed_by, v_notes, NEW.id);
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE treasury_log SET amount = NEW.cash_withdrawn, breakdown = NEW.breakdown, notes = v_notes
        WHERE closing_id = NEW.id;

        IF NOT FOUND AND v_op_box_id IS NOT NULL AND NEW.cash_withdrawn > 0 THEN
            INSERT INTO treasury_log (box_id, type, amount, breakdown, user_id, notes, closing_id)
            VALUES (v_op_box_id, 'CLOSE_ENTRY', NEW.cash_withdrawn, NEW.breakdown, NEW.closed_by, v_notes, NEW.id);
        ELSIF NEW.cash_withdrawn <= 0 THEN
            DELETE FROM treasury_log WHERE closing_id = NEW.id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        DELETE FROM treasury_log WHERE closing_id = OLD.id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_on_cash_closing_confirmed_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_notes TEXT;
BEGIN
    v_notes := 'Cierre ' || ltrim(to_char(NEW.closing_date, 'DD'), '0') || '-' || to_char(NEW.closing_date, 'MM-YY');

    IF TG_OP = 'INSERT' THEN
        IF NEW.cash_withdrawn > 0 THEN
            INSERT INTO treasury_log (box_id, type, amount, breakdown, user_id, notes, closing_id)
            SELECT id, 'CLOSE_ENTRY', NEW.cash_withdrawn, NEW.breakdown, NEW.closed_by, v_notes, NEW.id
            FROM cash_boxes WHERE type = 'operational' LIMIT 1;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE treasury_log
        SET amount = NEW.cash_withdrawn,
            breakdown = NEW.breakdown,
            notes = v_notes
        WHERE closing_id = NEW.id;

        IF NOT FOUND AND NEW.cash_withdrawn > 0 THEN
            INSERT INTO treasury_log (box_id, type, amount, breakdown, user_id, notes, closing_id)
            SELECT id, 'CLOSE_ENTRY', NEW.cash_withdrawn, NEW.breakdown, NEW.closed_by, v_notes, NEW.id
            FROM cash_boxes WHERE type = 'operational' LIMIT 1;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        DELETE FROM treasury_log WHERE closing_id = OLD.id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;
