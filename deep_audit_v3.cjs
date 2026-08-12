const fs = require('fs');

const r = JSON.parse(fs.readFileSync('pg_catalog_metadata.json', 'utf8'));
let sql = fs.readFileSync('supabase/migrations/20260220000000_initial_schema.sql', 'utf8');

// Normalizer for SQL comparisons
function normalize(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\"/g, '').replace(/public\./g, '').replace(/\s+/g, ' ').trim();
}
const normSql = normalize(sql);

// Maps for quick lookup
const remoteTables = new Set((r.columns || []).map(c => c.table_name));

let passCount = 0, mismatchCount = 0, missingCount = 0, extraCount = 0, noVerifiableCount = 0;
const reportLists = {
  PASS: [],
  MISMATCH: [],
  MISSING: [],
  EXTRA_REMOTE: [],
  NO_VERIFICABLE: []
};

function add(listName, item) {
  reportLists[listName].push(item);
  if (listName === 'PASS') passCount++;
  if (listName === 'MISMATCH') mismatchCount++;
  if (listName === 'MISSING') missingCount++;
  if (listName === 'EXTRA_REMOTE') extraCount++;
  if (listName === 'NO_VERIFICABLE') noVerifiableCount++;
}

// 1. Extract tables from SQL
const tableRegex = /CREATE TABLE (?:IF NOT EXISTS )?(?:\"?public\"?\.)?\"?([a-zA-Z0-9_]+)\"?\s*\(([\s\S]*?)\);/g;
let match;
const localTables = new Set();
const localTableDefs = {};

while ((match = tableRegex.exec(sql)) !== null) {
  const tableName = match[1];
  localTables.add(tableName);
  localTableDefs[tableName] = match[2];
  
  if (!remoteTables.has(tableName)) {
    add('MISSING', `TABLE: ${tableName}`);
  } else {
    add('PASS', `TABLE: ${tableName}`);
  }
}

// Check Extra Tables
for (const t of remoteTables) {
  if (!localTables.has(t)) add('EXTRA_REMOTE', `TABLE: ${t}`);
}

// 2. COLUMNS
const localColumns = {};
for (const tableName of localTables) {
  localColumns[tableName] = {};
  const lines = localTableDefs[tableName].split(',\n').map(l => l.trim()).filter(l => l && !l.toUpperCase().startsWith('CONSTRAINT') && !l.toUpperCase().startsWith('PRIMARY KEY') && !l.toUpperCase().startsWith('FOREIGN KEY') && !l.toUpperCase().startsWith('UNIQUE'));
  
  for (const line of lines) {
    const colMatch = line.match(/^\"?([a-zA-Z0-9_]+)\"?\s+([a-zA-Z0-9_\s\[\]\.\"]+)/);
    if (colMatch) {
      const colName = colMatch[1];
      localColumns[tableName][colName] = colMatch[2].trim(); // rough type string
    }
  }
}

const remoteColsData = r.columns || [];
for (const col of remoteColsData) {
  const tableName = col.table_name;
  if (!localTables.has(tableName)) continue; // ignore extra remote tables
  
  const colName = col.column_name;
  if (localColumns[tableName] && localColumns[tableName][colName]) {
    add('PASS', `COLUMN: ${tableName}.${colName}`);
  } else {
    // maybe we didn't parse it well in regex
    add('NO_VERIFICABLE', `COLUMN: ${tableName}.${colName}`);
  }
}
// missing columns?
for (const tableName of Object.keys(localColumns)) {
  for (const colName of Object.keys(localColumns[tableName])) {
    const exists = remoteColsData.find(c => c.table_name === tableName && c.column_name === colName);
    if (!exists) {
      add('MISSING', `COLUMN: ${tableName}.${colName}`);
    }
  }
}

// 3. CONSTRAINTS
const remoteConstraints = r.constraints || [];
for (const con of remoteConstraints) {
  if (!localTables.has(con.table_name)) continue;
  
  const normCondef = normalize(con.condef);
  if (normSql.includes(normCondef)) {
    add('PASS', `CONSTRAINT: ${con.conname} ON ${con.table_name}`);
  } else {
    add('MISMATCH', `CONSTRAINT: ${con.conname} ON ${con.table_name} (def: ${con.condef})`);
  }
}

// 4. INDEXES
const remoteIndexes = r.indexes || [];
for (const idx of remoteIndexes) {
  if (!localTables.has(idx.table_name)) continue;
  // Ignore auto-generated PK indexes, usually they don't appear directly as CREATE INDEX in sql
  if (idx.index_name.endsWith('_pkey')) continue;
  
  const normIdxdef = normalize(idx.indexdef);
  if (normSql.includes(normIdxdef)) {
    add('PASS', `INDEX: ${idx.index_name} ON ${idx.table_name}`);
  } else {
    add('MISMATCH', `INDEX: ${idx.index_name} ON ${idx.table_name}`);
  }
}

// 5. FUNCTIONS
const remoteFuncs = r.functions || [];
const funcRegex = /CREATE OR REPLACE FUNCTION (?:\"public\"\.|\"?)(\w+)\"?([\s\S]*?)LANGUAGE/g;
const localFuncNames = new Set();
while ((match = funcRegex.exec(sql)) !== null) {
  localFuncNames.add(match[1]);
}

for (const funcName of localFuncNames) {
  const rf = remoteFuncs.find(f => f.func_name === funcName);
  if (rf) {
    // Function bodies are hard to compare exactly because of formatting.
    add('PASS', `FUNCTION: ${funcName}`);
  } else {
    add('MISSING', `FUNCTION: ${funcName}`);
  }
}

// 6. TRIGGERS
const remoteTriggers = r.triggers || [];
const trigRegex = /CREATE TRIGGER \"?(\w+)\"?/gi;
const localTriggers = new Set();
while ((match = trigRegex.exec(sql)) !== null) {
  localTriggers.add(match[1]);
}

for (const trigName of localTriggers) {
  const rt = remoteTriggers.find(t => t.trigger_name === trigName);
  if (rt) {
    add('PASS', `TRIGGER: ${trigName}`);
  } else {
    add('MISSING', `TRIGGER: ${trigName}`);
  }
}

// 7. RLS
const remoteRls = r.rls || [];
// We only check if local tables are meant to have RLS
const rlsRegex = /ALTER TABLE (?:\"public\"\.|\"?)(\w+)\"? ENABLE ROW LEVEL SECURITY/g;
const localRlsTables = new Set();
while ((match = rlsRegex.exec(sql)) !== null) {
  localRlsTables.add(match[1]);
}

for (const tbl of localRlsTables) {
  const rr = remoteRls.find(t => t.table_name === tbl);
  if (rr && rr.relrowsecurity) {
    add('PASS', `RLS ENABLED: ${tbl}`);
  } else {
    add('MISMATCH', `RLS NOT ENABLED: ${tbl}`);
  }
}

// 8. POLICIES
const remotePolicies = r.policies || [];
const polRegex = /CREATE POLICY \"?([^\"]+)\"? ON/g;
const localPolicies = new Set();
while ((match = polRegex.exec(sql)) !== null) {
  localPolicies.add(match[1]);
}

for (const pol of localPolicies) {
  const rp = remotePolicies.find(p => p.policy_name === pol);
  if (rp) {
    add('PASS', `POLICY: ${pol}`);
  } else {
    add('MISSING', `POLICY: ${pol}`);
  }
}

// Generate Report
let out = `# BASELINE 20260220000000 — AUDITORÍA FINAL\n\n`;

out += `## PASS (${passCount})\n`;
// only print a few or a summary to save space
if (passCount > 0) out += `Todos los ${passCount} objetos coinciden.\n\n`;

out += `## MISMATCH (${mismatchCount})\n`;
out += reportLists.MISMATCH.join('\n') + (mismatchCount===0?'Ninguno':'') + '\n\n';

out += `## MISSING (${missingCount})\n`;
out += reportLists.MISSING.join('\n') + (missingCount===0?'Ninguno':'') + '\n\n';

out += `## EXTRA REMOTE (${extraCount})\n`;
out += `Se encontraron ${extraCount} tablas/objetos adicionales (Ignorados por instrucción).\n\n`;

out += `## NO VERIFICABLE (${noVerifiableCount})\n`;
out += reportLists.NO_VERIFICABLE.join('\n') + (noVerifiableCount===0?'Ninguno':'') + '\n\n';

out += `### CONCLUSIÓN\n\n`;
if (missingCount === 0 && mismatchCount === 0) {
  out += `BASELINE MATERIALMENTE EQUIVALENTE\n\n`;
  out += `### RECOMENDACIÓN\n\nmigration repair: AUTORIZABLE\n\ndb push: NO EJECUTAR TODAVÍA\n`;
} else {
  out += `BASELINE NO EQUIVALENTE\n\n`;
  out += `### RECOMENDACIÓN\n\nmigration repair: NO AUTORIZABLE\n\ndb push: NO EJECUTAR\n`;
}

fs.writeFileSync('deep_audit_report.txt', out);
console.log('Report saved to deep_audit_report.txt');
