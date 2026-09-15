import { createHash } from 'node:crypto'
import type { SupplierProfile } from '../supplier-profiles/types.ts'

import abril from '../../../../marbella-os/3-ingenieria/albaranes-proveedores/profiles/abril.v1.json' with { type: 'json' }
import ametller from '../../../../marbella-os/3-ingenieria/albaranes-proveedores/profiles/ametller.v1.json' with { type: 'json' }
import carnicasPijuan from '../../../../marbella-os/3-ingenieria/albaranes-proveedores/profiles/carnicas-pijuan.v1.json' with { type: 'json' }
import cava from '../../../../marbella-os/3-ingenieria/albaranes-proveedores/profiles/cava.v1.json' with { type: 'json' }
import fritzRavich from '../../../../marbella-os/3-ingenieria/albaranes-proveedores/profiles/fritz-ravich.v1.json' with { type: 'json' }
import hieloFenix from '../../../../marbella-os/3-ingenieria/albaranes-proveedores/profiles/hielo-fenix.v1.json' with { type: 'json' }
import meritem from '../../../../marbella-os/3-ingenieria/albaranes-proveedores/profiles/meritem.v1.json' with { type: 'json' }
import nestle from '../../../../marbella-os/3-ingenieria/albaranes-proveedores/profiles/nestle.v1.json' with { type: 'json' }
import panabad from '../../../../marbella-os/3-ingenieria/albaranes-proveedores/profiles/panabad.v1.json' with { type: 'json' }
import sanilec from '../../../../marbella-os/3-ingenieria/albaranes-proveedores/profiles/sanilec.v1.json' with { type: 'json' }
import santAniol from '../../../../marbella-os/3-ingenieria/albaranes-proveedores/profiles/sant-aniol.v1.json' with { type: 'json' }
import santaTeresa from '../../../../marbella-os/3-ingenieria/albaranes-proveedores/profiles/santa-teresa.v1.json' with { type: 'json' }
import shers from '../../../../marbella-os/3-ingenieria/albaranes-proveedores/profiles/shers.v1.json' with { type: 'json' }
import vermut from '../../../../marbella-os/3-ingenieria/albaranes-proveedores/profiles/vermut.v1.json' with { type: 'json' }
import videla from '../../../../marbella-os/3-ingenieria/albaranes-proveedores/profiles/videla.v1.json' with { type: 'json' }
import vino from '../../../../marbella-os/3-ingenieria/albaranes-proveedores/profiles/vino.v1.json' with { type: 'json' }

function sortRecursively(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortRecursively)
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, sortRecursively(source[key])])
    )
  }
  return value
}

export function canonicalProfileJson(profile: SupplierProfile): string {
  return JSON.stringify(sortRecursively(profile))
}

export function hashSupplierProfile(profile: SupplierProfile): string {
  return createHash('sha256').update(canonicalProfileJson(profile), 'utf8').digest('hex')
}

const profiles = [
  abril,
  ametller,
  carnicasPijuan,
  cava,
  fritzRavich,
  hieloFenix,
  meritem,
  nestle,
  panabad,
  sanilec,
  santAniol,
  santaTeresa,
  shers,
  vermut,
  videla,
  vino,
] as SupplierProfile[]

const bySupplierId = new Map(profiles.map((profile) => [profile.supplier.id, profile]))

export function supplierProfileForId(supplierId: number): SupplierProfile | null {
  return bySupplierId.get(supplierId) ?? null
}

export function allSupplierProfiles(): readonly SupplierProfile[] {
  return profiles
}

export type VersionedSupplierProfile = {
  profile: SupplierProfile
  hash: string
}

export function versionedSupplierProfileForId(supplierId: number): VersionedSupplierProfile | null {
  const profile = supplierProfileForId(supplierId)
  if (!profile) return null
  return { profile, hash: hashSupplierProfile(profile) }
}
