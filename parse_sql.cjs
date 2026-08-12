const fs = require('fs');
const { parse } = require('pgsql-ast-parser');

const sql = fs.readFileSync('supabase/migrations/20260220000000_initial_schema.sql', 'utf8');

try {
  const ast = parse(sql);
  
  const tables = ast.filter(node => node.type === 'create table');
  console.log(`Found ${tables.length} tables`);
  
  if (tables.length > 0) {
    console.log(JSON.stringify(tables[0], null, 2));
  }
} catch (e) {
  console.error("Parse error:", e.message);
}
