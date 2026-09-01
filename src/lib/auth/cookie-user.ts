/**
 * Usuario de sesión leyendo las cookies de Supabase, sin round-trip a GoTrue.
 * El proxy y el SSR no pueden tratar un getSession lento o un 429 como “deslogueado”.
 */

export type CookieAuthUser = {
    id: string;
    email: string;
};

const AUTH_COOKIE = /^sb-.+-auth-token(?:\.(\d+))?$/;

export function isAuthSessionCookieName(name: string): boolean {
    return AUTH_COOKIE.test(name);
}

/**
 * Un refresh fallido (429, red) manda cookies de sesión vacías.
 * Si no hay un valor nuevo, no las borres: no es un logout.
 */
export function preserveSessionOnFailedRefresh<T extends { name: string; value: string }>(
    cookiesToSet: T[]
): T[] {
    const writesAuth = cookiesToSet.some(
        (cookie) => isAuthSessionCookieName(cookie.name) && cookie.value
    );
    if (writesAuth) return cookiesToSet;
    return cookiesToSet.filter(
        (cookie) => !isAuthSessionCookieName(cookie.name) || cookie.value
    );
}

function decodeBase64Url(value: string): string {
    return Buffer.from(value, 'base64url').toString('utf8');
}

function userFromJwt(accessToken: string): CookieAuthUser | null {
    const parts = accessToken.split('.');
    if (parts.length < 2) return null;
    try {
        const payload = JSON.parse(decodeBase64Url(parts[1])) as {
            sub?: string;
            email?: string;
        };
        if (!payload.sub) return null;
        return { id: payload.sub, email: payload.email ?? '' };
    } catch {
        return null;
    }
}

function parseSessionBlob(raw: string): {
    user: CookieAuthUser | null;
    accessToken: string | null;
} {
    let text = raw;
    if (raw.startsWith('base64-')) {
        text = decodeBase64Url(raw.slice('base64-'.length));
    }
    try {
        const data = JSON.parse(text) as {
            access_token?: string;
            user?: { id?: string; email?: string | null };
        };
        const accessToken =
            typeof data.access_token === 'string' ? data.access_token : null;
        if (data.user?.id) {
            return {
                user: { id: data.user.id, email: data.user.email ?? '' },
                accessToken,
            };
        }
        if (accessToken) {
            return { user: userFromJwt(accessToken), accessToken };
        }
        return { user: null, accessToken: null };
    } catch {
        const user = userFromJwt(raw);
        return { user, accessToken: user ? raw : null };
    }
}

function joinConsecutiveChunks(chunks: Map<number, string>): string | null {
    if (!chunks.has(0)) return null;
    const parts: string[] = [];
    for (let index = 0; chunks.has(index); index += 1) {
        parts.push(chunks.get(index) as string);
    }
    return parts.join('');
}

function sessionBlobCandidates(
    cookies: Array<{ name: string; value: string }>
): string[] {
    const groups = new Map<
        string,
        { unchunked: string | null; chunks: Map<number, string> }
    >();

    for (const cookie of cookies) {
        const match = cookie.name.match(AUTH_COOKIE);
        if (!match || !cookie.value) continue;
        const base =
            match[1] === undefined
                ? cookie.name
                : cookie.name.slice(0, cookie.name.lastIndexOf('.'));
        let group = groups.get(base);
        if (!group) {
            group = { unchunked: null, chunks: new Map() };
            groups.set(base, group);
        }
        if (match[1] === undefined) {
            group.unchunked = cookie.value;
        } else {
            group.chunks.set(Number(match[1]), cookie.value);
        }
    }

    const candidates: string[] = [];
    for (const group of groups.values()) {
        if (group.unchunked) candidates.push(group.unchunked);
        const joined = joinConsecutiveChunks(group.chunks);
        if (joined) candidates.push(joined);
    }
    return candidates;
}

/**
 * Misma prioridad que @supabase/ssr: cookie entera primero.
 * Si quedan trozos viejos (.1) junto a una cookie nueva, no los concatenes.
 */
export function readAuthUserFromCookies(
    cookies: Array<{ name: string; value: string }>
): CookieAuthUser | null {
    for (const raw of sessionBlobCandidates(cookies)) {
        const parsed = parseSessionBlob(raw);
        if (parsed.user) return parsed.user;
    }
    return null;
}

/** JWT de la cookie para PostgREST, sin pedir uno nuevo a Auth. */
export function readAccessTokenFromCookies(
    cookies: Array<{ name: string; value: string }>
): string | null {
    for (const raw of sessionBlobCandidates(cookies)) {
        const parsed = parseSessionBlob(raw);
        if (parsed.accessToken) return parsed.accessToken;
    }
    return null;
}
