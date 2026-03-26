import { ParsedQuery } from './types';

function normalize(q: string) {
  return q.toLowerCase().trim();
}

function containsAny(q: string, parts: string[]) {
  return parts.some((p) => q.includes(p));
}

export class QueryParser {
  parse(userQuery: string): ParsedQuery {
    const q = normalize(userQuery);

    const period =
      q.includes('semana pasada') || q.includes('semana anterior')
        ? 'last_week'
        : q.includes('mes') || q.includes('mensual')
          ? 'month'
          : q.includes('hoy') || q.includes('actual')
            ? 'today'
            : 'today';

    // Blindaje semántico: "¿Cuánto llevamos facturado?" significa HOY por diseño.
    // Solo lo forzamos si no aparece un periodo explícito (mes/semana pasada/semana anterior).
    const hasExplicitPeriod =
      q.includes('semana pasada') ||
      q.includes('semana anterior') ||
      q.includes('mes') ||
      q.includes('mensual') ||
      q.includes('hoy') ||
      q.includes('actual');

    if (
      !hasExplicitPeriod &&
      q.includes('llevamos') &&
      containsAny(q, ['facturado', 'facturar', 'facturaci', 'ventas', 'venta'])
    ) {
      return {
        type: 'sales',
        parameters: { period: 'today' },
        confidence: 0.9,
      };
    }

    // ORDER: "Añade 5 de coca cola al pedido"
    if (containsAny(q, ['añade', 'agrega', 'al pedido', 'al carrit', 'pedido'])) {
      const add = containsAny(q, ['añade', 'agrega']);
      const quantityMatch = q.match(/(\d+)\s*(?:de\s*)?/);
      const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
      const productMatch = q.match(/(?:de)\s+(.+?)(?:\s+al\s+pedido|\s*$)/);
      const productName = productMatch ? productMatch[1].trim() : '';

      return {
        type: 'order',
        action: add ? 'add_to_order' : undefined,
        parameters: productName ? { productName, quantity } : { quantity },
        confidence: productName ? 0.85 : 0.4,
      };
    }

    // RECIPE: "¿Cómo se hace la sangría?"
    if (containsAny(q, ['cómo se hace', 'como se hace', 'receta', 'ingrediente', 'sangría', 'sangria'])) {
      const recipeMatch =
        q.match(/(?:cómo se hace|como se hace)\s+(?:la\s+)?(.+?)\s*\??$/) ||
        q.match(/(?:receta|recetario)\s+(?:de\s+)?(.+?)\s*\??$/) ||
        q.match(/(?:de)\s+(.+?)\s*$/);

      const recipeName = recipeMatch ? recipeMatch[1].trim().replace(/\?+$/, '') : '';
      return {
        type: 'recipe',
        parameters: recipeName ? { recipeName } : {},
        confidence: recipeName ? 0.85 : 0.45,
      };
    }

    // TABLES (Radar): "mesas abiertas"
    if (containsAny(q, ['mesa', 'mesas', 'abierta', 'abiertas', 'consumiendo', 'consumen'])) {
      return {
        type: 'table',
        parameters: {},
        confidence: 0.75,
      };
    }

    // TREASURY: "caja", "arqueo", "diferencia", "tesorería"
    if (containsAny(q, ['caja', 'arqueo', 'diferencia', 'tesorería', 'tesoreria'])) {
      return {
        type: 'treasury',
        parameters: {},
        confidence: 0.75,
      };
    }

    // LABOR: "horas extras", "extras", "nómina"
    if (containsAny(q, ['horas', 'extras', 'nómina', 'nomina', 'h. extras', 'h extras'])) {
      return {
        type: 'labor',
        parameters: { period },
        confidence: 0.8,
      };
    }

    // SALES / FINANCIALS
    if (containsAny(q, ['facturaci', 'facturado', 'venta', 'ventas', 'cierres', 'net sales', 'import'])) {
      return {
        type: 'sales',
        parameters: { period },
        confidence: 0.8,
      };
    }

    return {
      type: 'unknown',
      parameters: {},
      confidence: 0.2,
    };
  }
}

