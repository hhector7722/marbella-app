import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

function getEnv(key) {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const match = envContent.match(new RegExp(`${key}=(.*)`));
  return match ? match[1].trim() : null;
}

const supabaseUrl = getEnv('SUPABASE_URL');
const supabaseKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSearch() {
  console.log('Probando búsqueda de "sangria"...');
  const { data, error } = await supabase.rpc('gestionar_recetas', { 
    p_accion: 'buscar', 
    p_datos: { nombre: 'sangria' } 
  });

  if (error) {
    console.error('Error RPC:', error);
  } else {
    console.log('Resultado:');
    console.dir(data, { depth: null });
  }
}

testSearch();
