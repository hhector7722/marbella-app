import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
    preserveSessionOnFailedRefresh,
    readAccessTokenFromCookies,
    readAuthUserFromCookies,
} from './cookie-user.ts';

function b64urlJson(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('readAuthUserFromCookies', () => {
    it('lee user del JSON en una cookie base64', () => {
        const blob = `base64-${b64urlJson({
            access_token: 'aaa.bbb.ccc',
            user: { id: 'user-1', email: 'hector@lamarbella.com' },
        })}`;
        const cookies = [{ name: 'sb-abc-auth-token', value: blob }];
        const user = readAuthUserFromCookies(cookies);
        assert.deepEqual(user, { id: 'user-1', email: 'hector@lamarbella.com' });
        assert.equal(readAccessTokenFromCookies(cookies), 'aaa.bbb.ccc');
    });

    it('recompone cookies troceadas', () => {
        const blob = `base64-${b64urlJson({
            user: { id: 'user-2', email: 'staff@lamarbella.com' },
        })}`;
        const mid = Math.ceil(blob.length / 2);
        const user = readAuthUserFromCookies([
            { name: 'sb-abc-auth-token.1', value: blob.slice(mid) },
            { name: 'sb-abc-auth-token.0', value: blob.slice(0, mid) },
        ]);
        assert.deepEqual(user, { id: 'user-2', email: 'staff@lamarbella.com' });
    });

    it('prefiera la cookie entera si quedan trozos viejos', () => {
        const fresh = `base64-${b64urlJson({
            user: { id: 'user-3', email: 'hector@lamarbella.com' },
        })}`;
        const user = readAuthUserFromCookies([
            { name: 'sb-abc-auth-token', value: fresh },
            { name: 'sb-abc-auth-token.0', value: 'no-es-json' },
            { name: 'sb-abc-auth-token.1', value: 'trozo-viejo' },
        ]);
        assert.deepEqual(user, { id: 'user-3', email: 'hector@lamarbella.com' });
    });

    it('no borra la sesión si el refresh solo manda cookies vacías', () => {
        const kept = preserveSessionOnFailedRefresh([
            { name: 'sb-abc-auth-token', value: '' },
            { name: 'sb-abc-auth-token.0', value: '' },
            { name: 'other', value: 'ok' },
        ]);
        assert.deepEqual(kept, [{ name: 'other', value: 'ok' }]);
    });

    it('ignora code-verifier y cookies vacías', () => {
        assert.equal(
            readAuthUserFromCookies([
                { name: 'sb-abc-auth-token-code-verifier', value: 'xyz' },
                { name: 'sb-abc-auth-token', value: '' },
            ]),
            null
        );
    });

    it('el proxy y el home no tratan un getSession lento como logout', () => {
        const src = join(process.cwd(), 'src');
        const proxy = readFileSync(join(src, 'proxy.ts'), 'utf8');
        const home = readFileSync(join(src, 'app/page.tsx'), 'utf8');
        const master = readFileSync(join(src, 'app/master/dashboard/page.tsx'), 'utf8');
        assert.match(proxy, /readAuthUserFromCookies/);
        assert.doesNotMatch(proxy, /auth\.getSession\(/);
        assert.match(proxy, /preserveSessionOnFailedRefresh/);
        assert.doesNotMatch(proxy, /accessToken: async/);
        assert.match(home, /resolveSessionUser/);
        assert.match(master, /resolveSessionUser/);
        const server = readFileSync(join(src, 'utils/supabase/server.ts'), 'utf8');
        assert.doesNotMatch(server, /accessToken: async/);
        const history = readFileSync(join(src, 'app/actions/history-read.ts'), 'utf8');
        assert.match(history, /resolveSessionUser/);
        assert.doesNotMatch(history, /auth\.getSession\(/);
    });

    it('el proxy no redirige Server Actions a HTML de login o home', () => {
        const proxy = readFileSync(join(process.cwd(), 'src/proxy.ts'), 'utf8');
        assert.match(proxy, /function isServerActionRequest/);
        assert.match(proxy, /next-action/);
        assert.match(proxy, /if \(isAction\) \{\s*return response;/);
        assert.match(proxy, /if \(isAction\) \{\s*attachUsageTracking/);
    });
});
