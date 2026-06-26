-- Mejoras para el calendario operativo del bar
-- 1. affects_bar en venues: qué espacios generan clientes para el bar
-- 2. icon en activity_kinds: identificador visual por tipo de actividad

ALTER TABLE venues ADD COLUMN IF NOT EXISTS affects_bar boolean NOT NULL DEFAULT false;
ALTER TABLE activity_kinds ADD COLUMN IF NOT EXISTS icon text;

-- P1-P4 son las pistas que generan público para el bar
UPDATE venues SET affects_bar = true WHERE code IN ('P1', 'P2', 'P3', 'P4');

-- Tipos de actividad con iconos
INSERT INTO activity_kinds (name, icon) VALUES
  ('Bàsquet',      '🏀'),
  ('Natació',      '🏊'),
  ('Handbol',      '🏐'),
  ('Voleibol',     '🏐'),
  ('Arts Marcials','🥋'),
  ('Futbol',       '⚽'),
  ('Gimnàstica',   '🤸'),
  ('Ioga',         '🧘'),
  ('Pàdel',        '🎾'),
  ('Atletisme',    '🏃'),
  ('General',      '⚪')
ON CONFLICT (name) DO NOTHING;

-- Limpiar columna icon de activities por si la versión anterior se aplicó
ALTER TABLE activities DROP COLUMN IF EXISTS icon;
