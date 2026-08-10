const fs = require('fs');
const { execSync } = require('child_process');

const repoRoot = process.cwd();
const poolerPath = `${repoRoot}/supabase/.temp/pooler-url`;
if (!fs.existsSync(poolerPath)) {
  console.error('POOLER URL not found:', poolerPath);
  process.exit(2);
}
const pooler = fs.readFileSync(poolerPath,'utf8').trim();
const snapshotPath = `${repoRoot}/sql/diagnostics/k2/2026-08-10-k2-snapshot-37f7157a.json`;
if (!fs.existsSync(snapshotPath)) {
  console.error('Snapshot file not found:', snapshotPath);
  process.exit(2);
}
const snapshot = JSON.parse(fs.readFileSync(snapshotPath,'utf8'));

function psql(query){
  return execSync(`psql "${pooler}" -t -A -c "${query.replace(/"/g,'\\\"')}"`, {encoding:'utf8'}).trim();
}

const results = {tables: {}};
for (const table of Object.keys(snapshot.scope)){
  try{
    const cnt = psql(`SELECT count(*) FROM public.${table};`);
    const colsRaw = psql(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' ORDER BY ordinal_position;`);
    const cols = colsRaw ? colsRaw.split('\n').map(s=>s.trim()).filter(Boolean) : [];
    results.tables[table] = {expected_count: snapshot.counts[table] || null, actual_count: Number(cnt), expected_columns: snapshot.scope[table], actual_columns: cols};
    // detect missing columns
    const missing = snapshot.scope[table].filter(c=>!cols.includes(c));
    const extra = cols.filter(c=>!snapshot.scope[table].includes(c));
    results.tables[table].missing_columns = missing;
    results.tables[table].extra_columns = extra;
  }catch(e){
    results.tables[table] = {error: String(e)};
  }
}

console.log(JSON.stringify(results,null,2));
