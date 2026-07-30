/**
 * Grafo de dependencias entre documentos del corpus.
 *
 * Autorizado por ADR-0004. Una arista `A → B` significa que A se apoya en lo
 * que dice B: si B cambia, A hay que revisarlo. No es una relación de
 * autoridad —eso lo resuelve `precedencia`— sino de impacto.
 *
 * Las aristas se declaran en el front-matter por el campo `documento` del
 * destino, no por su ruta, para que mover un fichero no rompa el grafo.
 */

import type { DocumentoCorpus } from './corpus.ts'

export interface Arista {
  readonly desde: string
  readonly hacia: string
  readonly origen: DocumentoCorpus
}

export function dependenciasDeclaradas(documento: DocumentoCorpus): string[] {
  const bruto = documento.campos.get('depende_de')
  if (bruto === undefined || bruto === '—') return []
  return bruto
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n !== '' && n !== '—')
}

export function construirAristas(documentos: readonly DocumentoCorpus[]): Arista[] {
  return documentos.flatMap((doc) => {
    const desde = doc.campos.get('documento')
    if (desde === undefined) return []
    return dependenciasDeclaradas(doc).map((hacia) => ({ desde, hacia, origen: doc }))
  })
}

/**
 * Primer ciclo encontrado, como recorrido cerrado, o `null` si no hay ninguno.
 *
 * Un ciclo en las dependencias significa que ningún documento del grupo puede
 * revisarse primero: cada uno espera al otro. Es un fallo de fronteras, y la
 * respuesta correcta no es romper una arista al azar sino decidir cuál de los
 * dos es dueño del hecho compartido.
 */
export function buscarCiclo(aristas: readonly Arista[]): string[] | null {
  const salientes = new Map<string, string[]>()
  for (const arista of aristas) {
    const destinos = salientes.get(arista.desde) ?? []
    destinos.push(arista.hacia)
    salientes.set(arista.desde, destinos)
  }

  const visitado = new Set<string>()
  const enPila = new Set<string>()
  const pila: string[] = []

  function recorrer(nodo: string): string[] | null {
    if (enPila.has(nodo)) return [...pila.slice(pila.indexOf(nodo)), nodo]
    if (visitado.has(nodo)) return null

    visitado.add(nodo)
    enPila.add(nodo)
    pila.push(nodo)

    for (const destino of salientes.get(nodo) ?? []) {
      const ciclo = recorrer(destino)
      if (ciclo !== null) return ciclo
    }

    pila.pop()
    enPila.delete(nodo)
    return null
  }

  for (const nodo of [...salientes.keys()].sort()) {
    const ciclo = recorrer(nodo)
    if (ciclo !== null) return ciclo
  }
  return null
}
