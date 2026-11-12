import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { formatNegativeScheduleBalance } from './negative-hour-balance.ts';

test('muestra solo los saldos negativos con las horas exactas', () => {
    assert.equal(formatNegativeScheduleBalance(-23), '-23 h');
    assert.equal(formatNegativeScheduleBalance(-1.5), '-1,5 h');
    assert.equal(formatNegativeScheduleBalance(-0.25), '-0,25 h');
    assert.equal(formatNegativeScheduleBalance(-0.001), null);
    assert.equal(formatNegativeScheduleBalance(0), null);
    assert.equal(formatNegativeScheduleBalance(-0), null);
    assert.equal(formatNegativeScheduleBalance(2), null);
    assert.equal(formatNegativeScheduleBalance(null), null);
    assert.equal(formatNegativeScheduleBalance(Number.NaN), null);
});

test('editor: nombre seguido del saldo rojo; fuente cerrada y acceso de manager', () => {
    const editor = readFileSync(join(process.cwd(), 'src/components/schedule/ScheduleDayEditor.tsx'), 'utf8');
    const action = readFileSync(join(process.cwd(), 'src/app/actions/schedule-negative-balances.ts'), 'utf8');
    assert.match(editor, /formatNegativeScheduleBalance\(negativeBalances\[shift\.employeeId\]\)/);
    assert.match(editor, /text-red-600/);
    assert.match(editor, /data-element="employee-name"/);
    assert.match(action, /weekly_snapshots/);
    assert.match(action, /\.select\('final_balance'\)/);
    assert.match(action, /\.lt\('week_end', todayMadrid\)/);
    assert.match(action, /actor\?\.role !== 'manager'/);
    assert.match(action, /MASTER_VIEW_AS_COOKIE/);
});
