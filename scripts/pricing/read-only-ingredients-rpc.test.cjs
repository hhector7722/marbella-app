/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260920132212_make_gestionar_ingredientes_read_only.sql'),
  'utf8',
)

test('gestionar_ingredientes queda limitado a lectura', () => {
  assert.match(migration, /SECURITY INVOKER/)
  assert.match(migration, /STABLE/)
  assert.match(migration, /p_accion NOT IN \('buscar', 'listar', 'consultar'\)/)
  assert.doesNotMatch(migration, /INSERT INTO|UPDATE public\.ingredients|DELETE FROM/i)
})

test('la RPC no queda expuesta a anon ni PUBLIC', () => {
  assert.match(migration, /REVOKE ALL[\s\S]+FROM PUBLIC, anon/)
  assert.match(migration, /GRANT EXECUTE[\s\S]+TO authenticated, service_role/)
})
