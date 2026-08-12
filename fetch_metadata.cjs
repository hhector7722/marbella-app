const { execSync } = require('child_process');
const fs = require('fs');

const sql = `
SELECT json_build_object(
  'tables', (SELECT json_agg(row_to_json(t)) FROM information_schema.tables t WHERE table_schema = 'public'),
  'columns', (SELECT json_agg(row_to_json(c)) FROM information_schema.columns c WHERE table_schema = 'public'),
  'routines', (SELECT json_agg(row_to_json(r)) FROM information_schema.routines r WHERE routine_schema = 'public'),
  'triggers', (SELECT json_agg(row_to_json(tr)) FROM information_schema.triggers tr WHERE trigger_schema = 'public'),
  'views', (SELECT json_agg(row_to_json(v)) FROM information_schema.views v WHERE table_schema = 'public')
) as result;
`;

try {
  console.log('Running query...');
  const out = execSync(`npx supabase db query "${sql}" --linked`, { maxBuffer: 1024 * 1024 * 50 }).toString();
  
  // Extract JSON payload
  const match = out.match(/{[\s\S]*}/);
  if (match) {
    fs.writeFileSync('remote_metadata.json', match[0]);
    console.log('Saved to remote_metadata.json');
  } else {
    console.error('No JSON found in output');
  }
} catch (e) {
  console.error(e.message);
}
