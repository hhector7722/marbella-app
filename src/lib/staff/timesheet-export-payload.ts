/**
 * Modelo de datos para la exportación oficial de jornada.
 *
 * Contiene ÚNICAMENTE datos en bruto. Toda la lógica de presentación
 * (formato de horas, nombres de días, formato de fechas) reside en cada
 * generador (PDF / Excel) para mantener el DTO independiente de la representación.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface TimesheetDayRow {
    /** Fecha ISO YYYY-MM-DD, ej. "2025-06-03" */
    date: string;
    /**
     * Día de la semana según Date.getDay():
     *   0 = domingo, 1 = lunes … 6 = sábado
     */
    weekday: number;
    /** Hora de entrada HH:mm, o null si no hay registro */
    clockIn: string | null;
    /** Hora de salida HH:mm, o null si no hay registro */
    clockOut: string | null;
    /** Minutos trabajados reales. 0 si no hay fichaje. */
    workedMinutes: number;
    /** Minutos a mostrar en columna Horas (para baja = jornada contratada). */
    displayMinutes: number;
    /** Tipo de jornada: "regular" | "holiday" | "weekend" | "adjustment" | "personal" | "no_registered" */
    eventType: string;
    /** true si hay al menos un fichaje registrado para este día */
    hasLog: boolean;
}

export interface TimesheetExportPayload {
    // -----------------------------------------------------------------------
    // Empresa
    // -----------------------------------------------------------------------
    /** Nombre comercial completo de la empresa */
    companyName: string;

    // -----------------------------------------------------------------------
    // Empleado
    // -----------------------------------------------------------------------
    /** Nombre y apellidos completos del empleado */
    employeeFullName: string;
    /**
     * DNI del empleado, o null si no está registrado.
     * Cuando es null, los generadores OMITEN la fila/campo correspondiente.
     */
    employeeDni: string | null;

    // -----------------------------------------------------------------------
    // Período
    // -----------------------------------------------------------------------
    /** Año del período exportado */
    periodYear: number;
    /** Mes del período exportado, 0-indexed (0 = enero … 11 = diciembre) */
    periodMonth: number;

    // -----------------------------------------------------------------------
    // Metadatos de generación
    // -----------------------------------------------------------------------
    /** Instante exacto en que se construyó el payload */
    generatedAt: Date;
    /**
     * Etiqueta personalizada para el período (ej. "Ene - Mar 2026").
     * Si se omite, los generadores usan periodYear / periodMonth.
     */
    periodLabel?: string;

    // -----------------------------------------------------------------------
    // Agregados numéricos (los formatos los produce cada generador)
    // -----------------------------------------------------------------------
    /** Número de días con hasLog === true */
    totalDays: number;
    /** Suma de workedMinutes de todas las filas */
    totalWorkedMinutes: number;
    /** Suma de displayMinutes de todas las filas (para total general) */
    totalDisplayMinutes: number;
    /** Horas contratadas semanales del empleado (para cómputo de bajas) */
    contractedHoursWeekly: number;
    /** Fecha ISO del primer día con hasLog, o null si no hay ninguno */
    firstDayDate: string | null;
    /** Fecha ISO del último día con hasLog, o null si no hay ninguno */
    lastDayDate: string | null;

    // -----------------------------------------------------------------------
    // Filas (solo días con hasLog === true)
    // -----------------------------------------------------------------------
    /**
     * Una fila por día trabajado, en orden cronológico ascendente.
     * Los días sin registro no se incluyen.
     */
    rows: TimesheetDayRow[];
}

// ---------------------------------------------------------------------------
// Tipos internos de WeekData (espejados aquí para no crear dependencia circular)
// ---------------------------------------------------------------------------

interface DayData {
    date: string;
    dayName: string;
    dayNumber: number;
    hasLog: boolean;
    clockIn: string | null;
    clockOut: string | null;
    totalHours: number;
    extraHours: number;
    eventType: string;
    isToday: boolean;
}

interface WeekSummary {
    totalHours: number;
    startBalance: number;
    weeklyBalance: number;
    finalBalance: number;
    estimatedValue: number;
    isPaid: boolean;
    preferStock?: boolean;
    hourlyRate?: number;
}

interface WeekData {
    weekNumber: number;
    startDate: string;
    isCurrentWeek: boolean;
    days: DayData[];
    summary: WeekSummary;
}

// ---------------------------------------------------------------------------
// Constructor del DTO
// ---------------------------------------------------------------------------

const COMPANY_NAME = 'Bar La Marbella / Fogo Torrat S.L.';

/**
 * Construye el payload de exportación a partir del estado en memoria de la página.
 * No realiza ninguna llamada a la API.
 *
 * @param weeksData   Array de semanas ya cargado en React state
 * @param employeeFullName  Nombre completo del empleado
 * @param employeeDni       DNI del empleado, o null si no disponible
 * @param filterYear        Año seleccionado en el filtro de la página
 * @param filterMonth       Mes seleccionado en el filtro (0-indexed)
 */
export function buildTimesheetPayload(
    weeksData: WeekData[],
    employeeFullName: string,
    employeeDni: string | null,
    filterYear: number,
    filterMonth: number,
    periodLabel?: string,
    contractedHoursWeekly?: number,
): TimesheetExportPayload {
    const rows: TimesheetDayRow[] = [];

    for (const week of weeksData) {
        for (const day of week.days) {
            if (!day.hasLog) continue;

            const workedMinutes = Math.round((day.totalHours ?? 0) * 60);
            const eventType = day.eventType ?? 'regular';

            // Para días de baja: 8h fijas, sin entrada/salida
            const displayMinutes = eventType === 'adjustment' ? 480 : workedMinutes;

            const [y, m, d] = day.date.split('-').map(Number);
            const dateObj = new Date(y, m - 1, d);
            const weekday = dateObj.getDay();

            rows.push({
                date: day.date,
                weekday,
                clockIn: day.clockIn ?? null,
                clockOut: day.clockOut ?? null,
                workedMinutes,
                displayMinutes,
                eventType,
                hasLog: true,
            });
        }
    }

    rows.sort((a, b) => a.date.localeCompare(b.date));

    const totalWorkedMinutes = rows.reduce((acc, r) => acc + r.workedMinutes, 0);
    const totalDisplayMinutes = rows.reduce((acc, r) => acc + r.displayMinutes, 0);
    const firstDayDate = rows.length > 0 ? rows[0].date : null;
    const lastDayDate = rows.length > 0 ? rows[rows.length - 1].date : null;

    return {
        companyName: COMPANY_NAME,
        employeeFullName,
        employeeDni: employeeDni || null,
        periodYear: filterYear,
        periodMonth: filterMonth,
        periodLabel: periodLabel,
        generatedAt: new Date(),
        totalDays: rows.length,
        totalWorkedMinutes,
        totalDisplayMinutes,
        contractedHoursWeekly: contractedHoursWeekly ?? 0,
        firstDayDate,
        lastDayDate,
        rows,
    };
}
