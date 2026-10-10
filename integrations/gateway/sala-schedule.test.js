'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isSalaWeekdayMadrid } = require('./sala-schedule');

test('Friday until 23:59:59 Madrid is enabled, weekend midnight is disabled', () => {
    assert.equal(isSalaWeekdayMadrid(new Date('2026-10-09T21:59:59Z')), true);
    assert.equal(isSalaWeekdayMadrid(new Date('2026-10-09T22:00:00Z')), false);
});

test('Monday at 00:00 Madrid resumes automatically, including clock change', () => {
    assert.equal(isSalaWeekdayMadrid(new Date('2026-10-11T21:59:59Z')), false);
    assert.equal(isSalaWeekdayMadrid(new Date('2026-10-11T22:00:00Z')), true);
    assert.equal(isSalaWeekdayMadrid(new Date('2026-10-25T22:59:59Z')), false);
    assert.equal(isSalaWeekdayMadrid(new Date('2026-10-25T23:00:00Z')), true);
});

test('The weekend rule has no exceptions for Saturday or Sunday', () => {
    for (const day of ['2026-10-10T12:00:00Z', '2026-10-11T12:00:00Z']) {
        assert.equal(isSalaWeekdayMadrid(new Date(day)), false);
    }
    for (const day of ['2026-10-12T12:00:00Z', '2026-10-13T12:00:00Z',
        '2026-10-14T12:00:00Z', '2026-10-15T12:00:00Z',
        '2026-10-16T12:00:00Z']) {
        assert.equal(isSalaWeekdayMadrid(new Date(day)), true);
    }
});
