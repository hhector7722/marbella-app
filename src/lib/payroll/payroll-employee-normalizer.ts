import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmployeeMatchResult } from '@/types/payroll-import';
import { PLANTILLA_EMPLOYEE_SELECT } from '../staff/plantilla-employees.ts';

export interface ProfileEmployeeCandidate {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  dni: string | null;
}

export function cleanDni(dni: string | null | undefined): string | null {
  if (!dni) return null;
  const cleaned = dni.trim().replace(/[\s\-]/g, '').toUpperCase();
  return cleaned || null;
}

export function normalizeText(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export class PayrollEmployeeNormalizer {
  private profiles: ProfileEmployeeCandidate[] = [];

  constructor(private readonly supabase?: SupabaseClient) {}

  /**
   * Carga los perfiles de la base de datos o utiliza una lista inyectada en memoria
   */
  async initialize(profilesList?: ProfileEmployeeCandidate[]): Promise<void> {
    if (profilesList) {
      this.profiles = profilesList;
      return;
    }

    if (!this.supabase) {
      throw new Error('SupabaseClient es necesario si no se inyecta profilesList');
    }

    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, first_name, last_name, email, dni');

    if (error) {
      throw new Error(`Error cargando plantilla de empleados (profiles): ${error.message}`);
    }

    this.profiles = (data ?? []) as ProfileEmployeeCandidate[];
  }

  /**
   * Resuelve un candidato contra la plantilla de perfiles
   */
  matchCandidate(input: {
    userId?: string | null;
    dni?: string | null;
    email?: string | null;
    name?: string | null;
  }): EmployeeMatchResult {
    // 1. Coincidencia por userId directo
    if (input.userId) {
      const match = this.profiles.find((p) => p.id === input.userId);
      if (match) {
        return {
          matched: true,
          userId: match.id,
          fullName: `${match.first_name} ${match.last_name || ''}`.trim(),
          dni: match.dni,
          email: match.email,
          matchMethod: 'userId',
        };
      }
    }

    // 2. Coincidencia por DNI / NIF
    const inputDni = cleanDni(input.dni);
    if (inputDni) {
      const matches = this.profiles.filter((p) => cleanDni(p.dni) === inputDni);
      if (matches.length === 1) {
        const match = matches[0]!;
        return {
          matched: true,
          userId: match.id,
          fullName: `${match.first_name} ${match.last_name || ''}`.trim(),
          dni: match.dni,
          email: match.email,
          matchMethod: 'dni',
        };
      } else if (matches.length > 1) {
        return {
          matched: false,
          userId: null,
          fullName: null,
          dni: inputDni,
          email: null,
          matchMethod: 'none',
          errorMessage: `Ambigüedad: Se encontraron ${matches.length} empleados con el DNI ${inputDni}`,
        };
      }
    }

    // 3. Coincidencia por Email
    if (input.email) {
      const inputEmail = input.email.trim().toLowerCase();
      const matches = this.profiles.filter(
        (p) => p.email && p.email.trim().toLowerCase() === inputEmail,
      );
      if (matches.length === 1) {
        const match = matches[0]!;
        return {
          matched: true,
          userId: match.id,
          fullName: `${match.first_name} ${match.last_name || ''}`.trim(),
          dni: match.dni,
          email: match.email,
          matchMethod: 'email',
        };
      }
    }

    // 4. Coincidencia por Nombre Completo
    if (input.name) {
      const inputNorm = normalizeText(input.name);
      if (inputNorm) {
        const matches = this.profiles.filter((p) => {
          const fullNameNorm = normalizeText(`${p.first_name} ${p.last_name || ''}`);
          const reverseNameNorm = normalizeText(`${p.last_name || ''} ${p.first_name}`);
          return fullNameNorm === inputNorm || reverseNameNorm === inputNorm;
        });

        if (matches.length === 1) {
          const match = matches[0]!;
          return {
            matched: true,
            userId: match.id,
            fullName: `${match.first_name} ${match.last_name || ''}`.trim(),
            dni: match.dni,
            email: match.email,
            matchMethod: 'fullName',
          };
        } else if (matches.length > 1) {
          return {
            matched: false,
            userId: null,
            fullName: null,
            dni: null,
            email: null,
            matchMethod: 'none',
            errorMessage: `Ambigüedad: Se encontraron ${matches.length} empleados coincidentes con el nombre '${input.name}'`,
          };
        }
      }
    }

    return {
      matched: false,
      userId: null,
      fullName: null,
      dni: input.dni ?? null,
      email: input.email ?? null,
      matchMethod: 'none',
      errorMessage: `No se encontró ningún empleado en profiles para: DNI="${input.dni || ''}", Email="${input.email || ''}", Nombre="${input.name || ''}"`,
    };
  }
}
