-- ==============================================================================
-- DIAGNÓSTICO NÓMINAS - Ejecutar en Supabase SQL Editor
-- Para ver qué datos existen y cómo están vinculados
-- ==============================================================================

-- 0. ALERTAS: Perfiles sin codigo_empleado (las nóminas NO se vincularán)
SELECT '⚠️ SIN CÓDIGO' AS alerta, first_name, last_name, email, dni, codigo_empleado
FROM profiles
WHERE role IN ('staff', 'manager', 'supervisor')
  AND (codigo_empleado IS NULL OR codigo_empleado = '')
ORDER BY first_name;

-- 0b. Códigos duplicados (si hay, el webhook fallaría)
SELECT codigo_empleado, COUNT(*) AS cuantos, array_agg(first_name || ' ' || last_name) AS empleados
FROM profiles
WHERE codigo_empleado IS NOT NULL AND codigo_empleado != ''
GROUP BY codigo_empleado
HAVING COUNT(*) > 1;

-- 1. Conteo por tabla
SELECT 'employee_documents (tipo=nomina)' AS origen, COUNT(*) AS total FROM employee_documents WHERE tipo = 'nomina'
UNION ALL
SELECT 'nominas (legacy)' AS origen, COUNT(*) FROM nominas
UNION ALL
SELECT 'nominas_excepciones (errores)' AS origen, COUNT(*) FROM nominas_excepciones;

-- 2. Detalle employee_documents (webhook codigo_empleado)
SELECT ed.id, ed.user_id, ed.codigo_empleado, ed.mes, ed.year, ed.filename, ed.storage_path, ed.created_at,
       p.first_name, p.last_name, p.dni, p.codigo_empleado AS profile_codigo
FROM employee_documents ed
LEFT JOIN profiles p ON p.id = ed.user_id
WHERE ed.tipo = 'nomina'
ORDER BY ed.created_at DESC
LIMIT 20;

-- 3. Detalle nominas (tabla legacy - posiblemente DNI)
SELECT n.id, n.empleado_id, n.mes_anio, n.file_path, n.created_at,
       p.first_name, p.last_name, p.dni, p.codigo_empleado
FROM nominas n
LEFT JOIN profiles p ON p.id = n.empleado_id
ORDER BY n.created_at DESC
LIMIT 20;

-- 4. Excepciones (nóminas que fallaron al procesar)
SELECT * FROM nominas_excepciones ORDER BY created_at DESC LIMIT 10;

-- 5. Perfiles con dni y codigo_empleado (para ver mapeo)
SELECT id, first_name, last_name, dni, codigo_empleado, role
FROM profiles
WHERE role IN ('staff', 'manager', 'supervisor')
ORDER BY first_name;
