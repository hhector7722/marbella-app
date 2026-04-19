-- Vista SSOT para "La Carta" digital (staff): TPV + mapeo + receta + foto real.
-- PVP: bdp_articulos.precio_base; fallback recipes.sale_price si precio_base es NULL.
-- Descripción: presentation, luego elaboration.

CREATE OR REPLACE VIEW public.v_digital_menu_items AS
SELECT
    a.id AS articulo_id,
    a.nombre AS articulo_nombre,
    f.id AS familia_id,
    f.nombre AS familia_nombre,
    r.id AS recipe_id,
    r.name AS recipe_name,
    NULLIF(
        trim(
            COALESCE(
                NULLIF(trim(COALESCE(r.presentation, ''::text)), ''),
                NULLIF(trim(COALESCE(r.elaboration, ''::text)), '')
            )
        ),
        ''
    ) AS descripcion,
    COALESCE(a.precio_base, r.sale_price) AS precio,
    r.photo_url AS photo_url
FROM public.map_tpv_receta m
JOIN public.bdp_articulos a ON a.id = m.articulo_id
JOIN public.recipes r ON r.id = m.recipe_id
LEFT JOIN public.bdp_familias f ON f.id = a.familia_id;

COMMENT ON VIEW public.v_digital_menu_items IS 'Carta digital: artículos TPV mapeados a receta; lectura staff/authenticated.';

GRANT SELECT ON public.v_digital_menu_items TO authenticated;
-- Lectura pública (QR): descomentar cuando se exponga sin login
-- GRANT SELECT ON public.v_digital_menu_items TO anon;
