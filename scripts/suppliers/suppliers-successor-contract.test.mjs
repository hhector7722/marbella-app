import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const successorPath = path.join(
    root,
    'supabase/migrations/20260914210304_suppliers_normalize_operational_fields.sql'
);
const legacyCategoryBackfillPath = path.join(
    root,
    'supabase/migrations/20260914211044_suppliers_backfill_legacy_category.sql'
);
const historicalActivePath = path.join(
    root,
    'supabase/migrations/20260908150000_suppliers_add_fields.sql'
);
const historicalArchivePath = path.join(
    root,
    'supabase/historical-migrations/20260908150000_suppliers_add_fields.sql'
);
const supplierPagePath = path.join(root, 'src/app/suppliers/page.tsx');

test('la sucesora conserva los literales operativos y hace segura reliability', () => {
    const sql = fs.readFileSync(successorPath, 'utf8');

    assert.match(sql, /^BEGIN;/m);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS order_deadline text/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS min_order text/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS reliability_score smallint GENERATED ALWAYS AS/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS reliability_review_required boolean GENERATED ALWAYS AS/);
    assert.match(sql, /NULLIF\(btrim\(reliability\), ''\) ~ '\^\[1-5\]\$'/);
    assert.match(sql, /UPDATE public\.suppliers AS supplier/);
    assert.match(sql, /COMMIT;/);
    assert.doesNotMatch(sql, /ALTER COLUMN reliability TYPE/i);
    assert.doesNotMatch(sql, /SET\s+notes\s*=/i);
});

test('el SQL histórico queda conservado pero fuera del ejecutor', () => {
    assert.equal(fs.existsSync(historicalActivePath), false);
    assert.equal(fs.existsSync(historicalArchivePath), true);
    const archivedSha256 = crypto
        .createHash('sha256')
        .update(fs.readFileSync(historicalArchivePath))
        .digest('hex');
    assert.equal(archivedSha256, 'c9be8cd831fb7fbe8ecf3695b037eef1bca0e4697f94ce79fe8060bdb6997657');
});

test('la corrección eleva la categoría no JSON sin tocar su nota', () => {
    const sql = fs.readFileSync(legacyCategoryBackfillPath, 'utf8');

    assert.match(sql, /^BEGIN;/m);
    assert.match(sql, /SET category = COALESCE/);
    assert.match(sql, /\$legacy_category\$/);
    assert.doesNotMatch(sql, /SET\s+notes\s*=/i);
    assert.match(sql, /COMMIT;/);
});

test('la interfaz no reduce ni reescribe los datos legado en el esquema sucesor', () => {
    const page = fs.readFileSync(supplierPagePath, 'utf8');

    assert.match(page, /const orderDeadlineValue = editOrderDeadline\.trim\(\) \|\| null;/);
    assert.match(page, /const minOrderValue = editMinOrder\.trim\(\) \|\| null;/);
    assert.match(page, /reliabilityScoreFromLiteral/);
    assert.match(page, /notes: null,/);
    assert.match(page, /notes: legacyNotes,/);
    assert.doesNotMatch(page, /parseInt\(String\(editSupplier\.reliability\)\.replace/);
});
