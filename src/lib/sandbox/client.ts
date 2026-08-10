let originalPrint: (() => void) | null = null;

export function navigateInsideSandbox(href: string): boolean {
    if (typeof window === 'undefined' || !window.__MARBELLA_SANDBOX_NAVIGATE__) return false;
    return window.__MARBELLA_SANDBOX_NAVIGATE__(href);
}

export function enableSandboxRuntime(
    navigate: (href: string) => boolean,
    visual?: { surface: number; elevation: number; buttonWeight: string },
): void {
    if (typeof window === 'undefined') return;
    window.__MARBELLA_SANDBOX__ = true;
    window.__MARBELLA_SANDBOX_NAVIGATE__ = navigate;
    document.documentElement.dataset.marbellaSandbox = 'true';
    if (visual) {
        document.documentElement.dataset.dlSurface = String(visual.surface);
        document.documentElement.dataset.dlElevation = String(visual.elevation);
        document.documentElement.dataset.dlButtons = visual.buttonWeight;
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
