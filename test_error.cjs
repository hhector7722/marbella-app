const { execSync } = require('child_process');
const fs = require('fs');

const sql = `
SELECT 1;
`; // Test simple query to see error handling

try {
  const out = execSync(`npx supabase db query "${sql.replace(/\n/g, ' ')}" --linked`, { maxBuffer: 1024 * 1024 * 50 });
  console.log(out.toString());
} catch (e) {
  console.error("STDOUT:", e.stdout ? e.stdout.toString() : '');
  console.error("STDERR:", e.stderr ? e.stderr.toString() : '');
}
