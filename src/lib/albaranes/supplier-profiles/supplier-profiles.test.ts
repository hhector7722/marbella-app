import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { interpretSupplierEvidence } from './interpret.ts'
import {
  isSupplierProfile,
  type SupplierEvidenceFixture,
  type SupplierProfile,
} from './types.ts'

type CanonicalFixture = {
  profile_id: string
  evidence: SupplierEvidenceFixture
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const profilesDir = join(repoRoot, 'marbella-os/3-ingenieria/albaranes-proveedores/profiles')
const fixturesPath = join(repoRoot, 'src/lib/albaranes/supplier-profiles/fixtures/canonical-guides.v1.json')

function loadProfiles(): SupplierProfile[] {
  return readdirSync(profilesDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => JSON.parse(readFileSync(join(profilesDir, file), 'utf8')) as unknown)
    .map((raw) => {
      assert.ok(isSupplierProfile(raw), 'todo perfil debe respetar el contrato v1')
      return raw
    })
}

const profiles = loadProfiles()
const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8')) as CanonicalFixture[]

function line(profileId: string, index = 0) {
  const fixture = fixtures.find((candidate) => candidate.profile_id === profileId)
  assert.ok(fixture, `fixture ausente: ${profileId}`)
  const profile = profileById.get(profileId)
  assert.ok(profile, `perfil ausente: ${profileId}`)
  return interpretSupplierEvidence(profile, fixture.evidence).lines[index]!
}

function closeTo(actual: number | null, expected: number, tolerance = 0.000001): void {
  if (actual === null) assert.fail(`valor nulo; se esperaba ${expected}`)
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} no es ${expected}`)
}

describe('supplier profiles — inventario canónico', () => {
  it('contiene una guía, un perfil y una fixture por cada proveedor vigente con formato conocido', () => {
    assert.equal(profiles.length, 16)
    assert.equal(fixtures.length, 16)
    assert.deepEqual(
      [...new Set(profiles.map((profile) => profile.supplier.id))].sort((a, b) => a - b),
      [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18]
    )
    for (const profile of profiles) {
      assert.match(profile.version, /^\d+\.\d+\.\d+$/)
      assert.ok(fixtures.some((fixture) => fixture.profile_id === profile.id))
      const imagePath = resolve(profilesDir, profile.reference.file)
      const hash = createHash('sha256').update(readFileSync(imagePath)).digest('hex')
      assert.equal(hash, profile.reference.sha256, `la guía ${profile.reference.file} debe permanecer intacta`)
    }
  })

  it('reconoce el proveedor documental sin renombrar supplier.name', () => {
    for (const fixture of fixtures) {
      const profile = profileById.get(fixture.profile_id)!
      const result = interpretSupplierEvidence(profile, fixture.evidence)
      assert.equal(result.supplier_identity, 'recognized', fixture.profile_id)
      assert.equal(result.supplier_profile_id, profile.id)
      assert.equal(result.supplier_profile_version, '1.0.0')
    }
  })
})

describe('supplier profiles — interpretación determinista de guías', () => {
  it('normaliza peso, unidades y descuentos solo cuando las magnitudes concilian', () => {
    assert.equal(line('supplier:5:abril').status, 'ready_for_review')
    assert.equal(line('supplier:6:carnicas-pijuan').proposal.physical_unit, 'kg')
    assert.equal(line('supplier:18:cava').proposal.physical_quantity, 30)
    assert.equal(line('supplier:12:fritz-ravich').proposal.physical_quantity, 84)
    assert.equal(line('supplier:16:meritem').economics.line_amount_without_tax, 88.2)
    assert.equal(line('supplier:7:santa-teresa').economics.line_amount_without_tax, 26.4)
    assert.equal(line('supplier:7:santa-teresa').observed.price_with_tax, '0,61')
    assert.equal(line('supplier:14:vino').status, 'ready_for_review')
    closeTo(line('supplier:14:vino').proposal.normalized_unit_price, 2.682)
  })

  it('Nestlé separa cajas, unidades por caja, contenido y descuento', () => {
    const result = line('supplier:10:nestle')
    assert.equal(result.status, 'ready_for_review')
    assert.equal(result.physical.cases, 2)
    assert.equal(result.physical.units_per_case, 20)
    assert.deepEqual(result.physical.content_per_unit, { value: 70, unit: 'ml' })
    assert.equal(result.physical.quantity, 40)
    assert.equal(result.economics.unit_price_before_discount, 27)
    assert.equal(result.economics.discount_percent, 20)
    assert.equal(result.economics.line_amount_without_tax, 43.2)
    closeTo(result.proposal.normalized_unit_price, 1.08)
  })

  it('Panabad no confunde precio por caja con coste por unidad', () => {
    const result = line('supplier:2:panabad')
    assert.equal(result.status, 'ready_for_review')
    assert.equal(result.physical.cases, 8)
    assert.equal(result.physical.units_per_case, 60)
    assert.equal(result.physical.quantity, 480)
    assert.equal(result.economics.unit_price_before_discount, 33.86)
    assert.equal(result.economics.discount_percent, 38)
    assert.equal(result.economics.line_amount_without_tax, 167.95)
    closeTo(result.proposal.normalized_unit_price, 167.95 / 480)
  })

  it('Hielo Fénix separa total con IVA, coste sin IVA, bolsa y kilogramo', () => {
    const result = line('supplier:13:hielo-fenix')
    assert.equal(result.status, 'ready_for_review')
    assert.equal(result.physical.quantity, 50)
    assert.equal(result.physical.unit, 'kg')
    assert.equal(result.economics.line_amount_with_tax, 28.75)
    assert.equal(result.economics.tax_percent, 10)
    closeTo(result.economics.line_amount_without_tax, 28.75 / 1.1)
    closeTo(result.economics.net_unit_price, 28.75 / 1.1 / 25)
    closeTo(result.proposal.normalized_unit_price, 28.75 / 1.1 / 50)
  })

  it('Sanilec convierte la presentación 3×5 L en 15 L, no en tres unidades', () => {
    const result = line('supplier:9:sanilec')
    assert.equal(result.status, 'ready_for_review')
    assert.equal(result.proposal.physical_quantity, 15)
    assert.equal(result.proposal.physical_unit, 'l')
    assert.equal(result.proposal.normalized_unit_price, 0.64)
  })

  it('Sant Aniol aplica la regla interna solo a PET 50 cl y excluye PET 1 L', () => {
    const halfLitre = line('supplier:11:sant-aniol', 0)
    const oneLitre = line('supplier:11:sant-aniol', 1)
    assert.equal(halfLitre.status, 'ready_for_review')
    assert.equal(halfLitre.proposal.eligible_for_stock_and_recipes, true)
    assert.equal(halfLitre.proposal.normalized_unit_price, 0.28)
    assert.equal(halfLitre.proposal.normalized_price_unit, 'EUR/bottle')
    assert.equal(oneLitre.status, 'excluded')
    assert.equal(oneLitre.proposal.eligible_for_stock_and_recipes, false)
    assert.equal(oneLitre.exclusion_reason, 'personal_purchase_no_stock_or_recipe')
  })

  it('Vermut factura la magnitud económica en litros', () => {
    const result = line('supplier:17:vermut')
    assert.equal(result.status, 'ready_for_review')
    assert.equal(result.physical.quantity, 80)
    assert.equal(result.physical.unit, 'l')
    assert.equal(result.economics.unit_price_before_discount, 3)
    assert.equal(result.economics.line_amount_without_tax, 240)
    assert.equal(result.proposal.normalized_price_unit, 'EUR/l')
  })
})

describe('supplier profiles — incertidumbre explícita y sin efectos', () => {
  it('conserva los campos de SERHS y exige revisión si P.UN no explica IMPORTE', () => {
    const result = line('supplier:8:shers')
    assert.equal(result.status, 'needs_review')
    assert.equal(result.observed.discount_value, '4,24')
    assert.equal(result.economics.net_unit_price, 11.39)
    assert.ok(result.needs_review.includes('line_amount_mismatch'))
  })

  it('Videla no mezcla kg, piezas, bultos ni tara en una cantidad inventada', () => {
    const result = line('supplier:3:videla')
    assert.equal(result.status, 'needs_review')
    assert.equal(result.observed.quantity, '2,09 PZ 6,76 KG')
    assert.equal(result.observed.tare, '10')
    assert.equal(result.proposal.physical_quantity, null)
    assert.ok(result.needs_review.includes('mixed_measurement_requires_review'))
  })

  it('marca contradicción económica y mapping ausente como needs_review, sin fallback', () => {
    const ametller = line('supplier:1:ametller')
    assert.equal(ametller.status, 'needs_review')
    assert.ok(ametller.needs_review.includes('line_amount_mismatch'))

    const fixture = fixtures.find((candidate) => candidate.profile_id === 'supplier:5:abril')!
    const profile = profileById.get(fixture.profile_id)!
    const result = interpretSupplierEvidence(profile, { ...fixture.evidence, item_mapping: 'missing' })
    assert.equal(result.lines[0]?.status, 'needs_review')
    assert.ok(result.lines[0]?.needs_review.includes('mapping_missing'))

    const unknownUnit = interpretSupplierEvidence(
      profileById.get('supplier:1:ametller')!,
      {
        ...fixtures.find((candidate) => candidate.profile_id === 'supplier:1:ametller')!.evidence,
        table: {
          headers: ['Descripción', 'Cantidad', 'Precio por unidad / kg', 'Importe'],
          rows: [{ Descripción: 'PRODUCTO DESCONOCIDO', Cantidad: '1 BOX', 'Precio por unidad / kg': '2,00', Importe: '2,00' }],
        },
      }
    )
    assert.ok(unknownUnit.lines[0]?.needs_review.includes('unknown_quantity_unit'))
  })

  it('no importa ni invoca K4, stock, precios ni RPCs', () => {
    const source = readFileSync(join(repoRoot, 'src/lib/albaranes/supplier-profiles/interpret.ts'), 'utf8')
    assert.doesNotMatch(source, /apply_receipt_line|\.rpc\(|stock_movements|current_price|price_history|\bPURCHASE\b/i)
  })
})
