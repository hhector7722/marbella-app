/**
 * Utilidades para el manejo de fechas y zonas horarias en Bar Marbella.
 */

/**
 * Parsea una fecha proveniente de la base de datos (Supabase timestamptz).
 * Como el valor en DB es el correcto UTC (ej: 01:00Z para las 03:00 en Madrid),
 * el navegador lo convierte automáticamente al usar new Date().
 */
export function parseDBDate(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date();
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Parsea una fecha proveniente del TPV (Jsonb radiografia_completa).
 * El TPV manda la hora local (Madrid) pero con una 'Z' (UTC) erronea.
 * Ejemplo: '2026-04-07T03:09:28.000Z' (cuando en Madrid son las 03:09 AM).
 * Forzamos el parseo como hora LOCAL extrayendo los componentes manualmente.
 */
export function parseTPVDate(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date();
  
  if (typeof dateStr === 'string' && dateStr.includes('T')) {
    try {
      // Formato: 2026-04-07T15:55:54.000Z
      // Extraemos solo los números ignorando TZ y milisegundos
      const matches = dateStr.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
      
      if (matches) {
        const [, y, m, d, h, min, s] = matches.map(Number);
        // Creamos la fecha local con esos valores numéricos exactos
        const fechaLocal = new Date(y, m - 1, d, h, min, s);
        if (!isNaN(fechaLocal.getTime())) return fechaLocal;
      }
    } catch (e) {
      console.error("Error al parsear fecha TPV nuclear:", e);
    }
  }
  
  return parseDBDate(dateStr);
}

/**
 * Formatea una fecha para mostrarla como HH:mm:ss
 */
export function formatLocalTime(date: Date | string | null | undefined): string {
  if (!date) return '--:--:--';
  const d = (date instanceof Date) ? date : parseTPVDate(date);
  
  return d.toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

/**
 * Obtiene el inicio del día local en Madrid (00:00:00)
 */
export function getStartOfLocalToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}
