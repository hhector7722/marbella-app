ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS joining_date DATE DEFAULT CURRENT_DATE;

COMMENT ON COLUMN profiles.joining_date IS 'Fecha de incorporación del empleado. Los cálculos de nómina ignorarán semanas anteriores a esta fecha.';
