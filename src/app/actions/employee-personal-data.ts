'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { isSandboxRequest } from '@/lib/sandbox/server';

export type EmployeePersonalDataInput = {
    firstName: string;
    lastName: string;
    dni: string;
    afiliacionSeguridadSocial: string;
    nacionalidad: string;
    fechaNacimiento: string;
    domicilio: string;
    phone: string;
    email: string;
};

const MAX_LENGTH = 200;

function clean(value: string): string | null {
    const v = String(value ?? '').trim();
    return v === '' ? null : v;
}

function isValidYmd(value: string | null): boolean {
    if (value == null) return true;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) return false;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const date = new Date(y, mo - 1, d);
    return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

function isValidEmail(value: string | null): boolean {
    if (value == null) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function requireManagerSession() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email || !isMasterDashboardUser(user.email)) {
        return { ok: false as const, error: 'Acceso denegado', supabase: null };
    }
    return { ok: true as const, error: null, supabase };
}

export async function updateEmployeePersonalData(
    employeeId: string,
    input: EmployeePersonalDataInput,
): Promise<{ success: boolean; error?: string; simulated?: boolean }> {
    if (await isSandboxRequest()) {
        return { success: true, simulated: true, error: undefined };
    }

    const gate = await requireManagerSession();
    if (!gate.ok || !gate.supabase) {
        return { success: false, error: gate.error ?? 'Acceso denegado' };
    }

    const supabase = gate.supabase;
    const id = String(employeeId ?? '').trim();
    if (!id) return { success: false, error: 'Empleado no indicado' };

    const patch = {
        first_name: clean(input.firstName),
        last_name: clean(input.lastName),
        dni: clean(input.dni),
        afiliacion_seguridad_social: clean(input.afiliacionSeguridadSocial),
        nacionalidad: clean(input.nacionalidad),
        fecha_nacimiento: clean(input.fechaNacimiento),
        domicilio: clean(input.domicilio),
        phone: clean(input.phone),
        email: clean(input.email),
    };

    for (const value of Object.values(patch)) {
        if (value != null && value.length > MAX_LENGTH) {
            return { success: false, error: 'Algún campo supera el máximo permitido' };
        }
    }

    if (!patch.first_name) {
        return { success: false, error: 'El nombre es obligatorio' };
    }
    if (!isValidEmail(patch.email)) {
        return { success: false, error: 'Correo electrónico no válido' };
    }
    if (!isValidYmd(patch.fecha_nacimiento)) {
        return { success: false, error: 'Fecha de nacimiento no válida' };
    }

    const { error } = await supabase.from('profiles').update(patch).eq('id', id);
    if (error) {
        return { success: false, error: error.message };
    }

    revalidatePath('/profile');
    return { success: true };
}