'use strict';

// Las ventas y movimientos de caja se procesan todos los dias.
// Solo la telemetria de mesas/KDS se pausa los fines de semana.
const MADRID_WEEKDAY = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
});

function isSalaWeekdayMadrid(instant = new Date()) {
    const day = MADRID_WEEKDAY.format(instant);
    return day !== 'Sat' && day !== 'Sun';
}

module.exports = { isSalaWeekdayMadrid };
