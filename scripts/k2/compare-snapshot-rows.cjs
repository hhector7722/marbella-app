const fs = require('fs');
const { execSync } = require('child_process');
const repoRoot = process.cwd();
const pooler = fs.readFileSync(`${repoRoot}/supabase/.temp/pooler-url`,'utf8').trim();
// Ensure PGPASSWORD is available to child psql processes
try{
  const envPw = fs.readFileSync(`${repoRoot}/.env.local`,'utf8').split('\n').find(l=>l.startsWith('PGPASSWORD='));
  if(envPw){
    process.env.PGPASSWORD = envPw.split('=')[1];
  }
}catch(e){/* ignore */}
const snapshot = JSON.parse(fs.readFileSync(`${repoRoot}/sql/diagnostics/k2/2026-08-10-k2-snapshot-37f7157a.json`,'utf8'));
function psql(query){
  return execSync(`psql "${pooler}" -t -A -F '|' -c "${query.replace(/"/g,'\\\"')}"`, {encoding:'utf8'}).trim();
}
const diffs = {};
for (const table of Object.keys(snapshot.rows)){
  diffs[table] = [];
  const rows = snapshot.rows[table];
  for (const row of rows){
    const id = row.id;
    const cols = Object.keys(row).filter(c=>c !== 'id');
    const sel = cols.map(c=>`COALESCE(${c}::text,'<NULL>')`).join(',');
    const q = `SELECT ${sel} FROM public.${table} WHERE id='${id}'`;
    try{
      const out = psql(q);
      if (!out){
        diffs[table].push({id, status:'MISSING'});
        continue;
      }
      const values = out.split('\n')[0].split('|');
      const mismatches = [];
      for (let i=0;i<cols.length;i++){
        const expected = row[cols[i]] === null ? '<NULL>' : String(row[cols[i]]);
        const actual = values[i] === '' ? '<NULL>' : values[i];
        if (expected !== actual){
          mismatches.push({column:cols[i], expected, actual});
        }
      }
      if (mismatches.length) diffs[table].push({id, mismatches});
    }catch(e){
      diffs[table].push({id, error: String(e)});
    }
  }
}
console.log(JSON.stringify(diffs,null,2));
