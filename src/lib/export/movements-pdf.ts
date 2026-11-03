'use client';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadBlob } from '@/lib/export/browser-output';

export type MovementExportRow = {
    date: string;
    concept: string;
    amount: string;
    balance: string;
};

const NAVY: [number, number, number] = [21, 52, 92]; // color.envolvente
const WHITE: [number, number, number] = [255, 255, 255];
const BORDER: [number, number, number] = [217, 226, 236]; // color.borde.impreso
const TEXT: [number, number, number] = [24, 24, 27];
const MUTED: [number, number, number] = [82, 82, 91];
const LEFT = 40;
const RIGHT = 40;
const TABLE_Y = 136;

function loadBrandLogo(): Promise<HTMLImageElement | null> {
    const image = new Image();
    image.src = '/icons/logo-white.png';
    return image.decode().then(() => image).catch(() => null);
}

/** PDF nativo con texto seleccionable, salto de página automático y descarga directa. */
export async function downloadMovementsPdf(
    rows: MovementExportRow[],
    periodLabel: string,
    filename: string,
): Promise<void> {
    const logo = await loadBrandLogo();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const tableWidth = pageWidth - LEFT - RIGHT;

    const drawDocumentHeader = () => {
        if (logo) {
            doc.addImage(logo, 'PNG', LEFT, 29, 64, 66);
        }
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...TEXT);
        doc.setFontSize(11);
        doc.text('Movimientos de tesorería', LEFT + 80, 58);
        doc.setFontSize(9);
        doc.setTextColor(...MUTED);
        doc.text(`Período: ${periodLabel}`, LEFT + 80, 76);
    };

    autoTable(doc, {
        startY: TABLE_Y,
        margin: { top: TABLE_Y, left: LEFT, right: RIGHT, bottom: 42 },
        head: [['FECHA', 'CONCEPTO', 'IMPORTE', 'SALDO']],
        body: rows.map((row) => [row.date, row.concept, row.amount, row.balance]),
        showHead: 'everyPage',
        theme: 'plain',
        styles: {
            font: 'helvetica',
            fontSize: 9,
            textColor: TEXT,
            fillColor: WHITE,
            lineWidth: 0,
            cellPadding: { top: 9, bottom: 9, left: 10, right: 10 },
            minCellHeight: 26,
            valign: 'middle',
        },
        headStyles: {
            fillColor: NAVY,
            textColor: WHITE,
            fontStyle: 'bold',
            fontSize: 8,
            halign: 'center',
            minCellHeight: 28,
        },
        columnStyles: {
            0: { cellWidth: 87, halign: 'center' },
            1: { cellWidth: tableWidth - 87 - 83 - 83 },
            2: { cellWidth: 83, halign: 'right' },
            3: { cellWidth: 83, halign: 'right' },
        },
        didDrawCell: (data) => {
            if (data.section === 'head' && (data.column.index === 0 || data.column.index === 3)) {
                // Redondear solo las esquinas superiores sobre la cabecera azul.
                // El fondo de cada celda lo pinta autoTable para evitar el bloque negro.
                const radius = 9;
                doc.setFillColor(...WHITE);
                for (let y = 0; y < radius; y += 0.5) {
                    const distance = radius - (y + 0.25);
                    const outside = radius - Math.sqrt(radius * radius - distance * distance);
                    const x = data.column.index === 0
                        ? data.cell.x
                        : data.cell.x + data.cell.width - outside;
                    doc.rect(x, data.cell.y + y, outside, 0.55, 'F');
                }
            }
            if (data.section === 'body') {
                doc.setDrawColor(...BORDER);
                doc.setLineWidth(0.35);
                doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
            }
        },
        didDrawPage: () => {
            drawDocumentHeader();
        },
    });

    downloadBlob(doc.output('blob'), filename);
}
