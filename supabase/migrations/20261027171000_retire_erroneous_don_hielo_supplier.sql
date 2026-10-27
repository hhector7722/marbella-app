-- The user confirmed that the physical ice vendor is the existing Hielo Fenix (id 13).
-- Don Hielo (id 22) was created in error and had no business records.
DO $body$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=13 AND name='Hielo Fenix') THEN
    RAISE EXCEPTION 'Existing Hielo Fenix supplier missing';
 END IF;
 -- Referential integrity prevents removal if new dependencies exist.
 DELETE FROM public.suppliers WHERE id=22 AND name='Don Hielo';
END;
$body$;