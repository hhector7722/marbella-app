import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmployeeMatchResult } from '@/types/payroll-import';
import { PLANTILLA_EMPLOYEE_SELECT } from '../staff/plantilla-employees.ts';

export interface ProfileEmployeeCandidate {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  dni: string | null;
  payroll_name?: string | null;
}

/**
 * Extrae únicamente los apellidos de un nombre completo.
 * 1. Si contiene coma, extrae todo lo anterior a la coma.
 * 2. Si no contiene coma, intenta emparejar el texto completo contra el formato habitual
 *    almacenado en Employees (first_name + last_name o last_name + first_name) para aislar el apellido.
 */
export function extractLastName(fullName: string | null | undefined, profiles: ProfileEmployeeCandidate[] = []): string {
  if (!fullName) return '';
  const trimmed = fullName.trim();
  const commaIndex = trimmed.indexOf(',');
  
  if (commaIndex !== -1) {
    return trimmed.substring(0, commaIndex).trim();
  }

  // Si no hay coma, intentamos buscar el apellido usando el formato completo.
  const normalizedInput = normalizeLastName(trimmed);
  for (const p of profiles) {
    const first = p.first_name || '';
    const last = p.last_name || '';
    const format1 = normalizeLastName(`${first} ${last}`);
    const format2 = normalizeLastName(`${last} ${first}`);
    
    if (normalizedInput === format1 || normalizedInput === format2) {
      return last.trim();
    }
  }

  // Fallback si no coincide con ningún perfil
  return trimmed;
}

/**
 * Normaliza los apellidos para comparación exacta:
 * - Mayúsculas
 * - Elimina acentos
 * - Elimina caracteres especiales (comas, puntos, etc.)
 * - Elimina espacios duplicados
 * - Trim
 */
export function normalizeLastName(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
    .replace(/[^A-Z\s]/g, '')        // Eliminar caracteres especiales (comas, puntos, etc.)
    .replace(/\s+/g, ' ')            // Eliminar espacios duplicados
    .trim();
}

export class PayrollEmployeeNormalizer {
  private profiles: ProfileEmployeeCandidate[] = [];
  private readonly supabase?: SupabaseClient;

  constructor(supabase?: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Carga los perfiles de la base de datos o utiliza una lista inyectada en memoria.
   * Valida estrictamente que ningún empleado activo comparta los mismos apellidos normalizados.
   */
  async initialize(profilesList?: ProfileEmployeeCandidate[]): Promise<void> {
    if (profilesList) {
      this.profiles = profilesList;
    } else {
      if (!this.supabase) {
        throw new Error('SupabaseClient es necesario si no se inyecta profilesList');
      }

      const { data, error } = await this.supabase
        .from('profiles')
        .select('id, first_name, last_name, email, dni, payroll_name');

      if (error) {
        throw new Error(`Error cargando plantilla de empleados (profiles): ${error.message}`);
      }

      this.profiles = (data ?? []) as ProfileEmployeeCandidate[];
    }
  }

  /**
   * Resuelve un candidato contra la plantilla de perfiles
   * La asociación debe hacerse ÚNICAMENTE mediante los apellidos.
   */
  matchCandidate(input: {
    name?: string | null;
    dni?: string | null; // Se mantiene por compatibilidad de firma, pero no se usa para emparejar
    email?: string | null; // Se mantiene por compatibilidad de firma, pero no se usa para emparejar
    userId?: string | null; // Se mantiene por compatibilidad de firma, pero no se usa para emparejar
  }): EmployeeMatchResult {
    if (!input.name) {
      return {
        matched: false,
        userId: null,
        fullName: null,
        dni: null,
        email: null,
        matchMethod: 'none',
        errorMessage: 'No se proporcionó un nombre para extraer apellidos',
      };
    }

    // 1. Intentar coincidencia exacta con payroll_name (si está informado en el perfil)
    const normalizedRawInput = normalizeLastName(input.name); // Normalizamos todo el string de entrada de la gestoría
    const payrollNameMatches = this.profiles.filter((p) => {
      if (!p.payroll_name) return false;
      return normalizeLastName(p.payroll_name) === normalizedRawInput;
    });

    if (payrollNameMatches.length === 1) {
      const match = payrollNameMatches[0]!;
      return {
        matched: true,
        userId: match.id,
        fullName: `${match.first_name} ${match.last_name || ''}`.trim(),
        dni: match.dni,
        email: match.email,
        matchMethod: 'fullName',
      };
    } else if (payrollNameMatches.length > 1) {
      return {
        matched: false,
        userId: null,
        fullName: null,
        dni: null,
        email: null,
        matchMethod: 'none',
        errorMessage: `Ambigüedad: existen ${payrollNameMatches.length} empleados activos que comparten el mismo payroll_name normalizado: '${normalizedRawInput}'`,
      };
    }

    // 2. Si no hay coincidencia con payroll_name, usar algoritmo original por apellidos
    const extractedPdfLastName = extractLastName(input.name, this.profiles);
    const normalizedPdfLastName = normalizeLastName(extractedPdfLastName);

    if (!normalizedPdfLastName) {
      return {
        matched: false,
        userId: null,
        fullName: null,
        dni: null,
        email: null,
        matchMethod: 'none',
        errorMessage: `El nombre '${input.name}' no contiene apellidos válidos tras la extracción y normalización`,
      };
    }

    const matches = this.profiles.filter((p) => {
      const normalizedDbLastName = normalizeLastName(p.last_name);
      return normalizedDbLastName === normalizedPdfLastName;
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
        errorMessage: `Ambigüedad: Se encontraron ${matches.length} empleados con el apellido '${normalizedPdfLastName}'`,
      };
    }

    return {
      matched: false,
      userId: null,
      fullName: null,
      dni: null,
      email: null,
      matchMethod: 'none',
      errorMessage: `No existe coincidencia para el apellido '${normalizedPdfLastName}'`,
    };
  }
}
