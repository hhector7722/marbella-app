
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
    tableHeader: [56, 94, 102] as [number, number, number], // Petroleum color
};

/**
 * Encapsulated Header Drawer
 * Returns the final Y coordinate after the last line of information.
 */
function drawHeader(doc: any, logoImage: string | null): number {
    // --- LEFT BLOCK: Provider Info ---

    // 1. Logo at x: 15, y: 15. Height: 14mm
    if (logoImage) {
        doc.addImage(logoImage, 'PNG', 15, 15, 14, 14);
    }

    // 2. Cursor starts at 40
    let cursorY = 40;

    // 3. Business Name at x: 15, y: cursorY. Bold, size 14
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text(COMPANY_INFO.name, 15, cursorY);

    // 4. Increase cursor
    cursorY += 8;

    // 5. Business Details (NIF, Address, Phone, Email)
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const addressParts = COMPANY_INFO.address.split(',');
    const addressLine1 = addressParts[0].trim();
    const addressLine2 = addressParts.slice(1).join(',').trim();

    const details = [
        COMPANY_INFO.nif,
        addressLine1,
        addressLine2,
        COMPANY_INFO.phone,
        COMPANY_INFO.email
    ];

    details.forEach(line => {
        if (line) {
            doc.text(line, 15, cursorY);
            cursorY += 5;
        }
    });

    // --- RIGHT BLOCK: Metadata ---

    // 6. "Pedido" at y: 25, x: 195, align: 'right', size 22
    doc.setFontSize(22);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    doc.text('Pedido', 195, 25, { align: 'right' });

    // 7. Date at y: 35, x: 195, align: 'right', size 11
    const today = format(new Date(), "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
    const formattedDate = today.charAt(0).toUpperCase() + today.slice(1);

    doc.setFontSize(11);
    doc.text(formattedDate, 195, 35, { align: 'right' });

    return cursorY;
}

export async function generateOrderPDF(data: OrderData): Promise<Blob> {
    console.log("PDF GENERATOR V9.0: Clean native implementation");

    // Calculate dynamic "receipt" height based on item count to avoid pagination breaks
    // Header (~80) + TableHead (~15) + (Rows * 28) + Margin Bottom (~20)
    const estimatedHeight = 80 + 15 + (data.items.length * 30) + 20;

    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: [210, Math.max(297, estimatedHeight)] // At least A4 height
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
    // 1. HEADER & DYNAMIC SPACING
    // --------------------------------------------------------------------------
    const finalHeaderY = drawHeader(doc, logoImage);
    const tableStartY = Math.max(finalHeaderY, 45) + 15;

    // --------------------------------------------------------------------------
    // 2. TABLE (Strict Geometric Design)
    // --------------------------------------------------------------------------
    let currentPageStartY = tableStartY;

    autoTable(doc, {
        startY: tableStartY,
        head: [['Producto', 'Cantidad', 'Unidad']],
        body: data.items.map(item => [item.name, item.quantity, item.unit]),
        theme: 'plain', // No internal borders

        styles: {
            font: 'helvetica',
            fontSize: 14, // Increased from 11
            textColor: [60, 60, 60],
            cellPadding: { top: 7, bottom: 7, left: 10, right: 10 }, // Reduced from 9
            valign: 'middle',
            minCellHeight: 28
        },

        headStyles: {
            fillColor: false as any, // Background drawn manually in willDrawCell
            textColor: [255, 255, 255],
            fontSize: 9,
            fontStyle: 'bold',
            halign: 'center',
            valign: 'middle',
            cellPadding: { top: 2, bottom: 2, left: 5, right: 5 },
            minCellHeight: 8 // Ultra-slim
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
            // UNIFIED HEADER HACK (v11.0) - Ultra compact refinement
            if (data.section === 'head' && data.row.index === 0 && data.column.index === 0) {
                const doc = data.doc;
                const x = data.cell.x;
                const y = data.cell.y;

                // Track start Y for the frame
                currentPageStartY = y;

                const w = doc.internal.pageSize.getWidth() - (20 * 2); // pageWidth - margin*2
                const h = data.cell.height;
                const r = 4; // Border radius

                doc.setFillColor(56, 94, 102); // Petroleum #385E66

                // Draw a rounded rect for the top corners, and a sharp rect for the bottom
                // We do this by drawing a rounded rect, and then drawing a normal rect over the bottom half
                doc.roundedRect(x, y, w, h, r, r, 'F');
                doc.rect(x, y + (h / 2), w, h / 2, 'F');
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
                data.cell.styles.cellPadding = { left: 35, top: 7, bottom: 7, right: 10 };
            }
        },

        margin: { left: margin, right: margin },

        didDrawPage: function (data) {
            // CONTINUOUS PERIMETER FRAME
            const startX = data.settings.margin.left;
            const startY = currentPageStartY;
            const w = doc.internal.pageSize.getWidth() - (startX * 2);
            const h = (data.cursor?.y || startY) - startY;

            if (h > 0) {
                doc.setDrawColor(200, 200, 200);
                doc.setLineWidth(0.5);
                doc.roundedRect(startX, startY, w, h, 4, 4, 'D');
            }
        }
    });

    // --- FOOTER: Albarán reminder ---
    const reminderY = doc.lastAutoTable.finalY + 15;
    const centerX = pageWidth / 2;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Enviar albarán por correo a marbellaremote@gmail.com', centerX, reminderY, { align: 'center' });
    doc.text('Gracias', centerX, reminderY + 7, { align: 'center' });

    console.log("PDF GENERATOR V9.0: Cleanup Complete");
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
