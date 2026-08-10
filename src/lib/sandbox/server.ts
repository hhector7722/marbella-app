import { cookies } from 'next/headers';

/** Marca de sesión para impedir mutaciones desde páginas reales montadas en el sandbox. */
export async function isSandboxRequest(): Promise<boolean> {
    return (await cookies()).get('marbella-sandbox')?.value === '1';
}
