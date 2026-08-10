import { Recipe, Intensidad, MovidaId } from './types';

// ============================================================
// MOTOR DE INTENCIÓN — traduce frases de diseño en recetas.
// Determinista y local. No toma decisiones: propone.
// ============================================================

interface Intento {
    movidaId: MovidaId;
    intensidad: Intensidad;
    razon: string;
}

function has(text: string, ...words: string[]): boolean {
    return words.some(w => text.includes(w));
}

function intentar(text: string): Intento[] {
    const t = text.toLowerCase();
    const movimientos: Intento[] = [];

    // -- Aire / respiración
    if (has(t, 'respire', 'respirar', 'aire', 'respiración', 'respiraci', 'espacio', 'separación', 'separar', 'desahogar', 'menos apretado')) {
        const f = has(t, 'muchísimo', 'mucho más', 'de verdad', 'bastante', 'generoso') ? 'fuerte' : has(t, 'quita', 'menos', 'reducir', 'poco') ? 'sutil' : 'moderado';
        movimientos.push({ movidaId: 'aire', intensidad: f, razon: 'La frase pide más aire.' });
    }

    // -- Superficies / tarjetas
    if (has(t, 'superficie', 'tarjeta', 'card', 'caja', 'cuadro', 'panel', 'menos cajas', 'sin tarjetas')) {
        const f = has(t, 'sin tarjetas', 'sin cajas', 'elimina', 'quita todas', 'muchísimo', 'casi todas') ? 'fuerte' : has(t, 'menos', 'reduce', 'quita', 'recorta') ? 'moderado' : 'sutil';
        movimientos.push({ movidaId: 'superficies', intensidad: f, razon: 'La frase pide reducir superficies.' });
    }

    // -- Densidad / compactar
    if (has(t, 'compacto', 'compacta', 'denso', 'densa', 'apretado', 'más info', 'menos scroll', 'vertical')) {
        const f = has(t, 'mucho más', 'bastante', 'muy', 'de verdad') ? 'fuerte' : 'moderado';
        movimientos.push({ movidaId: 'densidad', intensidad: f, razon: 'La frase pide más densidad.' });
        if (!movimientos.some(m => m.movidaId === 'aire')) {
            movimientos.push({ movidaId: 'aire', intensidad: 'sutil', razon: 'Densidad y aire se compensan.' });
        }
    }

    // -- Profundidad / elevación
    if (has(t, 'elevación', 'elevacion', 'profundidad', 'sombra', 'plano', 'plana', 'sin sombras', 'sin elevación')) {
        const f = has(t, 'sin sombras', 'plano', 'plana', 'elimina', 'quita', 'casi toda', 'nada') ? 'nada' : has(t, 'más', 'aumenta') ? 'moderado' : 'sutil';
        movimientos.push({ movidaId: 'profundidad', intensidad: f, razon: 'La frase habla de profundidad/elevación.' });
    }

    // -- Contraste
    if (has(t, 'contraste', 'nítido', 'nitido', 'gris', 'grises', 'difuso', 'claro', 'negro sobre blanco', 'brillo')) {
        const f = has(t, 'mucho más', 'fuerte', 'muchísimo', 'más contraste') ? 'fuerte' : has(t, 'menos', 'baja', 'suaviza') ? 'sutil' : 'moderado';
        movimientos.push({ movidaId: 'contraste', intensidad: f, razon: 'La frase habla de contraste.' });
    }

    // -- Voz tipográfica
    if (has(t, 'editorial', 'tipografía editorial')) {
        movimientos.push({ movidaId: 'voz_tipografica', intensidad: has(t, 'muy', 'fuerte', 'mucho') ? 'fuerte' : 'moderado', razon: 'La frase pide voz editorial.' });
    }
    if (has(t, 'tipografía compacta', 'compacta', 'tipografía técnica')) {
        if (!movimientos.some(m => m.movidaId === 'voz_tipografica')) {
            movimientos.push({ movidaId: 'voz_tipografica', intensidad: 'moderado', razon: 'La frase pide tipografía compacta.' });
        }
    }

    // -- Ruido de navegación
    if (has(t, 'navegación', 'navegacion', 'menú', 'menu', 'submenú')) {
        const silenciosa = has(t, 'silenciosa', 'discreta', 'quita', 'menos ruido', 'deja de competir', 'desaparece', 'silencioso', 'discreto');
        const f = silenciosa ? (has(t, 'casi', 'por completo', 'totalmente', 'desaparece') ? 'fuerte' : 'moderado') : 'sutil';
        movimientos.push({ movidaId: 'ruido_navegacion', intensidad: f, razon: 'La frase habla de navegación.' });
    }

    // -- Protagonismo de KPIs
    if (has(t, 'kpi', 'métrica', 'metrica', 'cifra', 'indicador', 'protagonismo', 'domine', 'domina')) {
        const f = has(t, 'domine', 'domina', 'mucho más', 'fuerte', 'protagonista') ? 'fuerte' : 'moderado';
        movimientos.push({ movidaId: 'protagonismo_kpi', intensidad: f, razon: 'La frase pide protagonismo de las métricas.' });
    }

    // -- Presencia de marca
    if (has(t, 'marca', 'color de marca', 'identidad', 'más verde', 'menos verde')) {
        const f = has(t, 'menos marca', 'menos verde', 'quita el color', 'sin color') ? 'nada' : has(t, 'más marca', 'más verde') ? 'fuerte' : 'moderado';
        movimientos.push({ movidaId: 'presencia_marca', intensidad: f, razon: 'La frase habla de la marca.' });
    }

    // -- Tratamiento de tablas
    if (has(t, 'tabla', 'tablas', 'rejilla', 'filas')) {
        if (has(t, 'plana', 'plano', 'sin bordes', 'limpia', 'respire la tabla', 'respire la rejilla')) {
            movimientos.push({ movidaId: 'tratamiento_tablas', intensidad: 'fuerte', razon: 'Tabla plana, sin rejilla.' });
        } else {
            movimientos.push({ movidaId: 'tratamiento_tablas', intensidad: has(t, 'mucho', 'fuerte') ? 'moderado' : 'sutil', razon: 'La frase habla de tablas.' });
        }
    }

    // -- Peso de botones
    if (has(t, 'botones silenciosos', 'botón silencioso', 'acciones silenciosas', 'botón discreto')) {
        movimientos.push({ movidaId: 'peso_botones', intensidad: 'fuerte', razon: 'Botones silenciosos.' });
    }

    // -- Presets de filosofía (referencias como sondas)
    if (has(t, 'linear')) {
        movimientos.push(
            { movidaId: 'superficies', intensidad: 'sutil', razon: 'Linear: superficies mínimas.' },
            { movidaId: 'contraste', intensidad: 'moderado', razon: 'Linear: contraste nítido.' },
            { movidaId: 'ruido_navegacion', intensidad: 'fuerte', razon: 'Linear: navegación silenciosa.' },
            { movidaId: 'profundidad', intensidad: 'nada', razon: 'Linear: sin elevación.' },
        );
    }
    if (has(t, 'apple', 'ios')) {
        movimientos.push(
            { movidaId: 'aire', intensidad: 'moderado', razon: 'Apple: aire generoso.' },
            { movidaId: 'protagonismo_kpi', intensidad: 'moderado', razon: 'Apple: jerarquía por escala.' },
            { movidaId: 'profundidad', intensidad: 'sutil', razon: 'Apple: elevación justa.' },
        );
    }
    if (has(t, 'stripe')) {
        movimientos.push(
            { movidaId: 'tratamiento_tablas', intensidad: 'fuerte', razon: 'Stripe: tablas planas.' },
            { movidaId: 'peso_botones', intensidad: 'fuerte', razon: 'Stripe: botones silenciosos.' },
            { movidaId: 'contraste', intensidad: 'moderado', razon: 'Stripe: claridad operativa.' },
        );
    }
    if (has(t, 'notion')) {
        movimientos.push(
            { movidaId: 'superficies', intensidad: 'sutil', razon: 'Notion: superficies discretas.' },
            { movidaId: 'profundidad', intensidad: 'nada', razon: 'Notion: sin elevación.' },
            { movidaId: 'aire', intensidad: 'moderado', razon: 'Notion: calma estructurada.' },
        );
    }
    if (has(t, 'vercel')) {
        movimientos.push(
            { movidaId: 'voz_tipografica', intensidad: 'moderado', razon: 'Vercel: tipografía compacta.' },
            { movidaId: 'profundidad', intensidad: 'nada', razon: 'Vercel: planitud.' },
            { movidaId: 'densidad', intensidad: 'moderado', razon: 'Vercel: densidad controlada.' },
        );
    }

    // -- Sensaciones globales
    if (has(t, 'premium', 'de lujo', 'refinado', 'refinada', 'elegante')) {
        movimientos.push(
            { movidaId: 'aire', intensidad: 'moderado', razon: 'Premium: más aire.' },
            { movidaId: 'profundidad', intensidad: 'sutil', razon: 'Premium: elevación justa.' },
            { movidaId: 'contraste', intensidad: 'moderado', razon: 'Premium: contraste nítido.' },
        );
    }
    if (has(t, 'estrés', 'estres', 'stress', 'calma', 'tranquilo', 'tranquila', 'menos ruido visual')) {
        movimientos.push(
            { movidaId: 'aire', intensidad: 'moderado', razon: 'Menos estrés: más aire.' },
            { movidaId: 'superficies', intensidad: 'sutil', razon: 'Menos estrés: menos cajas.' },
            { movidaId: 'ruido_navegacion', intensidad: 'sutil', razon: 'Menos estrés: navegación discreta.' },
            { movidaId: 'profundidad', intensidad: 'sutil', razon: 'Menos estrés: menos sombras.' },
        );
    }

    return movimientos;
}

export function fraseAReceta(frase: string): { recipe: Recipe; explicacion: string[] } {
    const intentos = intentar(frase);
    const recipe: Recipe = {};
    const explicacion: string[] = [];

    for (const it of intentos) {
        recipe[it.movidaId] = it.intensidad;
    }

    if (intentos.length === 0) {
        explicacion.push('No reconocí una movida clara en esa frase. Prueba con aire, superficies, densidad, contraste, tipografía, navegación o KPIs.');
    }

    // Explicación legible: solo los movimientos con su porqué, sin duplicados por movida.
    const seen = new Set<MovidaId>();
    for (const it of intentos) {
        if (seen.has(it.movidaId)) continue;
        seen.add(it.movidaId);
        explicacion.push(`${it.movidaId} → ${it.intensidad}`);
    }

    return { recipe, explicacion };
}
