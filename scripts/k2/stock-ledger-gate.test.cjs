/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const migration = read('supabase/migrations/20260915104444_close_direct_stock_write_bypass.sql')
const copilotActions = read('src/lib/copilot/actions.ts')
const copilotPermissions = read('src/lib/copilot/permissions.ts')
const copilotRuntime = read('src/lib/copilot/tool-runtime.ts')
const inventoryActions = read('src/app/dashboard/inventory/actions.ts')
const wasteActions = read('src/app/dashboard/inventory/waste/actions.ts')
const receiptActions = read('src/app/dashboard/albaranes/receipt-actions.ts')

test('P0 bloquea toda actualización directa del caché legado y elimina actualizar_stock', () => {
  assert.match(migration, /CREATE TRIGGER ingredients_stock_current_ledger_only/)
  assert.match(migration, /BEFORE UPDATE OF stock_current ON public\.ingredients/)
  assert.match(migration, /pg_trigger_depth\(\) < 2/)
  assert.match(migration, /DROP FUNCTION IF EXISTS public\.actualizar_stock/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.actualizar_stock/)
})

test('P0 restringe la tabla a comandos y mantiene los productores legítimos explícitos', () => {
  assert.match(migration, /REVOKE INSERT ON TABLE public\.stock_movements FROM authenticated, service_role/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.record_stock_adjustment/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.record_inventory_count_movements/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.record_waste_movements/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.process_ticket_stock_deduction/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.revert_ticket_stock_deduction/)
  assert.match(migration, /SECURITY DEFINER/)
  assert.match(migration, /ON CONFLICT \(idempotency_key\)/)
  assert.match(migration, /'manual_adjustment'::public\.stock_reference_type/)
  assert.match(migration, /'inventory_count'::public\.stock_reference_type/)
  assert.match(migration, /'waste_entry'::public\.stock_reference_type/)
  assert.match(migration, /'sale_ticket'::public\.stock_reference_type/)
})

test('Copilot produce un ADJUSTMENT idempotente y solo manager/admin pueden solicitarlo', () => {
  assert.match(copilotActions, /rpc: "record_stock_adjustment"/)
  assert.match(copilotActions, /p_quantity_base/)
  assert.match(copilotActions, /p_reason/)
  assert.match(copilotRuntime, /p_idempotency_key/)
  assert.match(copilotRuntime, /copilot:\$\{userId\}:\$\{commandId\}/)
  assert.doesNotMatch(copilotPermissions, /SUPERVISOR_ACTIONS[\s\S]*"actualizar_stock"/)
  assert.doesNotMatch(copilotPermissions, /staff:\s*\[[\s\S]*?"actualizar_stock"/)
})

test('merma y recuento ya no escriben la tabla desde el cliente genérico', () => {
  assert.match(inventoryActions, /rpc\('record_inventory_count_movements'/)
  assert.match(wasteActions, /rpc\('record_waste_movements'/)
  assert.doesNotMatch(inventoryActions, /from\('stock_movements'\)\.insert/)
  assert.doesNotMatch(wasteActions, /from\('stock_movements'\)\.insert/)
})

test('K4 conserva el único comando económico y no quedan sincronizadores de precio legacy', () => {
  assert.match(receiptActions, /rpc\('apply_receipt_line'/)
  const actions = read('src/app/dashboard/albaranes/actions.ts')
  assert.doesNotMatch(actions, /buildIngredientPriceOnlyPatch|resyncIngredientPriceForMappedLine/)
})
