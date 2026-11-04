import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EMPTY_DISPATCHED_WEEK_ROW,
  formatDispatchedWeekNotice,
  readDispatchedWeekRow,
} from './order-dispatched-week.ts';

describe('aviso de pedido semanal por proveedor', () => {
  const now = new Date('2026-11-04T12:00:00.000Z'); // miércoles, Barcelona

  it('avisa de un pedido tramitado hoy con su autor', () => {
    const row = readDispatchedWeekRow([{
      dispatched: true,
      first_name: '  Juan ',
      dispatched_at: '2026-11-04T07:30:00.000Z',
    }]);
    assert.equal(formatDispatchedWeekNotice(row, now), 'Hoy se ha tramitado un pedido (Juan).');
  });

  it('indica el día si el pedido fue el lunes de la misma semana', () => {
    const row = readDispatchedWeekRow([{
      dispatched: true,
      first_name: 'Pere',
      dispatched_at: '2026-11-02T11:30:00.000Z',
    }]);
    assert.equal(formatDispatchedWeekNotice(row, now), 'El lunes se tramitó un pedido (Pere).');
  });

  it('da el día en castellano y muestra el nombre si fue domingo', () => {
    const row = readDispatchedWeekRow([{
      dispatched: true,
      first_name: 'Alba',
      dispatched_at: '2026-11-08T17:30:00.000Z',
    }]);
    assert.equal(formatDispatchedWeekNotice(row, now), 'El domingo se tramitó un pedido (Alba).');
  });

  it('compara el día civil en Barcelona, no el UTC del navegador', () => {
    const nowNextDay = new Date('2026-11-04T23:30:00.000Z'); // jueves 00:30 Madrid
    const row = readDispatchedWeekRow([{
      dispatched: true,
      first_name: 'Héctor',
      dispatched_at: '2026-11-04T23:10:00.000Z',
    }]);
    assert.equal(formatDispatchedWeekNotice(row, nowNextDay), 'Hoy se ha tramitado un pedido (Héctor).');
  });

  it('si fue ayer indica Ayer y el nombre del usuario', () => {
    const row = readDispatchedWeekRow([{
      dispatched: true,
      first_name: 'Alba',
      dispatched_at: '2026-11-03T10:30:00.000Z',
    }]);
    assert.equal(formatDispatchedWeekNotice(row, now), 'Ayer se tramitó un pedido (Alba).');
  });

  it('sin autor indica Ayer y no imprime paréntesis vacíos', () => {
    const row = readDispatchedWeekRow([{
      dispatched: true,
      first_name: null,
      dispatched_at: '2026-11-03T10:30:00.000Z',
    }]);
    assert.equal(formatDispatchedWeekNotice(row, now), 'Ayer se tramitó un pedido.');
  });

  it('detecta ayer al cambiar de mes y cruzar la medianoche de Barcelona', () => {
    const row = readDispatchedWeekRow([{
      dispatched: true,
      first_name: 'Pere',
      dispatched_at: '2026-06-30T21:45:00.000Z', // 23:45 en Barcelona
    }]);
    const nextDay = new Date('2026-06-30T22:15:00.000Z'); // 00:15 del 1 de julio
    assert.equal(formatDispatchedWeekNotice(row, nextDay), 'Ayer se tramitó un pedido (Pere).');
  });

  it('compara días civiles incluso en el cambio de horario de verano', () => {
    const row = readDispatchedWeekRow([{
      dispatched: true,
      first_name: 'Juan',
      dispatched_at: '2026-03-28T23:30:00.000Z', // domingo 00:30 en Barcelona
    }]);
    const nextDay = new Date('2026-03-29T22:30:00.000Z'); // lunes 00:30 en Barcelona
    assert.equal(formatDispatchedWeekNotice(row, nextDay), 'Ayer se tramitó un pedido (Juan).');
  });

  it('resultado vacío no señala falsamente que haya pedido', () => {
    assert.deepEqual(readDispatchedWeekRow([]), EMPTY_DISPATCHED_WEEK_ROW);
    assert.deepEqual(readDispatchedWeekRow([{ dispatched: false }]), EMPTY_DISPATCHED_WEEK_ROW);
  });
});
