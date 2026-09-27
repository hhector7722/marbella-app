/**
 * Calculadora al estilo iOS (básica).
 * Mientras se escribe, la cinta muestra la operación completa («6×6»).
 * Tras «=», esa cinta queda como referencia y el visor muestra el resultado.
 * El cálculo no se resuelve al teclear el segundo operando: se resuelve al
 * pulsar otro operador o «=».
 */

export type CalcOp = '+' | '−' | '×' | '÷';

export type CalcState = {
    /** Número en curso, o el resultado tras «=». */
    display: string;
    /** Operación completa tal como se enseña: «6×6». */
    tape: string;
    /** Tras «=»: el visor grande es el resultado y la cinta queda encima. */
    evaluated: boolean;
    accumulator: number | null;
    pendingOp: CalcOp | null;
    /** El siguiente dígito sustituye al número en curso (tras un operador o «=»). */
    waiting: boolean;
    repeatOp: CalcOp | null;
    repeatOperand: number | null;
    error: boolean;
};

export type CalcCommit = { expression: string; result: string };

export const INITIAL_CALC: CalcState = {
    display: '0',
    tape: '',
    evaluated: false,
    accumulator: null,
    pendingOp: null,
    waiting: false,
    repeatOp: null,
    repeatOperand: null,
    error: false,
};

const OPS = new Set<CalcOp>(['+', '−', '×', '÷']);

export function formatCalcNumber(n: number): string {
    if (!Number.isFinite(n)) return 'Error';
    const rounded = Math.abs(n - Math.round(n)) < 1e-10 ? Math.round(n) : Number(n.toFixed(10));
    if (Object.is(rounded, -0)) return '0';
    const text = String(rounded).replace('.', ',');
    return text.startsWith('-') ? `−${text.slice(1)}` : text;
}

function parseDisplay(display: string): number {
    const n = Number(display.replace(',', '.').replace('−', '-'));
    return Number.isFinite(n) ? n : 0;
}

function compute(a: number, b: number, op: CalcOp): number | null {
    if (op === '+') return a + b;
    if (op === '−') return a - b;
    if (op === '×') return a * b;
    if (b === 0) return null;
    return a / b;
}

function fail(): CalcState {
    return { ...INITIAL_CALC, display: 'Error', error: true };
}

function freshDigit(digit: string): CalcState {
    return { ...INITIAL_CALC, display: digit, tape: digit };
}

export function loadCalcResult(value: string, expression = ''): CalcState {
    const display = value || '0';
    return {
        ...INITIAL_CALC,
        display,
        tape: expression,
        evaluated: expression.length > 0,
        waiting: true,
    };
}

function stripTrailingNumber(tape: string, number: string): string {
    if (!number || !tape.endsWith(number)) return tape;
    return tape.slice(0, -number.length);
}

function putTrailingNumber(tape: string, previous: string, next: string): string {
    const base = stripTrailingNumber(tape, previous);
    return `${base}${next}`;
}

function lastNumberOf(tape: string): string {
    const match = tape.match(/(−?[0-9]+(?:,[0-9]*)?)$/);
    return match?.[1] ?? '';
}

function trimDisplay(display: string): string {
    const next = display.slice(0, -1);
    if (!next || next === '−') return '0';
    return next;
}

function toggleSign(display: string): string {
    if (display === '0') return '−0';
    if (display === '−0') return '0';
    return display.startsWith('−') ? display.slice(1) : `−${display}`;
}

