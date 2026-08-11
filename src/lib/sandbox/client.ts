let originalPrint: (() => void) | null = null;
let originalPushState: History['pushState'] | null = null;
let originalReplaceState: History['replaceState'] | null = null;

export function navigateInsideSandbox(href: string): boolean {
    if (typeof window === 'undefined' || !window.__MARBELLA_SANDBOX_NAVIGATE__) return false;
    return window.__MARBELLA_SANDBOX_NAVIGATE__(href);
}

export function pushSandboxUrl(url: string): void {
    if (typeof window === 'undefined') return;
    if (originalPushState) originalPushState.call(window.history, {}, '', url);
    else window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
}

export function enableSandboxRuntime(
    navigate: (href: string) => boolean,
): void {
    if (typeof window === 'undefined') return;
    window.__MARBELLA_SANDBOX__ = true;
    window.__MARBELLA_SANDBOX_NAVIGATE__ = navigate;
    if (!originalPushState) {
        originalPushState = window.history.pushState.bind(window.history);
        originalReplaceState = window.history.replaceState.bind(window.history);
        window.history.pushState = ((state: unknown, title: string, url?: string | URL | null) => {
            if (url != null && window.__MARBELLA_SANDBOX_NAVIGATE__?.(String(url))) return;
            originalPushState?.call(window.history, state, title, url);
        }) as History['pushState'];
        window.history.replaceState = ((state: unknown, title: string, url?: string | URL | null) => {
            if (url != null && window.__MARBELLA_SANDBOX_NAVIGATE__?.(String(url))) return;
            originalReplaceState?.call(window.history, state, title, url);
        }) as History['replaceState'];
    }
    if (!originalPrint) originalPrint = window.print.bind(window);
    window.print = () => {
        window.dispatchEvent(new CustomEvent('marbella-sandbox-write', {
            detail: { operation: 'Impresión', resource: 'window.print' },
        }));
    };
}

export function disableSandboxRuntime(): void {
    if (typeof window === 'undefined') return;
    window.__MARBELLA_SANDBOX__ = false;
    window.__MARBELLA_SANDBOX_NAVIGATE__ = undefined;
    if (originalPushState) window.history.pushState = originalPushState;
    if (originalReplaceState) window.history.replaceState = originalReplaceState;
    originalPushState = null;
    originalReplaceState = null;
    // Limpia atributos que puedan haber quedado de una sesión del sandbox anterior.
    delete document.documentElement.dataset.marbellaSandbox;
    delete document.documentElement.dataset.dlSurface;
    delete document.documentElement.dataset.dlElevation;
    delete document.documentElement.dataset.dlButtons;
    if (originalPrint) {
        window.print = originalPrint;
        originalPrint = null;
    }
}

declare global {
    interface Window {
        __MARBELLA_SANDBOX_NAVIGATE__?: (href: string) => boolean;
    }
}
