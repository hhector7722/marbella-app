/**
 * Asegura Extra 1, Extra 2 y Extra 3.
 * No forma parte del arranque de la app. Ejecutar a mano:
 *   npm run bootstrap:managed-extras
 */
import { createAltaServiceClient } from '../src/lib/alta-laboral/service-client.ts';
import { ensureManagedExtraSlots } from '../src/lib/staff/ensure-managed-extra-slots.ts';

const result = await ensureManagedExtraSlots(createAltaServiceClient());
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}

console.log(
  result.slots
    .map((slot) => `Extra ${slot.slot} ${slot.created ? 'creado' : 'ya existía'}`)
    .join('\n'),
);
