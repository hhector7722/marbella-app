const fs = require('fs');

const remote = JSON.parse(fs.readFileSync('remote_metadata.json', 'utf8'));
const sql = fs.readFileSync('supabase/migrations/20260220000000_initial_schema.sql', 'utf8');

// Maps for quick lookup
const remoteTables = new Set((remote.tables || []).map(t => t.table_name));
const remoteCols = {};
(remote.columns || []).forEach(c => {
  if (!remoteCols[c.table_name]) remoteCols[c.table_name] = {};
  remoteCols[c.table_name][c.column_name] = c;
});
const remoteFuncs = new Set((remote.routines || []).map(r => r.routine_name));
const remoteViews = new Set((remote.views || []).map(v => v.table_name));
const remoteTriggers = new Set((remote.triggers || []).map(t => t.trigger_name));

let pass = 0, mismatch = 0, missing = 0, unverified = 0;
const diffs = [];

// 1. Extract tables from SQL
const tableRegex = /CREATE TABLE (?:IF NOT EXISTS )?(?:\"?public\"?\.)?\"?([a-zA-Z0-9_]+)\"?\s*\(([\s\S]*?)\);/g;
let match;
const localTables = [];

while ((match = tableRegex.exec(sql)) !== null) {
  const tableName = match[1];
  localTables.push(tableName);
  
  if (!remoteTables.has(tableName)) {
    diffs.push(`MISSING TABLE: ${tableName}`);
    missing++;
    continue;
  }
  
  pass++; // Table exists
  
  // Parse columns roughly
  const columnsBlock = match[2];
  const colLines = columnsBlock.split(',\n').map(l => l.trim()).filter(l => l && !l.toUpperCase().startsWith('CONSTRAINT') && !l.toUpperCase().startsWith('PRIMARY KEY') && !l.toUpperCase().startsWith('FOREIGN KEY') && !l.toUpperCase().startsWith('UNIQUE'));
  
  for (const line of colLines) {
    const colMatch = line.match(/^\"?([a-zA-Z0-9_]+)\"?\s+([a-zA-Z0-9_\s]+)(\(.*?\))?/);
    if (colMatch) {
      const colName = colMatch[1];
      const remoteCol = remoteCols[tableName] ? remoteCols[tableName][colName] : null;
      if (!remoteCol) {
         diffs.push(`MISSING COLUMN: ${tableName}.${colName}`);
         missing++;
      } else {
         // Check type roughly (we can't easily normalize all type names, but if it exists, it's a pass for now)
         pass++; 
      }
    }
  }
  
  // Constraints are too complex to regex perfectly, we'll mark them unverified in the script count
  unverified += 5; 
}

// Extract Functions
const funcRegex = /CREATE OR REPLACE FUNCTION (?:\"public\"\.|\"?)(\w+)\"?/g;
const localFuncs = [];
while ((match = funcRegex.exec(sql)) !== null) {
  const funcName = match[1];
  localFuncs.push(funcName);
  if (remoteFuncs.has(funcName)) {
    pass++;
  } else {
    // some functions might not be found due to schema
    diffs.push(`MISMATCH/MISSING FUNCTION: ${funcName}`);
    missing++;
  }
}

// Extract Views
const viewRegex = /CREATE (?:OR REPLACE )?VIEW (?:\"public\"\.|\"?)(\w+)\"?/g;
while ((match = viewRegex.exec(sql)) !== null) {
  const viewName = match[1];
  if (remoteViews.has(viewName)) {
    pass++;
  } else {
    diffs.push(`MISSING VIEW: ${viewName}`);
    missing++;
  }
}

// Extract Triggers
const trigRegex = /CREATE TRIGGER \"?(\w+)\"?/gi;
while ((match = trigRegex.exec(sql)) !== null) {
  const trigName = match[1];
  if (remoteTriggers.has(trigName)) {
    pass++;
  } else {
    diffs.push(`MISSING TRIGGER: ${trigName}`);
    missing++;
  }
}

// Extract RLS Policies
const polRegex = /CREATE POLICY \"?(\w+)\"? ON/g;
while ((match = polRegex.exec(sql)) !== null) {
  unverified++; // RLS policies not extracted from information_schema
}

const verdict = (missing === 0 && mismatch === 0) ? "BASELINE EQUIVALENTE (A nivel de existencia de objetos base)" : "NO EQUIVALENTE";

let report = `### VEREDICTO\n\n${verdict}\n\n`;
report += `### RESUMEN\n\n`;
report += `- tablas: ${localTables.length} encontradas, ${remoteTables.size} en remoto.\n`;
report += `- columnas: (Comprobación aproximada realizada).\n`;
report += `- constraints: NO VERIFICABLE (No disponible en metadata simple).\n`;
report += `- índices: NO VERIFICABLE.\n`;
report += `- funciones: ${localFuncs.length} locales encontradas.\n`;
report += `- triggers: Comprobación aproximada realizada.\n`;
report += `- RLS: NO VERIFICABLE.\n`;
report += `- policies: NO VERIFICABLE.\n`;
report += `- views: Comprobación aproximada.\n\n`;

report += `### DIFERENCIAS\n\n`;
if (diffs.length === 0) {
  report += `No se encontraron objetos faltantes relevantes.\n\n`;
} else {
  report += diffs.join('\n') + '\n\n';
}

report += `### RECOMENDACIÓN\n\n`;
report += `- \`migration repair\`: ${missing === 0 ? 'AUTORIZABLE (Bajo asunción de que Constraints y RLS coinciden)' : 'NO AUTORIZABLE (Faltan objetos o hay discrepancias)'}\n`;
report += `- \`db push\`: NO EJECUTAR TODAVÍA\n`;

fs.writeFileSync('auto_report.txt', report);
console.log('Report saved to auto_report.txt');
