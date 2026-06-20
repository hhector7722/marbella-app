const MAX_SNAPSHOTS = 6;
const MAX_HTML_CHARS = 500_000;

export type TabSnapshot = {
  html: string;
  scrollTop: number;
  capturedAt: number;
};

const snapshotCache = new Map<string, TabSnapshot>();

function findScrollRoot(container: HTMLElement): HTMLElement {
  const marked = container.querySelector('[data-marbella-scroll-root]');
  if (marked instanceof HTMLElement) return marked;

  const main = container.querySelector('main');
  if (main instanceof HTMLElement) return main;

  return container;
}

function trimCache(): void {
  if (snapshotCache.size <= MAX_SNAPSHOTS) return;

  const oldest = [...snapshotCache.entries()].sort(
    (a, b) => a[1].capturedAt - b[1].capturedAt
  );

  while (snapshotCache.size > MAX_SNAPSHOTS && oldest.length > 0) {
    const [key] = oldest.shift()!;
    snapshotCache.delete(key);
  }
}

export function captureTabSnapshot(path: string, container: HTMLElement): void {
  const scrollRoot = findScrollRoot(container);
  const html = scrollRoot.innerHTML;

  snapshotCache.set(path, {
    html: html.length > MAX_HTML_CHARS ? html.slice(0, MAX_HTML_CHARS) : html,
    scrollTop: scrollRoot.scrollTop,
    capturedAt: Date.now(),
  });

  trimCache();
}

export function getTabSnapshot(path: string): TabSnapshot | null {
  return snapshotCache.get(path) ?? null;
}

export function hasTabSnapshot(path: string): boolean {
  return snapshotCache.has(path);
}

export function clearTabSnapshot(path: string): void {
  snapshotCache.delete(path);
}

export function clearAllTabSnapshots(): void {
  snapshotCache.clear();
}

export function capturePageShellSnapshot(): string | null {
  if (typeof document === 'undefined') return null;

  const shell = document.querySelector('.marbella-page-shell');
  if (!(shell instanceof HTMLElement)) return null;

  const scrollRoot = findScrollRoot(shell);
  const html = scrollRoot.innerHTML;
  if (!html) return null;

  return html.length > MAX_HTML_CHARS ? html.slice(0, MAX_HTML_CHARS) : html;
}
