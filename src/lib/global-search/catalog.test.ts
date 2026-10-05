import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { searchFunctions, type SearchIdentity } from './catalog.ts';

const staff: SearchIdentity = { userId: 'staff', role: 'staff', email: 'empleado@example.com', isViewingAs: false };
const manager: SearchIdentity = { ...staff, role: 'manager' };
const master: SearchIdentity = { ...staff, email: 'hhector7722@gmail.com' };

describe('catálogo de búsqueda global', () => {
  it('resuelve alias y prioriza coincidencias exactas', () => {
    assert.equal(searchFunctions('existencias', manager)[0]?.id, 'stock');
    assert.equal(searchFunctions('recuento', staff)[0]?.id, 'inventory');
    assert.equal(searchFunctions('fichajes', staff)[0]?.id, 'attendance');
    assert.equal(searchFunctions('menú', staff)[0]?.id, 'menu');
    assert.equal(searchFunctions('invent', staff)[0]?.id, 'inventory');
    assert.equal(searchFunctions('horas', staff).length, 2);
  });

  it('recorta funciones con la identidad efectiva', () => {
    assert.ok(searchFunctions('stock', staff).every((row) => row.id !== 'stock'));
    assert.equal(searchFunctions('stock', master)[0]?.id, 'stock');
    assert.ok(searchFunctions('stock', { ...master, userId: 'staff', isViewingAs: true }).every((row) => row.id !== 'stock'));
    assert.equal(searchFunctions('personal', manager)[0]?.id, 'team');
    assert.deepEqual(searchFunctions('personal', staff), []);
    assert.equal(searchFunctions('proveedores', staff)[0]?.id, 'suppliers');
    assert.equal(searchFunctions('cierre', staff)[0]?.href, '/staff/dashboard?open=cierre');
    assert.equal(searchFunctions('pedidos', staff)[0]?.href, '/staff/dashboard?open=pedidos');
    assert.deepEqual(searchFunctions('reservas', staff), []);
    assert.equal(searchFunctions('ingredientes', staff)[0]?.id, 'ingredients');
  });
});