export function pressCalcKey(state: CalcState, key: string): { state: CalcState; committed: CalcCommit | null } {
    if (key === 'AC') return { state: INITIAL_CALC, committed: null };

    if (state.error) {
        if (/^[0-9]$/.test(key)) return { state: freshDigit(key), committed: null };
        if (key === ',') return { state: { ...INITIAL_CALC, display: '0,', waiting: false }, committed: null };
        return { state, committed: null };
    }

    if (/^[0-9]$/.test(key)) return { state: inputDigit(state, key), committed: null };
    if (key === ',') return { state: inputDecimal(state), committed: null };
    if (key === 'back') return { state: inputBackspace(state), committed: null };
    if (key === '±') return { state: inputSign(state), committed: null };
    if (key === '%') return { state: inputPercent(state), committed: null };
    if (key === '-' || key === '−' || key === '+' || key === '×' || key === '÷') {
        const op: CalcOp = key === '-' || key === '−' ? '−' : (key as CalcOp);
        return { state: inputOperator(state, op), committed: null };
    }
    if (key === '=') return inputEquals(state);
    return { state, committed: null };
}

function inputDigit(state: CalcState, digit: string): CalcState {
    if (state.evaluated || (state.waiting && !state.pendingOp)) {
        return freshDigit(digit);
    }
    if (state.waiting && state.pendingOp) {
        return {
            ...state,
            display: digit,
            tape: `${state.tape}${digit}`,
            waiting: false,
            evaluated: false,
            repeatOp: null,
            repeatOperand: null,
        };
    }
    if (state.display.replace('−', '').replace(',', '').length >= 9 && state.display !== '0' && state.display !== '−0') {
        return state;
    }
    const next = state.display === '0' ? digit : state.display === '−0' ? `−${digit}` : `${state.display}${digit}`;
    return {
        ...state,
        display: next,
        tape: putTrailingNumber(state.tape, state.display, next),
        evaluated: false,
    };
}

function inputDecimal(state: CalcState): CalcState {
    if (state.evaluated || (state.waiting && !state.pendingOp)) {
        return { ...INITIAL_CALC, display: '0,', tape: '0,' };
    }
    if (state.waiting && state.pendingOp) {
        return {
            ...state,
            display: '0,',
            tape: `${state.tape}0,`,
            waiting: false,
            evaluated: false,
            repeatOp: null,
            repeatOperand: null,
        };
    }
    if (state.display.includes(',')) return state;
    const next = `${state.display},`;
    return { ...state, display: next, tape: putTrailingNumber(state.tape, state.display, next), evaluated: false };
}

function inputBackspace(state: CalcState): CalcState {
    if (state.evaluated) {
        const next = trimDisplay(state.display);
        return { ...INITIAL_CALC, display: next, tape: next === '0' ? '' : next };
    }
    if (state.pendingOp && state.waiting && state.tape.endsWith(state.pendingOp)) {
        const tape = state.tape.slice(0, -state.pendingOp.length);
        return {
            ...INITIAL_CALC,
            display: lastNumberOf(tape) || '0',
            tape,
        };
    }
    if (state.pendingOp && !state.waiting) {
        const next = trimDisplay(state.display);
        const wholeOperand = !state.display.includes(',') && state.display.replace('−', '').length <= 1;
        if (wholeOperand || next === '0') {
            const tape = stripTrailingNumber(state.tape, state.display);
            return {
                ...state,
                display: formatCalcNumber(state.accumulator ?? 0),
                tape,
                waiting: true,
                evaluated: false,
            };
        }
        return {
            ...state,
            display: next,
            tape: putTrailingNumber(state.tape, state.display, next),
            evaluated: false,
        };
    }
    const next = trimDisplay(state.display);
    return {
        ...INITIAL_CALC,
        display: next,
        tape: next === '0' ? '' : putTrailingNumber(state.tape, state.display, next),
    };
}

function inputSign(state: CalcState): CalcState {
    const next = toggleSign(state.display);
    if (state.evaluated) {
        return { ...INITIAL_CALC, display: next, tape: next, waiting: true };
    }
    return {
        ...state,
        display: next,
        tape: putTrailingNumber(state.tape, state.display, next),
    };
}

