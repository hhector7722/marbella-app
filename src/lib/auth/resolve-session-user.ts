import { cookies } from 'next/headers';
import { readAuthUserFromCookies, type CookieAuthUser } from '@/lib/auth/cookie-user';

type SessionClient = {
    auth: {
        getSession: () => PromiseLike<{
            data: { session: { user?: { id?: string; email?: string | null } | null } | null };
        }>;
    };
};

/**
 * Usuario de la petición: JWT en cookies. No llama a GoTrue.
 * Un 429 o un getSession lento no es un logout.
 */
export async function resolveSessionUser(
    _supabase?: SessionClient,
    _timeoutMs = 1500
): Promise<CookieAuthUser | null> {
    return readAuthUserFromCookies((await cookies()).getAll());
}
