import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { comprobarManifiesto, type Categoria, type Manifiesto } from './manifiesto.ts'

function manifiestoCon(categorias: Partial<Record<Categoria, readonly string[]>>): Manifiesto {
  const vacias: Record<Categoria, readonly string[]> = {
    corpus: [],
    derivados: [],
    satelites: [],
    excluir: [],
  }
  const combinadas = { ...vacias, ...categorias }
  const declaradas = new Set<string>(Object.values(combinadas).flat())
  return {
    categorias: new Map(Object.entries(combinadas)) as ReadonlyMap<Categoria, readonly string[]>,
    declaradas,
    error: null,
  }
}

function escenario(): string {
  return mkdtempSync(join(tmpdir(), 'marbella-manifiesto-'))
}

describe('comprobarManifiesto — cobertura del manifiesto (CANON §11)', () => {
  it('una exclusión preventiva inexistente es válida', () => {
    const raiz = escenario()
    try {
      const manifiesto = manifiestoCon({ excluir: ['.pi/', '.qwen/', 'skills/'] })
      assert.deepEqual(comprobarManifiesto(manifiesto, raiz), [])
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })

  it('una exclusión preventiva declarada y existente con markdown es válida', () => {
    const raiz = escenario()
    mkdirSync(join(raiz, '.claude'), { recursive: true })
    writeFileSync(join(raiz, '.claude', 'skills.md'), '# copia de skill de terceros\n')
    try {
      const manifiesto = manifiestoCon({ excluir: ['.claude/'] })
      assert.deepEqual(comprobarManifiesto(manifiesto, raiz), [])
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })

  it('un directorio real con markdown sin clasificar provoca error', () => {
    const raiz = escenario()
    mkdirSync(join(raiz, 'ruido'), { recursive: true })
    writeFileSync(join(raiz, 'ruido', 'skills.md'), '# documentación de terceros\n')
    try {
      const manifiesto = manifiestoCon({})
      const hallazgos = comprobarManifiesto(manifiesto, raiz)
      assert.equal(hallazgos.length, 1)
      assert.equal(hallazgos[0].documento, 'ruido/')
      assert.match(hallazgos[0].detalle, /no está clasificado/)
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })

  it('un directorio real sin markdown y sin clasificar no provoca error', () => {
    const raiz = escenario()
    mkdirSync(join(raiz, 'vacio'), { recursive: true })
    try {
      const manifiesto = manifiestoCon({})
      assert.deepEqual(comprobarManifiesto(manifiesto, raiz), [])
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })

  it('corpus, derivados y satelites declarados inexistentes siguen fallando', () => {
    const raiz = escenario()
    try {
      const manifiesto = manifiestoCon({
        corpus: ['marbella-os/'],
        derivados: ['marbella-os/.generated/'],
        satelites: ['no-existe/'],
      })
      const hallazgos = comprobarManifiesto(manifiesto, raiz)
      assert.equal(hallazgos.length, 3)
      for (const h of hallazgos) assert.equal(h.documento, 'INDEXACION.md')
      assert.ok(hallazgos.some((h) => h.detalle.includes('no-existe/')))
      assert.ok(hallazgos.some((h) => h.detalle.includes('marbella-os/')))
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })
})