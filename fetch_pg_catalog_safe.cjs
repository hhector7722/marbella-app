const { execSync } = require('child_process');
const fs = require('fs');

const queries = {
  columns: `
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
  `,
  constraints: `
    SELECT json_agg(json_build_object(
      'table_name', c.relname,
      'conname', con.conname,
      'contype', con.contype,
      'condef', pg_get_constraintdef(con.oid)
    ))
    FROM pg_constraint con
    JOIN pg_class c ON con.conrelid = c.oid
    JOIN pg_namespace n ON con.connamespace = n.oid
    WHERE n.nspname = 'public'
  `,
  indexes: `
    SELECT json_agg(json_build_object(
      'table_name', c.relname,
      'index_name', i.relname,
      'indexdef', pg_get_indexdef(ix.indexrelid)
    ))
    FROM pg_index ix
    JOIN pg_class c ON ix.indrelid = c.oid
    JOIN pg_class i ON ix.indexrelid = i.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
  `,
  functions: `
    SELECT json_agg(json_build_object(
      'func_name', p.proname,
      'funcdef', pg_get_functiondef(p.oid)
    ))
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
  `,
  triggers: `
    SELECT json_agg(json_build_object(
      'table_name', c.relname,
      'trigger_name', t.tgname,
      'triggerdef', pg_get_triggerdef(t.oid)
    ))
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
  `,
  rls: `
    SELECT json_agg(json_build_object(
      'table_name', c.relname,
      'relrowsecurity', c.relrowsecurity,
      'relforcerowsecurity', c.relforcerowsecurity
    ))
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  `,
  policies: `
    SELECT json_agg(json_build_object(
      'table_name', tablename,
      'policy_name', policyname,
      'permissive', permissive,
      'roles', roles,
      'cmd', cmd,
      'qual', qual,
      'with_check', with_check
    ))
    FROM pg_policies
    WHERE schemaname = 'public'
  `,
  enums: `
    SELECT json_agg(json_build_object(
      'enum_name', t.typname,
      'enum_labels', (
        SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder)
        FROM pg_enum e WHERE e.enumtypid = t.oid
      )
    ))
    FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typtype = 'e'
  `,
  views: `
    SELECT json_agg(json_build_object(
      'view_name', c.relname,
      'viewdef', pg_get_viewdef(c.oid)
    ))
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relkind = 'v'
  `
};

async function run() {
  const result = {};
  for (const [key, sql] of Object.entries(queries)) {
    console.log('Fetching', key, '...');
    try {
      const q = "SELECT (" + sql + ") as data;";
      const out = execSync("npx supabase db query \"" + q.replace(/\n/g, ' ') + "\" --linked", { maxBuffer: 1024 * 1024 * 50 }).toString();
      const match = out.match(/{[\s\S]*}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        const data = parsed.rows[0].data || parsed.rows[0]['?column?'];
        result[key] = data || [];
      } else {
        console.error('No JSON found for', key);
        result[key] = [];
      }
    } catch (e) {
      console.error("Failed on", key);
      console.error("STDERR:", e.stderr ? e.stderr.toString() : '');
      result[key] = [];
    }
  }
  fs.writeFileSync('pg_catalog_metadata.json', JSON.stringify(result, null, 2));
  console.log('Saved to pg_catalog_metadata.json');
}

run();
