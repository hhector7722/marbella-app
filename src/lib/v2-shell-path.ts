/**
 * Helper de chrome legacy: ¿esta ruta monta AppShell V2?
 * La fuente de verdad es `src/config/v2/registry.ts`.
 */

import { isRegisteredV2Path } from '@/config/v2'

export function isV2ShellPath(pathname: string): boolean {
  return isRegisteredV2Path(pathname)
}
