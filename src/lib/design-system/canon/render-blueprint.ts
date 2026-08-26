import { findOption } from '../visual-studio/allowed-values.ts';
import { STUDIO_ELEMENTS } from '../visual-studio/catalog.ts';
import type { CanonRegistry } from './schema.ts';
import type { StudioElement } from '../visual-studio/types.ts';

function stamp(): string {
    return new Date().toISOString().slice(0, 10);
}

export function blueprintMatrixRow(item: Pick<StudioElement, 'label' | 'status' | 'inherits' | 'redirectTo'>): string {
    if (item.redirectTo === 'table') return `| ${item.label} | Parte de Table / T8 |`;
    if (item.inherits) return `| ${item.label} | HEREDADO (hereda Modal Header) |`;
    return `| ${item.label} | ${item.status} |`;
}

export function renderBlueprint(registry: CanonRegistry): string {
    const hydrated = STUDIO_ELEMENTS.map((def) => {
        const live = registry.elements[def.id];
        return {
            ...def,
            status: live?.status ?? def.status,
            inherits: live?.inherits ?? def.inherits,
            properties: def.properties.map((property) => ({
                ...property,
                actualId: live?.properties[property.id] ?? property.actualId,
            })),
        };
    });

    const groups = [
        ['fundamentos', 'Fundamentos'],
        ['cabeceras', 'Cabeceras'],
        ['alineacion', 'Alineación'],
        ['piezas', 'Piezas y patrones'],
        ['especializado', 'Especializado'],
    ] as const;

    const matrix = groups
        .map(([group, title]) => {
            const rows = hydrated
                .filter((item) => item.group === group)
                .map((item) => blueprintMatrixRow(item))
                .join('\n');
            return rows ? `### ${title}\n\n| Elemento | Estado |\n|---|---|\n${rows}\n` : '';
        })
        .filter(Boolean)
        .join('\n');

    const properties = hydrated
        .filter((item) => item.properties.length > 0 && item.status === 'CANON CERRADO')
        .map((item) => {
            const lines = item.properties.map((property) => {
                const option = findOption(property.options, property.actualId);
                return `- ${property.label}: ${option?.label ?? property.actualId}`;
            });
            return `### ${item.label}\n\n${lines.join('\n')}`;
        })
        .join('\n\n');

    const open = hydrated
        .filter(
            (item) =>
                (item.status === 'BORRADOR / PROPUESTA' || item.status === 'SIN CANON') &&
                !item.redirectTo
        )
        .map((item) => `- **${item.label}** (${item.status}): ${item.summary}`)
        .join('\n');

    const decisions = registry.history
        .slice(-20)
        .reverse()
        .map(
            (entry) =>
                `- ${entry.at} · ${entry.elementId} · v${entry.version} · ${entry.kind} · ${entry.fromStatus} → ${entry.toStatus}`
        )
        .join('\n');

    return `# Blueprint Visual — Marbella App

Este documento es la **documentación humana del canon visual**.
La fuente técnica editable es \`src/lib/design-system/canon/registry.json\`.
Este fichero se regenera desde esa fuente. No se edita a mano.

El canon define cómo debe ser Marbella. El código debe cumplirlo.
Si un consumidor no lo cumple, es deuda de implementación y se migra.
Esa deuda no aparece aquí.

\`\`\`
CANON            →  cómo debe ser Marbella
IMPLEMENTACIÓN   →  el código debe cumplir el canon
AUDITORÍA / DEUDA →  qué partes del código todavía no cumplen
\`\`\`

Generado: ${registry.updatedAt || stamp()}.

---

## Vocabulario de estados

| Estado | Significado |
|---|---|
| **CANON CERRADO** | Decidido. Normativo. Contrato obligatorio del código. |
| **BORRADOR / PROPUESTA** | Experimentando. No es contrato. |
| **SIN CANON** | Aún no hay decisión suficiente. |
| **HEREDADO** | Reutiliza el contrato visual de otro elemento. No es anatomía propia. |
| **ESPECIALIZADO** | Patrón de dominio. No es universal. |
| **DEPRECADO** | Histórico. No usar en código nuevo. |

### Regla: CANON CERRADO = contrato obligatorio

Una vez que un elemento se declara **CANON CERRADO**, todos los
consumidores nuevos y existentes deben utilizarlo conforme a su
definición. Una implementación que todavía no cumple el canon **no
modifica el canon**: constituye deuda de implementación y debe
corregirse mediante migración.

Autoridad: **propuesta visual**. No está indexado en el corpus. Si
discrepa de \`TOKENS.md\`, \`SISTEMA-DE-COMPONENTES.md\`, \`EXPERIENCIA.md\`
o un ADR vigente, gana el documento canónico del corpus.

---

## Matriz canónica

Pregunta de cada fila: **¿ya hemos decidido cómo debe ser?**

${matrix}

## Propiedades congeladas

${properties || '_Ningún elemento con propiedades editables está en CANON CERRADO._'}

## Abierto (no es contrato)

${open || '_Nada abierto._'}

## Alineación

Las decisiones de alineación son semánticas, no CSS arbitrario:

- Horizontal: Izquierda / Centro / Extremos
- Vertical: Arriba / Centro / Abajo

Se congelan en la pieza que las usa (cabecera, Field, tabla), no como token suelto.

## Historial de decisiones

${decisions || '_Sin decisiones registradas en el registro técnico._'}
`;
}
