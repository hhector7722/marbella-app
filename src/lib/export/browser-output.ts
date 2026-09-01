/**
 * Salida de ficheros e impresión en el navegador.
 *
 * `XLSX.writeFile` y `<a download>` sin insertar el nodo fallan en Safari / PWA.
 * `iframe.print()` queda en blanco o lo bloquea el gesto de usuario.
 * El diálogo de impresión usa `#marbella-print-container` (ver globals.css).
 */

import * as XLSX from 'xlsx';

export const MARBELLA_PRINT_CONTAINER_ID = 'marbella-print-container';

const XLSX_MIME =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const DEFAULT_PRINT_TABLE_CSS = `
  * { box-sizing: border-box; }
  h1 { font-size: 18px; margin: 0 0 12px; font-weight: 800; }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    background: #36606F; color: white;
    text-transform: uppercase; letter-spacing: 0.12em;
    font-weight: 800; font-size: 11px;
    padding: 10px 12px;
  }
  tbody td {
    border-top: 1px solid #f4f4f5;
    padding: 10px 12px;
    font-size: 12px;
    vertical-align: top;
  }
  tbody tr:nth-child(even) td { background: #fafafa; }
`;

export function downloadBlob(data: Blob, filename: string): void {
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
    }, 1_000);
}

export function downloadWorkbook(wb: XLSX.WorkBook, filename: string): void {
    const raw = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
    const source = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayLike<number>);
    const copy = new Uint8Array(source.byteLength);
    copy.set(source);
    downloadBlob(new Blob([copy.buffer as ArrayBuffer], { type: XLSX_MIME }), filename);
}

export function printHtml(
    bodyHtml: string,
    options?: { extraCss?: string; pageSize?: 'portrait' | 'landscape' },
): void {
    document.getElementById(MARBELLA_PRINT_CONTAINER_ID)?.remove();
    document.body.classList.remove('marbella-printing');

    const container = document.createElement('div');
    container.id = MARBELLA_PRINT_CONTAINER_ID;
    const pageSize = options?.pageSize ?? 'portrait';
    const extraCss = options?.extraCss ?? '';
    container.innerHTML = `<style>@page { size: ${pageSize}; } ${DEFAULT_PRINT_TABLE_CSS} ${extraCss}</style>${bodyHtml}`;
    document.body.appendChild(container);
    document.body.classList.add('marbella-printing');

    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        window.removeEventListener('afterprint', cleanup);
        document.body.classList.remove('marbella-printing');
        container.remove();
    };

    window.addEventListener('afterprint', cleanup);
    window.print();
    window.setTimeout(cleanup, 60_000);
}
