const { execSync } = require('child_process');
const fs = require('fs');

const sql = `
SELECT json_build_object(
  'columns', (
    SELECT json_agg(json_build_object(
      'table_name', c.relname,
      'column_name', a.attname,
      'data_type', t.typname,
      'is_nullable', NOT a.attnotnull,
      'default_val', pg_get_expr(ad.adbin, ad.adrelid),
      'type_mod', a.atttypmod
    ))
    FROM pg_attribute a
    JOIN pg_class c ON a.attrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    JOIN pg_type t ON a.atttypid = t.oid
    LEFT JOIN pg_attrdef ad ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
  )
) as result;
`;

try {
  console.log('Running query...');
  const out = execSync(`npx supabase db query "${sql.replace(/\n/g, ' ')}" --linked`, { maxBuffer: 1024 * 1024 * 50 }).toString();
  console.log("Success");
} catch (e) {
  console.error("STDOUT:", e.stdout ? e.stdout.toString() : '');
  console.error("STDERR:", e.stderr ? e.stderr.toString() : '');
}
