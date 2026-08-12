const fs = require('fs');

const localFiles = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql'));
const localTimestamps = localFiles.map(f => f.split('_')[0]).filter(t => t && t.length === 14);

let remoteData;
try {
  remoteData = JSON.parse(fs.readFileSync('remote_schema_migrations.json', 'utf8'));
} catch (e) {
  console.error("No remote data found, exiting...");
  process.exit(1);
}

// Extract timestamps from the nested array structure
const remoteTimestamps = remoteData.rows[0].rows.map(r => r.version);

const localSet = new Set(localTimestamps);
const remoteSet = new Set(remoteTimestamps);

const both = [];
const localOnly = [];
const remoteOnly = [];

for (const t of localTimestamps) {
  if (remoteSet.has(t)) both.push(t);
  else localOnly.push(t);
}

for (const t of remoteTimestamps) {
  if (!localSet.has(t)) remoteOnly.push(t);
}

both.sort();
localOnly.sort();
remoteOnly.sort();
localTimestamps.sort();
remoteTimestamps.sort();

let report = `# MIGRATION HISTORY AUDIT\n\n`;

report += `## Local\nTotal: ${localTimestamps.length} migraciones.\n`;
report += `Última local: ${localTimestamps[localTimestamps.length - 1]}\n\n`;

report += `## Remote\nTotal: ${remoteTimestamps.length} migraciones.\n`;
report += `Última remota: ${remoteTimestamps[remoteTimestamps.length - 1]}\n\n`;

report += `## Coincidencias\nTotal: ${both.length}\n`;
report += `Última coincidencia: ${both.length > 0 ? both[both.length - 1] : 'Ninguno'}\n\n`;

report += `## LOCAL_ONLY (${localOnly.length})\n`;
localOnly.forEach(t => {
  const file = localFiles.find(f => f.startsWith(t));
  report += `- ${file}\n`;
});
report += `\n`;

report += `## REMOTE_ONLY (${remoteOnly.length})\n`;
remoteOnly.forEach(t => {
  report += `- ${t}\n`;
});
report += `\n`;

report += `## Último punto común\n`;
const lastCommon = both.length > 0 ? both[both.length - 1] : 'Ninguno';
report += `${lastCommon}\n\n`;

report += `## Primera divergencia\n`;
if (localOnly.length > 0 && remoteOnly.length > 0) {
  report += `Local diverge en: ${localOnly[0]}\nRemote diverge en: ${remoteOnly[0]}\n\n`;
} else if (localOnly.length > 0) {
  report += `Local diverge (ahead) en: ${localOnly[0]}\n\n`;
} else if (remoteOnly.length > 0) {
  report += `Remote diverge (ahead) en: ${remoteOnly[0]}\n\n`;
} else {
  report += `Ninguna divergencia.\n\n`;
}

report += `## Evidence migrations\n`;
report += `- 20260812012400_create_document_evidence_layer.sql: ${localSet.has('20260812012400') ? (remoteSet.has('20260812012400') ? 'APPLIED' : 'PENDING') : 'NOT FOUND LOCAL'}\n`;
report += `- 20260812020000_rpc_persist_document_evidence.sql: ${localSet.has('20260812020000') ? (remoteSet.has('20260812020000') ? 'APPLIED' : 'PENDING') : 'NOT FOUND LOCAL'}\n\n`;

report += `## Causa de la divergencia\n`;
report += `El baseline inicial \`20260220000000\` NO ESTÁ REGISTRADO en \`supabase_migrations.schema_migrations\`. 
Al no estar registrado el baseline inicial, el CLI local (que contiene el baseline original) diverge inmediatamente al comparar historiales con la base de datos remota. 
Todas las migraciones posteriores sí están sincronizadas y aplicadas remotamente, coincidiendo 1:1. Esto suele ocurrir cuando el entorno de producción se levanta inicialmente sin pasar por la migración formal de CLI, y el registro comienza a contarse en la segunda migración.\n\n`;

report += `## Opciones técnicamente posibles\n\n`;

report += `### A) Aplicar únicamente las dos migraciones de Evidence (Vía API SQL crudo)\n`;
report += `- **Riesgo:** Bajo a corto plazo, pero no soluciona el problema de \`db push\` a futuro.\n`;
report += `- **Qué modifica:** Crea la nueva capa de evidencia. \n`;
report += `- **Qué NO modifica:** El historial \`schema_migrations\`, por lo que el CLI seguirá detectando divergencia.\n`;
report += `- **Impacto en producción:** Añade la capa de evidencia y hace que el Visor funcione. Cero downtime.\n\n`;

report += `### B) Crear una migración de reconciliación (Baseline Snapshot)\n`;
report += `- **Riesgo:** Alto (involucra un \`squash\` de todo el esquema local y forzar a producción a adoptar ese historial, o recrear la bd).\n`;
report += `- **Qué modifica:** El historial de migraciones.\n`;
report += `- **Qué NO modifica:** Datos existentes.\n`;
report += `- **Impacto en producción:** Muy peligroso sin downtime y validación profunda, ya comprobamos que hay divergencias estructurales entre lo local y producción.\n\n`;

report += `### C) Sincronizar hacia abajo (Pull production to Local)\n`;
report += `- **Riesgo:** Moderado.\n`;
report += `- **Qué modifica:** Sobreescribe el \`20260220000000_initial_schema.sql\` local y todos los demás usando un volcado del esquema actual.\n`;
report += `- **Qué NO modifica:** Producción.\n`;
report += `- **Impacto en producción:** Cero, pero reconstruye el repositorio local para que sea una copia exacta de producción.\n\n`;

report += `### D) Insertar el baseline faltante manualmente en el historial remoto (migration repair)\n`;
report += `- **Riesgo:** Moderado-Bajo. La CLI solo hará un \`INSERT\` en la tabla \`schema_migrations\`.\n`;
report += `- **Qué modifica:** Solamente inserta la fila \`20260220000000\` en la tabla \`schema_migrations\` remota.\n`;
report += `- **Qué NO modifica:** Esquema ni datos.\n`;
report += `- **Impacto en producción:** Cero. Soluciona la divergencia para el CLI, permitiendo hacer \`db push\`. Sin embargo, ignorará las diferencias estructurales subyacentes entre el archivo SQL local y el schema remoto real (detectadas en el deep audit).\n\n`;

report += `## RECOMENDACIÓN\n\n`;
report += `**La Opción D es la más pragmática.** Pese a que \`20260220000000_initial_schema.sql\` no coincida 100% byte-a-byte con la realidad remota (p.ej. le falta \`order_drafts.user_id\`), este archivo representa el génesis histórico. Si insertas ese timestamp en \`schema_migrations\` usando \`npx supabase migration repair --status applied 20260220000000\`, alinearás el historial para el CLI. Esto habilitará que Supabase reconozca que TODAS las migraciones locales antiguas están "aplicadas", y procederá limpiamente a empujar (\`db push\`) **únicamente** las dos migraciones nuevas de Evidence.\n`;

fs.writeFileSync('migration_history_audit.md', report);
console.log('Saved to migration_history_audit.md');
