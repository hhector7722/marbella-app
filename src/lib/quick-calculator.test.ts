import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INITIAL_CALC, pressCalcKey, type CalcState } from './quick-calculator.ts';

function tap(keys: string[], start: CalcState = INITIAL_CALC): CalcState {
    let state = start;
    for (const key of keys) {
        state = pressCalcKey(state, key).state;
    }
    return state;
}

function shown(keys: string[]): string {
    return tap(keys).display;
}

describe('calculadora al estilo iOS', () => {
    it('no resuelve la operación hasta pulsar igual', () => {
        assert.equal(shown(['2', '+', '3']), '3');
        assert.equal(shown(['2', '+', '3', '=']), '5');
    });

    it('el siguiente operador resuelve la operación pendiente', () => {
        assert.equal(shown(['2', '+', '3', '+']), '5');
        assert.equal(shown(['2', '+', '3', '+', '4', '=']), '9');
    });

    it('otro operador sin número nuevo solo sustituye el pendiente', () => {
        assert.equal(shown(['2', '+', '-']), '2');
        assert.equal(tap(['2', '+', '-']).pendingOp, '−');
        assert.equal(shown(['2', '+', '-', '3', '=']), '−1');
    });

    it('igual repetido repite la última operación', () => {
        assert.equal(shown(['5', '+', '3', '=', '=']), '11');
    });

    it('igual justo después del operador usa el primer número dos veces', () => {
        assert.equal(shown(['5', '+', '=']), '10');
        assert.equal(shown(['5', '+', '=', '=']), '15');
    });

    it('el porcentaje de suma es el tanto por ciento del acumulado', () => {
        assert.equal(shown(['2', '0', '0', '+', '1', '0', '%']), '20');
        assert.equal(shown(['2', '0', '0', '+', '1', '0', '%', '=']), '220');
    });

    it('el porcentaje de multiplicación divide el número en curso', () => {
        assert.equal(shown(['2', '0', '0', '×', '5', '0', '%']), '0,5');
        assert.equal(shown(['2', '0', '0', '×', '5', '0', '%', '=']), '100');
    });

    it('el porcentaje sin operación divide entre cien', () => {
        assert.equal(shown(['5', '0', '%']), '0,5');
    });

    it('cambia el signo del número en curso', () => {
        assert.equal(shown(['8', '±']), '−8');
        assert.equal(shown(['8', '±', '±']), '8');
    });

    it('dividir entre cero muestra Error y un dígito empieza de cero', () => {
        assert.equal(shown(['1', '0', '÷', '0', '=']), 'Error');
        assert.equal(shown(['1', '0', '÷', '0', '=', '1']), '1');
    });

    it('AC borra todo y el cero inicial no se acumula', () => {
        assert.equal(shown(['1', '2', 'AC']), '0');
        assert.equal(shown(['0', '5']), '5');
    });

    it('la coma no se duplica y tras un operador empieza en 0,', () => {
        assert.equal(shown(['1', ',', ',']), '1,');
        assert.equal(shown(['2', '+', ',']), '0,');
    });

    it('el retroceso borra el número en curso y no calcula', () => {
        assert.equal(pressCalcKey(tap(['1', '2']), 'back').state.display, '1');
        assert.equal(pressCalcKey(tap(['2', '+']), 'back').state.display, '2');
    });

    it('un dígito después del igual empieza un número nuevo', () => {
        assert.equal(shown(['2', '+', '3', '=', '4']), '4');
    });
});
