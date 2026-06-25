-- Catálogo Maestro de Entidades (Organizadores o Eventos Periódicos)
CREATE TABLE activities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text UNIQUE NOT NULL,
    external_name text, -- Para matching automático del PDF. Ej: 'CLUB NATACIÓ POBLENOU'
    activity_type text,
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- Catálogo Demográfico
CREATE TABLE categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text UNIQUE NOT NULL,
    age_min integer,
    age_max integer,
    created_at timestamptz DEFAULT now()
);

-- Naturaleza del Evento
CREATE TABLE activity_kinds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text UNIQUE NOT NULL, -- Ej: 'Entrenamiento', 'Partido', 'Campus'
    created_at timestamptz DEFAULT now()
);

-- Espacios/Pistas
CREATE TABLE venues (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE NOT NULL, -- Ej: 'P1'
    name text,
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- La Ocurrencia Temporal
CREATE TABLE activity_occurrences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id uuid REFERENCES activities(id) ON DELETE CASCADE NOT NULL,
    
    activity_date date NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    
    -- Campos calculados para cruces analíticos eficientes con el TPV.
    -- Añadida protección de cruce de medianoche (por si algún evento termina de madrugada).
    sys_start_timestamp timestamptz GENERATED ALWAYS AS ((activity_date + start_time) AT TIME ZONE 'Europe/Madrid') STORED,
    sys_end_timestamp timestamptz GENERATED ALWAYS AS (
        (activity_date + end_time + CASE WHEN end_time < start_time THEN interval '1 day' ELSE interval '0' END) AT TIME ZONE 'Europe/Madrid'
    ) STORED,

    kind_id uuid REFERENCES activity_kinds(id),
    notes text,
    
    source_pdf_id uuid REFERENCES pavilion_activity_sheets(id) ON DELETE SET NULL,
    source_type text DEFAULT 'manual',
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Índices Analíticos para Ocurrencias
CREATE INDEX idx_activity_occurrences_sys_start ON activity_occurrences(sys_start_timestamp);
CREATE INDEX idx_activity_occurrences_sys_end ON activity_occurrences(sys_end_timestamp);
CREATE INDEX idx_activity_occurrences_activity_id ON activity_occurrences(activity_id);
CREATE INDEX idx_activity_occurrences_date ON activity_occurrences(activity_date);

-- Tabla Puente de Pistas
CREATE TABLE occurrence_venues (
    occurrence_id uuid REFERENCES activity_occurrences(id) ON DELETE CASCADE,
    venue_id uuid REFERENCES venues(id) ON DELETE CASCADE,
    PRIMARY KEY (occurrence_id, venue_id)
);

CREATE INDEX idx_occurrence_venues_venue_id ON occurrence_venues(venue_id);

-- Desglose Demográfico (Tabla Hija)
CREATE TABLE occurrence_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    occurrence_id uuid REFERENCES activity_occurrences(id) ON DELETE CASCADE,
    category_id uuid REFERENCES categories(id) NOT NULL,
    
    group_label text, -- Opcional. Ej: 'Equipo A', 'Femenino', 'Reserva'
    notes text, -- Observaciones específicas de este grupo
    participants integer,
    
    created_at timestamptz DEFAULT now(),
    
    UNIQUE(occurrence_id, category_id, group_label) -- El group_label nulo o no, permite diferenciar
);

CREATE INDEX idx_occurrence_groups_category_id ON occurrence_groups(category_id);

-- Políticas RLS Básicas (Asumiendo que el acceso es por roles authenticated)
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_kinds ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE occurrence_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE occurrence_groups ENABLE ROW LEVEL SECURITY;

-- Políticas genéricas de lectura para usuarios autenticados
CREATE POLICY "Enable read access for authenticated users on activities" ON activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable read access for authenticated users on categories" ON categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable read access for authenticated users on activity_kinds" ON activity_kinds FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable read access for authenticated users on venues" ON venues FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable read access for authenticated users on occurrences" ON activity_occurrences FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable read access for authenticated users on occurrence_venues" ON occurrence_venues FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable read access for authenticated users on occurrence_groups" ON occurrence_groups FOR SELECT TO authenticated USING (true);

-- Políticas de inserción/actualización para roles staff (ajustar si tienes roles específicos como 'manager')
CREATE POLICY "Enable write access for authenticated users on occurrences" ON activity_occurrences FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable write access for authenticated users on occurrence_venues" ON occurrence_venues FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable write access for authenticated users on occurrence_groups" ON occurrence_groups FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable write access for authenticated users on activities" ON activities FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable write access for authenticated users on categories" ON categories FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable write access for authenticated users on activity_kinds" ON activity_kinds FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable write access for authenticated users on venues" ON venues FOR ALL TO authenticated USING (true);

-- Trigger para updated_at en activity_occurrences
CREATE OR REPLACE FUNCTION update_activity_occurrences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_activity_occurrences_updated_at
    BEFORE UPDATE ON activity_occurrences
    FOR EACH ROW
    EXECUTE FUNCTION update_activity_occurrences_updated_at();

-- Función RPC útil para limpiar el día entero antes de re-ingestar un PDF (Idempotencia)
CREATE OR REPLACE FUNCTION delete_activity_occurrences_by_date(target_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Borrado en cascada gracias a ON DELETE CASCADE
  DELETE FROM activity_occurrences WHERE activity_date = target_date AND source_type = 'pdf';
END;
$$;
