-- Añadir columna de stock recomendado a la tabla ingredients
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS recommended_stock DECIMAL(10,2);
NOTIFY pgrst, 'reload schema';
