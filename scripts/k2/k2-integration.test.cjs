const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');

const DATABASE_URL = "postgresql://postgres:k2@localhost:5433/postgres";
process.env.DATABASE_URL = DATABASE_URL;
process.env.K2_WRITE_CONFIRMATION = 'K2b';

const { buildK2bSql, buildReleaseSql, runK2b, ALLOWLIST_PATH } = require('./k2-runner.cjs');

function runPsql(sql) {
  fs.writeFileSync('/tmp/psql_tmp.sql', sql);
  return execSync(`psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f /tmp/psql_tmp.sql`, { encoding: 'utf8', stdio: 'pipe' });
}

function fetchRow(table, id) {
  const query = `SELECT purchase_unit, unit_type, unit FROM ${table} WHERE id = '${id}';`;
  fs.writeFileSync('/tmp/psql_fetch.sql', query);
  const out = execSync(`psql "${DATABASE_URL}" -t -c "${query}"`, { encoding: 'utf8' }).trim();
  const parts = out.split('|').map(s => s.trim());
  return { purchase_unit: parts[0], unit_type: parts[1], unit: parts[2] };
}

async function runTests() {
  runPsql("UPDATE private.k2_domain_freezes SET active = false;");
  
  console.log("==========================================");
  console.log("FASE 4 - TEST CAUSAL");
  console.log("==========================================");
  
  const id1 = crypto.randomUUID();
  runPsql(`
    DELETE FROM public.ingredients;
    INSERT INTO private.k2_domain_freezes (domain, active) VALUES ('k2_units', false) ON CONFLICT DO NOTHING;
    DELETE FROM private.k2_execution_runs;
    ALTER TABLE public.ingredients DISABLE TRIGGER ALL;
    INSERT INTO public.ingredients (id, name, purchase_unit, unit_type, current_price) 
    VALUES ('${id1}', 'Test Ing', 'u', 'u', 0.00);
    ALTER TABLE public.ingredients ENABLE TRIGGER ALL;
  `);

  const allowlist4 = [{
    table: 'public.ingredients',
    primary_key_column: 'id',
    primary_key_value: id1,
    column: 'purchase_unit',
    before_value: 'u',
    expected_value: 'ud'
  }, {
    table: 'public.ingredients',
    primary_key_column: 'id',
    primary_key_value: id1,
    column: 'unit_type',
    before_value: 'u',
    expected_value: 'ud'
  }];

  const runId4 = crypto.randomUUID();
  const sql4 = buildK2bSql({ operations: allowlist4, allowlist_checksum: 'test' }, runId4);
  
  try {
    runPsql(sql4);
    const check4 = fetchRow('public.ingredients', id1);
    if (check4.purchase_unit === 'ud' && check4.unit_type === 'ud') {
       console.log("✅ FASE 4 PASS");
    } else {
       console.log("❌ FASE 4 FAIL: valores incorrectos", check4);
       process.exit(1);
    }
  } catch (err) {
    console.log("❌ FASE 4 FAIL: Error SQL", err.stdout || err.stderr);
    process.exit(1);
  } finally {
    try{runPsql(buildReleaseSql(runId4));}catch(e){}
  }

  console.log("\n==========================================");
  console.log("FASE 5 - TEST DRIFT EXTERNO");
  console.log("==========================================");
  
  const id2 = crypto.randomUUID();
  runPsql(`
    ALTER TABLE public.ingredients DISABLE TRIGGER ALL;
    INSERT INTO public.ingredients (id, name, purchase_unit, unit_type, current_price) 
    VALUES ('${id2}', 'Test Drift', 'u', 'kg', 0.00);
    ALTER TABLE public.ingredients ENABLE TRIGGER ALL;
  `);

  const allowlist5 = [{
    table: 'public.ingredients',
    primary_key_column: 'id',
    primary_key_value: id2,
    column: 'purchase_unit',
    before_value: 'u',
    expected_value: 'ud'
  }, {
    table: 'public.ingredients',
    primary_key_column: 'id',
    primary_key_value: id2,
    column: 'unit_type',
    before_value: 'u',
    expected_value: 'ud'
  }];

  const runId5 = crypto.randomUUID();
  const sql5 = buildK2bSql({ operations: allowlist5, allowlist_checksum: 'test' }, runId5);

  try {
    fs.writeFileSync('/tmp/psql_tmp.sql', sql5);
    execSync(`psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f /tmp/psql_tmp.sql`, { encoding: 'utf8', stdio: 'pipe' });
    console.log("❌ FASE 5 FAIL: Debería haber fallado y hecho ROLLBACK");
    process.exit(1);
  } catch (err) {
    const output = err.stdout + err.stderr;
    if (output.includes('K2_BEFORE_CONFLICT')) {
       const check5 = fetchRow('public.ingredients', id2);
       if (check5.purchase_unit === 'u' && check5.unit_type === 'kg') {
          console.log("✅ FASE 5 PASS (K2_BEFORE_CONFLICT capturado y ROLLBACK ejecutado)");
       } else {
          console.log("❌ FASE 5 FAIL: Rollback no restauró el estado");
          process.exit(1);
       }
    } else {
       console.log("❌ FASE 5 FAIL: Falló por motivo incorrecto", output);
       process.exit(1);
    }
  } finally {
    try{runPsql(buildReleaseSql(runId5));}catch(e){}
  }

  console.log("\n==========================================");
  console.log("FASE 6 - TEST COMPLETO 71 OPERACIONES");
  console.log("==========================================");
  
  runPsql(`
    DELETE FROM public.ingredients;
    DELETE FROM public.recipe_ingredients;
  `);
  
  let raw6 = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  const allowlist6 = Array.isArray(raw6) ? { operations: raw6, allowlist_checksum: 'test' } : raw6;
  
  let prepSql = 'ALTER TABLE public.ingredients DISABLE TRIGGER ALL; ALTER TABLE public.recipe_ingredients DISABLE TRIGGER ALL;\n';
  for (const op of allowlist6.operations || allowlist6) {
     if (op.table === 'public.ingredients') {
        prepSql += `
          INSERT INTO public.ingredients (id, name, purchase_unit, unit_type, current_price) VALUES ('${op.primary_key_value}', 'I_${op.primary_key_value}', 'unknown', 'unknown', 0.00) ON CONFLICT DO NOTHING;
          UPDATE public.ingredients SET ${op.column} = '${op.before_value}' WHERE id = '${op.primary_key_value}';
        `;
     } else if (op.table === 'public.recipe_ingredients') {
        prepSql += `
          INSERT INTO public.recipe_ingredients (id, ingredient_id, recipe_id, unit, quantity_gross) VALUES ('${op.primary_key_value}', '${crypto.randomUUID()}', '${crypto.randomUUID()}', 'unknown', 1.0) ON CONFLICT DO NOTHING;
          UPDATE public.recipe_ingredients SET unit = '${op.before_value}' WHERE id = '${op.primary_key_value}';
        `;
     }
  }
  prepSql += '\nALTER TABLE public.ingredients ENABLE TRIGGER ALL; ALTER TABLE public.recipe_ingredients ENABLE TRIGGER ALL;';
  runPsql(prepSql);

  const runId6 = crypto.randomUUID();
  const result6 = await runK2b({
     poolerUrl: DATABASE_URL,
     runId: runId6,
     allowlistPath: ALLOWLIST_PATH,
     execute: true,
     confirmation: true,
     state: {
       r1Pass: true,
       snapshotPass: true,
       dryRunPass: true,
       rollbackPass: true,
       writersControlled: true,
       invariantsPass: true,
       serviceRole: true
     }
  });

  if (result6.status === 'COMMITTED') {
     console.log("✅ FASE 6 PASS (71 operaciones commitidas)");
  } else {
     console.log("❌ FASE 6 FAIL", result6);
     process.exit(1);
  }

  console.log("\n==========================================");
  console.log("FASE 7 - ROLLBACK TEST");
  console.log("==========================================");
  
  let raw7 = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  const allowlist7 = Array.isArray(raw7) ? { operations: raw7, allowlist_checksum: 'test' } : raw7;
  allowlist7.operations[0].expected_value = 'IMPOSSIBLE_VALUE';
  fs.writeFileSync('/tmp/allowlist7.json', JSON.stringify(allowlist7));

  
  
  runPsql(prepSql);
  const runId7 = crypto.randomUUID();

  const sql7 = buildK2bSql({ operations: allowlist7.operations, allowlist_checksum: 'test' }, runId7);
  try {
    fs.writeFileSync('/tmp/psql_tmp.sql', sql7);
    execSync(`psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f /tmp/psql_tmp.sql`, { encoding: 'utf8', stdio: 'pipe' });
    console.log("❌ FASE 7 FAIL: Debería haber fallado en postcondition");
    process.exit(1);
  } catch (err) {
    const output = err.stdout + err.stderr;
    if (output.includes('K2_POSTCONDITION_FAIL')) {
       console.log("✅ FASE 7 PASS (Postcondition fallida aborta la transacción)");
    } else {
       console.log("❌ FASE 7 FAIL: Falló por motivo incorrecto", output);
       process.exit(1);
    }
  } finally {
    try { runPsql(buildReleaseSql(runId7)); } catch(e) {}
  }


  console.log("\n✅ TODAS LAS FASES COMPLETADAS EXITOSAMENTE");
}

runTests().catch(console.error);
