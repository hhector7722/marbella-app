-- K5/K4 · La evidencia documental de una recepción K5 pertenece al proposal
-- confirmado de esa línea, no necesariamente al documento que originó el
-- mapping reutilizable. Antes de este ajuste, K4 tomaba
-- purchase_mapping_versions.source_document_extraction_id; si el mapping era
-- nuevo sin esa procedencia (o reutilizado desde otro albarán), el movimiento y
-- la confirmación podían quedar con NULL o con una extracción histórica.
--
-- Conservamos K4 sin acoplarlo a K5: estos triggers solo sustituyen la
-- procedencia cuando la línea tiene una propuesta K5 vigente vinculada al mismo
-- albarán. Las recepciones legacy siguen usando el valor que K4 ya proporcione.

CREATE OR REPLACE FUNCTION public.k5_fill_receipt_source_extraction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_line_id uuid;
  v_extraction_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'stock_movements' THEN
    IF NEW.movement_type IS DISTINCT FROM 'PURCHASE'
       OR NEW.reference_type::text IS DISTINCT FROM 'purchase_invoice_line'
       OR NEW.reference_id IS NULL THEN
      RETURN NEW;
    END IF;
    v_line_id := NEW.reference_id;
  ELSIF TG_TABLE_NAME = 'purchase_receipt_confirmations' THEN
    IF NEW.purchase_invoice_line_id IS NULL THEN
      RETURN NEW;
    END IF;
    v_line_id := NEW.purchase_invoice_line_id;
  ELSE
    RETURN NEW;
  END IF;

  SELECT proposal.document_extraction_id
  INTO v_extraction_id
  FROM public.purchase_invoice_lines line
  JOIN public.purchase_interpretation_proposals proposal
    ON proposal.id = line.interpretation_proposal_id
  WHERE line.id = v_line_id
    AND proposal.purchase_invoice_id = line.invoice_id;

  IF v_extraction_id IS NOT NULL THEN
    NEW.source_document_extraction_id := v_extraction_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.k5_fill_receipt_source_extraction() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS k5_stock_movement_source_extraction ON public.stock_movements;
CREATE TRIGGER k5_stock_movement_source_extraction
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.k5_fill_receipt_source_extraction();

DROP TRIGGER IF EXISTS k5_receipt_confirmation_source_extraction ON public.purchase_receipt_confirmations;
CREATE TRIGGER k5_receipt_confirmation_source_extraction
  BEFORE INSERT ON public.purchase_receipt_confirmations
  FOR EACH ROW
  EXECUTE FUNCTION public.k5_fill_receipt_source_extraction();

COMMENT ON FUNCTION public.k5_fill_receipt_source_extraction() IS
  'Para recepciones K5, fija source_document_extraction_id desde la propuesta de interpretación vigente de la línea. No modifica hechos existentes.';
