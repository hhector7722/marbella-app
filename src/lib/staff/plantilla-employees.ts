export const HIDDEN_PLANTILLA_FIRST_NAMES = new Set(['ramon', 'ramón', 'empleado']);

export const PLANTILLA_EMPLOYEE_SELECT =
    'id, first_name, last_name, avatar_url, visible_in_plantilla, role, email, end_date, is_supervisor' as const;

export type PlantillaEmployeeRow = {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    avatar_url?: string | null;
    end_date?: string | null;
    visible_in_plantilla?: boolean | null;
};

export function isHiddenPlantillaName(firstName?: string | null): boolean {
    const name = (firstName || '').trim().toLowerCase();
    return HIDDEN_PLANTILLA_FIRST_NAMES.has(name);
}

/** Perfil visible en selectores de empleado (propinas, consumo, labor, etc.). */
export function isVisibleInEmployeeSelectors(profile: {
    first_name?: string | null;
    visible_in_plantilla?: boolean | null;
}): boolean {
    if (isHiddenPlantillaName(profile.first_name)) return false;
    return profile.visible_in_plantilla !== false;
}

export function filterVisiblePlantillaEmployees<T extends PlantillaEmployeeRow>(
    employees: T[],
): T[] {
    return employees.filter(isVisibleInEmployeeSelectors);
}
