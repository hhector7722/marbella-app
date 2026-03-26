import { ParsedQuery } from './types';

export class RBACValidator {
  validateAccess(userRole: 'staff' | 'manager', parsed: ParsedQuery): boolean {
    if (userRole === 'staff') {
      // Staff: restringimos ventas y tesorería por seguridad operativa.
      if (['sales', 'treasury'].includes(parsed.type)) return false;
    }

    return true;
  }
}

