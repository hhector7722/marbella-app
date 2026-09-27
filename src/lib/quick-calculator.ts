/**
 * Calculadora al estilo iOS (básica).
 * El visor muestra el número en curso. Una operación no se resuelve al teclear
 * el segundo operando: se resuelve al pulsar otro operador o «=».
 */

export type CalcOp = '+' | '−' | '×' | '÷';

export type CalcState = {
    display: string;
    accumulator: number | null;
    pendingOp: CalcOp | null;
    /** El siguiente dígito sustituye al visor (tras un operador o «=»). */
    waiting: boolean;
    repeatOp: CalcOp | null;
    repeatOperand: number | null;
    error: boolean;
};

export type CalcCommit = { expression: string; result: string };

export const INITIAL_CALC: CalcState = {
    display: '0',
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
    return { ...INITIAL_CALC, display: digit, waiting: false };
}

export function loadCalcResult(value: string): CalcState {
    return { ...INITIAL_CALC, display: value || '0', waiting: true };
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
    if (state.waiting) {
        return {
            ...state,
            display: digit,
            waiting: false,
            repeatOp: null,
            repeatOperand: null,
        };
    }
    if (state.display === '0') return { ...state, display: digit };
    if (state.display === '−0') return { ...state, display: `−${digit}` };
    if (state.display.replace('−', '').replace(',', '').length >= 9) return state;
    return { ...state, display: `${state.display}${digit}` };
}

function inputDecimal(state: CalcState): CalcState {
    if (state.waiting) {
        return { ...state, display: '0,', waiting: false, repeatOp: null, repeatOperand: null };
    }
    if (state.display.includes(',')) return state;
    return { ...state, display: `${state.display},` };
}

function inputBackspace(state: CalcState): CalcState {
    if (state.waiting) return state;
    const next = state.display.slice(0, -1);
    if (!next || next === '−') return { ...state, display: '0' };
    return { ...state, display: next };
}

function inputSign(state: CalcState): CalcState {
    if (state.display === '0') return { ...state, display: '−0' };
    if (state.display === '−0') return { ...state, display: '0' };
    const display = state.display.startsWith('−') ? state.display.slice(1) : `−${state.display}`;
    return { ...state, display };
}

function inputPercent(state: CalcState): CalcState {
    const current = parseDisplay(state.display);
    const next =
        (state.pendingOp === '+' || state.pendingOp === '−') && state.accumulator != null
            ? state.accumulator * (current / 100)
            : current / 100;
    return { ...state, display: formatCalcNumber(next), waiting: false };
}

function inputOperator(state: CalcState, op: CalcOp): CalcState {
    const current = parseDisplay(state.display);
    if (state.pendingOp && !state.waiting) {
        const result = compute(state.accumulator ?? 0, current, state.pendingOp);
        if (result == null) return fail();
        return {
            ...state,
            display: formatCalcNumber(result),
            accumulator: result,
            pendingOp: op,
            waiting: true,
            repeatOp: null,
            repeatOperand: null,
            error: false,
        };
    }
    return {
        ...state,
        accumulator: current,
        pendingOp: op,
        waiting: true,
        repeatOp: null,
        repeatOperand: null,
    };
}

function inputEquals(state: CalcState): { state: CalcState; committed: CalcCommit | null } {
    const current = parseDisplay(state.display);

    if (state.pendingOp && !state.waiting) {
        const left = state.accumulator ?? 0;
        const result = compute(left, current, state.pendingOp);
        if (result == null) return { state: fail(), committed: null };
        const shown = formatCalcNumber(result);
        return {
            state: {
                ...state,
                display: shown,
                accumulator: result,
                pendingOp: null,
                waiting: true,
                repeatOp: state.pendingOp,
                repeatOperand: current,
                error: false,
            },
            committed: {
                expression: `${formatCalcNumber(left)} ${state.pendingOp} ${formatCalcNumber(current)}`,
                result: shown,
            },
        };
    }

    if (state.pendingOp && state.waiting) {
        const left = state.accumulator ?? current;
        const result = compute(left, left, state.pendingOp);
        if (result == null) return { state: fail(), committed: null };
        const shown = formatCalcNumber(result);
        return {
            state: {
                ...state,
                display: shown,
                accumulator: result,
                pendingOp: null,
                waiting: true,
                repeatOp: state.pendingOp,
                repeatOperand: left,
                error: false,
            },
            committed: {
                expression: `${formatCalcNumber(left)} ${state.pendingOp} ${formatCalcNumber(left)}`,
                result: shown,
            },
        };
    }

    if (state.repeatOp && state.repeatOperand != null) {
        const result = compute(current, state.repeatOperand, state.repeatOp);
        if (result == null) return { state: fail(), committed: null };
        const shown = formatCalcNumber(result);
        return {
            state: {
                ...state,
                display: shown,
                accumulator: result,
                waiting: true,
                error: false,
            },
            committed: {
                expression: `${formatCalcNumber(current)} ${state.repeatOp} ${formatCalcNumber(state.repeatOperand)}`,
                result: shown,
            },
        };
    }

    return { state, committed: null };
}

export function isCalcOp(key: string): key is CalcOp {
    return OPS.has(key as CalcOp);
}
