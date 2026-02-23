
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface OrderItem {
    name: string;
    quantity: number;
    unit: string;
    price: number;
    image?: string | null;
}

interface OrderData {
    supplierName: string;
    items: OrderItem[];
    orderNumber: string;
}

const COMPANY_INFO = {
    name: 'Fogo Torrat S.L.',
    nif: 'NIF : B09761628',
    address: 'Av. Litoral 86, 080055, Barcelona',
    phone: '647229309',
    email: 'fogotorrat@gmail.com'
};

const COLORS = {
    primary: [54, 96, 111] as [number, number, number], // #36606F
    secondaryLine: [120, 170, 190] as [number, number, number], // Lighter blue for wave line
    text: [30, 41, 59] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    tableHeader: [54, 96, 111] as [number, number, number],
};

export async function generateOrderPDF(data: OrderData): Promise<Blob> {
    console.log("PDF GENERATOR V6.0: Precise visual correction");

    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    }) as any;

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;

    // --------------------------------------------------------------------------
    // 0. PRE-LOAD IMAGES
    // --------------------------------------------------------------------------
    const logoUrl = '/icons/logo-white.png';
    const logoPromise = loadImage(logoUrl).catch(() => null);

    const productImages = await Promise.all(
        data.items.map(async (item) => {
            if (!item.image) return null;
            try {
                return await loadImage(item.image);
            } catch (e) {
                return null;
            }
        })
    );

    const logoImage = await logoPromise;

    // --------------------------------------------------------------------------
    // 1. LOGO & TITLE/DATE (Top Row)
    // --------------------------------------------------------------------------
    let currentY = 15;
    const SPACING = 5;

    // Logo on the left (Floating directly on white)
    if (logoImage) {
        doc.addImage(logoImage, 'PNG', margin, currentY, 24, 24);
    }

    // "Pedido" and Date on the right
    doc.setTextColor(50, 50, 50);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(28);
    doc.text('Pedido', pageWidth - margin, currentY + 12, { align: 'right' });

    const today = format(new Date(), "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
    const formattedDate = today.charAt(0).toUpperCase() + today.slice(1);
    doc.setFontSize(14);
    doc.setTextColor(100, 100, 100);
    doc.text(formattedDate, pageWidth - margin, currentY + 22, { align: 'right' });

    // Dynamic Y calculation after Title/Date block
    currentY += 32;

    // --------------------------------------------------------------------------
    // 2. COMPANY INFO (Supplier)
    // --------------------------------------------------------------------------
    const infoX = margin;

    doc.setTextColor(54, 96, 111); // Dark Teal
    doc.setFontSize(18); // Slightly smaller for better fit
    doc.setFont('helvetica', 'bold');

    // Draw Name and get its height
    doc.text(COMPANY_INFO.name, infoX, currentY);
    const nameDim = doc.getTextDimensions(COMPANY_INFO.name);
    currentY += nameDim.h / 2 + 3;

    doc.setFontSize(9); // Leaner fonts
    doc.setTextColor(110, 110, 110);
    doc.setFont('helvetica', 'normal');

    const infoLines = [
        COMPANY_INFO.nif,
        COMPANY_INFO.address,
        COMPANY_INFO.phone,
        COMPANY_INFO.email
    ];

    infoLines.forEach(line => {
        doc.text(line, infoX, currentY);
        const dim = doc.getTextDimensions(line);
        currentY += dim.h + 1.2; // Minimal line height
    });

    // --------------------------------------------------------------------------
    // 3. TABLE (Bento Grid Design)
    // --------------------------------------------------------------------------
    const startTableY = currentY + 6; // Compact gap before table

    autoTable(doc, {
        startY: startTableY,
        head: [['Producto', 'Cantidad', 'Unidad']],
        body: data.items.map(item => [item.name, item.quantity, item.unit]),
        theme: 'plain',

        styles: {
            font: 'helvetica',
            fontSize: 11,
            textColor: [60, 60, 60],
            cellPadding: { top: 9, bottom: 9, left: 10, right: 10 },
            valign: 'middle',
            minCellHeight: 28
        },

        headStyles: {
            fillColor: null as any, // We will draw it manually in willDrawCell for rounding
            textColor: [255, 255, 255],
            fontSize: 9, // Slimmer font
            fontStyle: 'bold',
            halign: 'center',
            cellPadding: { top: 2, bottom: 2, left: 10, right: 10 } // Slimmer height
        },

        columnStyles: {
            0: { halign: 'left' },
            1: { halign: 'center', cellWidth: 40 },
            2: { halign: 'center', cellWidth: 40 }
        },

        bodyStyles: {
            fillColor: [255, 255, 255]
        },

        willDrawCell: function (data) {
            // Round top corners of the header
            if (data.section === 'head' && data.row.index === 0) {
                doc.setFillColor(54, 96, 111);
                const radius = 8;
                const x = data.cell.x;
                const y = data.cell.y;
                const w = data.cell.width;
                const h = data.cell.height;

                if (data.column.index === 0) {
                    // Leftmost cell: round top-left
                    doc.roundedRect(x, y, w, h + radius, radius, radius, 'F');
                } else if (data.column.index === data.table.columns.length - 1) {
                    // Rightmost cell: round top-right
                    doc.roundedRect(x, y, w, h + radius, radius, radius, 'F');
                } else {
                    // Middle cells: just fill
                    doc.rect(x - 0.2, y, w + 0.4, h + radius, 'F');
                }
            }
        },

        didDrawCell: function (data) {
            // Product Images in Column 0
            if (data.section === 'body' && data.column.index === 0) {
                const rowIndex = data.row.index;
                const image = productImages[rowIndex];
                if (image) {
                    const cell = data.cell;
                    const imgSize = 18;
                    const x = cell.x + 8;
                    const y = cell.y + (cell.height - imgSize) / 2;
                    doc.addImage(image, 'PNG', x, y, imgSize, imgSize);
                }
            }

            // Bottom Border for rows (except last one)
            if (data.section === 'body' && data.row.index < data.table.body.length - 1) {
                doc.setDrawColor(240, 240, 240);
                doc.setLineWidth(0.1);
                doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
            }
        },

        didParseCell: function (data: any) {
            if (data.section === 'body' && data.column.index === 0) {
                data.cell.styles.cellPadding = { left: 35, top: 9, bottom: 9, right: 10 };
            }
        },

        margin: { left: margin, right: margin },

        didDrawPage: function (data_table) {
            const tableWidth = pageWidth - (margin * 2);
            const tableHeight = data_table.cursor!.y - startTableY;

            // DRAW SHADOWED OUTLINE
            // We draw multiple layers with increasing thickness and lighter colors to simulate a shadow
            doc.setDrawColor(240, 240, 240);
            doc.setLineWidth(1);
            doc.roundedRect(margin - 0.5, startTableY - 0.5, tableWidth + 1, tableHeight + 1, 8, 8, 'S');

            doc.setDrawColor(220, 220, 220);
            doc.setLineWidth(0.4);
            doc.roundedRect(margin, startTableY, tableWidth, tableHeight, 8, 8, 'S');
        }
    });

    console.log("PDF GENERATOR V6.0: Design correction complete");
    return doc.output('blob');
}

// Reuse helper
function loadImage(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = url;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject('No canvas context'); return; }
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject('Error loading image');
    });
}
