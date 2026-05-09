import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function getEnv(key) {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const match = envContent.match(new RegExp(`${key}=(.*)`));
  return match ? match[1].trim() : null;
}

const supabaseUrl = getEnv('SUPABASE_URL');
const supabaseKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260509140000_flexible_recipe_search.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('Aplicando migración...');
  
  // Usamos rpc para ejecutar SQL arbitrario si existe una función para ello, 
  // o intentamos usar el cliente de postgres si estuviera disponible.
  // En Supabase, normalmente no hay un endpoint de 'ejecutar sql' por seguridad, 
  // pero a veces se deja una función rpc 'exec_sql' para mantenimiento.
  // Si no, tendremos que pedirle al usuario que lo pegue en el SQL Editor.
  
  const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
    console.error('Error al aplicar migración via RPC:', error.message);
    console.log('\nPor favor, copia el contenido de supabase/migrations/20260509140000_flexible_recipe_search.sql y pégalo en el SQL Editor de Supabase.');
  } else {
    console.log('Migración aplicada con éxito.');
  }
}

applyMigration();