function inputPercent(state: CalcState): CalcState {
    const current = parseDisplay(state.display);
    const value =
        (state.pendingOp === '+' || state.pendingOp === '−') && state.accumulator != null
            ? state.accumulator * (current / 100)
            : current / 100;
    const next = formatCalcNumber(value);
    if (state.evaluated) {
        return { ...INITIAL_CALC, display: next, tape: next };
    }
    return {
        ...state,
        display: next,
        tape: putTrailingNumber(state.tape, state.display, next),
        waiting: false,
        evaluated: false,
    };
}

function inputOperator(state: CalcState, op: CalcOp): CalcState {
    const current = parseDisplay(state.display);
    if (state.evaluated) {
        return {
            ...state,
            tape: `${state.display}${op}`,
            accumulator: current,
            pendingOp: op,
            waiting: true,
            evaluated: false,
            repeatOp: null,
            repeatOperand: null,
        };
    }
    if (state.pendingOp && state.waiting) {
        const tape = state.tape.endsWith(state.pendingOp)
            ? `${state.tape.slice(0, -state.pendingOp.length)}${op}`
            : `${state.tape}${op}`;
        return {
            ...state,
            tape,
            pendingOp: op,
            waiting: true,
            evaluated: false,
            repeatOp: null,
            repeatOperand: null,
        };
    }
    if (state.pendingOp && !state.waiting) {
        const result = compute(state.accumulator ?? 0, current, state.pendingOp);
        if (result == null) return fail();
        return {
            ...state,
            display: formatCalcNumber(result),
            tape: `${state.tape}${op}`,
            accumulator: result,
            pendingOp: op,
            waiting: true,
            evaluated: false,
            repeatOp: null,
            repeatOperand: null,
            error: false,
        };
    }
    const base = state.tape || state.display;
    return {
        ...state,
        tape: `${base}${op}`,
        accumulator: current,
        pendingOp: op,
        waiting: true,
        evaluated: false,
        repeatOp: null,
        repeatOperand: null,
    };
}

function settle(
    state: CalcState,
    display: string,
    tape: string,
    repeatOp: CalcOp,
    repeatOperand: number,
): { state: CalcState; committed: CalcCommit } {
    return {
        state: {
            ...state,
            display,
            tape,
            accumulator: parseDisplay(display),
            pendingOp: null,
            waiting: true,
            evaluated: true,
            repeatOp,
            repeatOperand,
            error: false,
        },
        committed: { expression: tape, result: display },
    };
}

function inputEquals(state: CalcState): { state: CalcState; committed: CalcCommit | null } {
    const current = parseDisplay(state.display);

    if (state.pendingOp && !state.waiting) {
        const left = state.accumulator ?? 0;
        const result = compute(left, current, state.pendingOp);
        if (result == null) return { state: fail(), committed: null };
        const shown = formatCalcNumber(result);
        const tape = state.tape || `${formatCalcNumber(left)}${state.pendingOp}${formatCalcNumber(current)}`;
        return settle(state, shown, tape, state.pendingOp, current);
    }

    if (state.pendingOp && state.waiting) {
        const left = state.accumulator ?? current;
        const result = compute(left, left, state.pendingOp);
        if (result == null) return { state: fail(), committed: null };
        const shown = formatCalcNumber(result);
        const operand = formatCalcNumber(left);
        return settle(state, shown, `${operand}${state.pendingOp}${operand}`, state.pendingOp, left);
    }

    if (state.repeatOp && state.repeatOperand != null) {
        const result = compute(current, state.repeatOperand, state.repeatOp);
        if (result == null) return { state: fail(), committed: null };
        const shown = formatCalcNumber(result);
        const tape = `${formatCalcNumber(current)}${state.repeatOp}${formatCalcNumber(state.repeatOperand)}`;
        return settle(state, shown, tape, state.repeatOp, state.repeatOperand);
    }

    return { state, committed: null };
}

export function isCalcOp(key: string): key is CalcOp {
    return OPS.has(key as CalcOp);
}
