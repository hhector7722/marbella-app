import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const mappings = [
  { first_name: 'Silvia', last_name: 'Valiente', payroll_name: 'VALIENTE BLANCO SILVIA' },
  { first_name: 'Pere', last_name: 'Boladeres', payroll_name: 'BOLADERES VILA PERE' },
  { first_name: 'Hernan David', last_name: 'Gutierrez', payroll_name: 'GUTIERREZ HERNAN DAVID' },
  { first_name: 'Juan Jesus', last_name: 'Alvez de Olivera', payroll_name: 'ALVEZ DE OLIVERA JUAN JESUS' },
  { first_name: 'Lucia', last_name: 'Rodero', payroll_name: 'RODERO PEREZ, LUCIA' },
  { first_name: 'Willy', last_name: 'Ruiz', payroll_name: 'GUILLEM RUIZ HOMET' },
  { first_name: 'Hugo Rubio', last_name: 'Larripa', payroll_name: 'LARRIPA HUGO RUBIO' },
  { first_name: 'Pau Costa', last_name: 'Guirguet', payroll_name: 'ACOSTA PAU GUIRIGUET' },
  { first_name: 'Martí', last_name: 'Esteve', payroll_name: 'ESTEVE ORELL MARTI' },
  { first_name: 'Mamadou', last_name: 'Ndiaye', payroll_name: 'MAMADOU NYANDAYE' }
];

async function main() {
  for (const m of mappings) {
    const { data, error } = await supabase.from('profiles').update({ payroll_name: m.payroll_name }).eq('first_name', m.first_name).eq('last_name', m.last_name);
    if (error) {
      console.error(`Error actualizando ${m.first_name} ${m.last_name}:`, error.message);
    } else {
      console.log(`✅ ${m.first_name} ${m.last_name} -> ${m.payroll_name}`);
    }
  }
}
main();
