
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
    secondary: [94, 53, 177] as [number, number, number], // Purple accent
    text: [30, 41, 59] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    tableHeader: [54, 96, 111] as [number, number, number],
    tableRowEven: [248, 250, 252] as [number, number, number],
};

export async function generateOrderPDF(data: OrderData): Promise<Blob> {
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    }) as any;

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;

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
    // 1. HEADER (Wave Design)
    // --------------------------------------------------------------------------
    const headerHeight = 65;
    doc.setFillColor(...COLORS.primary);

    // Draw the main blue block
    doc.rect(0, 0, pageWidth, 50, 'F');

    // Draw the WAVE bottom
    doc.moveTo(0, 50);
    // Smooth wave: down then up
    doc.curveTo(
        pageWidth * 0.33, 65, // CP1
        pageWidth * 0.66, 35, // CP2
        pageWidth, 50        // End
    );
    doc.lineTo(pageWidth, 0);
    doc.lineTo(0, 0);
    doc.fill();

    // --------------------------------------------------------------------------
    // 2. LOGO & TITLE
    // --------------------------------------------------------------------------
    // Logo Circle (White) at top left
    doc.setFillColor(255, 255, 255);
    doc.circle(28, 25, 18, 'F');

    if (logoImage) {
        doc.addImage(logoImage, 'PNG', 15, 12, 26, 26);
    }

    // Title: "Pedido" (Top Right)
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(36);
    doc.text('Pedido', pageWidth - margin, 25, { align: 'right' });

    // Date (Below Title)
    const today = format(new Date(), "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
    const formattedDate = today.charAt(0).toUpperCase() + today.slice(1);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 200, 200);
    doc.text(formattedDate, pageWidth - margin, 34, { align: 'right' });

    // --------------------------------------------------------------------------
    // 3. COMPANY INFO
    // --------------------------------------------------------------------------
    let currentY = 85;
    const infoX = margin;

    doc.setTextColor(...COLORS.primary);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(COMPANY_INFO.name, infoX, currentY);

    currentY += 8;
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.setFont('helvetica', 'normal');
    doc.text(COMPANY_INFO.nif, infoX, currentY);

    currentY += 6;
    doc.text(COMPANY_INFO.address, infoX, currentY);

    currentY += 6;
    doc.text(COMPANY_INFO.phone, infoX, currentY);

    currentY += 6;
    doc.text(COMPANY_INFO.email, infoX, currentY);

    // --------------------------------------------------------------------------
    // 4. TABLE (Redesigned)
    // --------------------------------------------------------------------------
    const startTableY = 130;

    autoTable(doc, {
        startY: startTableY,
        head: [['ARTÍCULO', 'CANTIDAD', 'UNIDAD']],
        body: data.items.map(item => [item.name, item.quantity, item.unit]),
        theme: 'plain',

        styles: {
            font: 'helvetica',
            fontSize: 12,
            textColor: [60, 60, 60],
            cellPadding: { top: 8, bottom: 8, left: 10, right: 10 },
            valign: 'middle',
            minCellHeight: 25
        },

        headStyles: {
            fillColor: COLORS.tableHeader,
            textColor: 255,
            fontSize: 12,
            fontStyle: 'bold',
            halign: 'center',
            cellPadding: 10
        },

        columnStyles: {
            0: { halign: 'left', cellWidth: 'auto' },
            1: { halign: 'center', cellWidth: 40 },
            2: { halign: 'center', cellWidth: 40 }
        },

        // White background for everything
        bodyStyles: {
            fillColor: [255, 255, 255]
        },

        // Manual drawing hook for images and rounded corners
        didDrawCell: function (data) {
            // Draw Product Image
            if (data.section === 'body' && data.column.index === 0) {
                const rowIndex = data.row.index;
                const image = productImages[rowIndex];
                if (image) {
                    const cell = data.cell;
                    const imgSize = 18;
                    const x = cell.x + 5;
                    const y = cell.y + (cell.height - imgSize) / 2;
                    doc.addImage(image, 'PNG', x, y, imgSize, imgSize);

                    // We need to move the text to the right
                    // Since autoTable already drew the text, we'll draw a white rect over it and redraw it
                    // Actually, a better trick is to prepend spaces to the article name or use a custom draw.
                    // Let's use didParseCell to add padding to the text if needed, or just redraw here.
                }
            }

            // Draw shadow/border for the 3 columns container
            if (data.section === 'body') {
                doc.setDrawColor(240, 240, 240);
                doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
            }
        },

        didParseCell: function (data) {
            if (data.section === 'body' && data.column.index === 0) {
                // Add padding for the image (approx 25mm)
                data.cell.styles.cellPadding = { left: 28, top: 8, bottom: 8, right: 10 };
            }
        },

        margin: { left: margin, right: margin }
    });

    // Final touch: Border around the table content like a card
    const finalY = (doc as any).lastAutoTable.finalY + 10;

    // We can't easily draw a rounded border around the whole autoTable after it's drawn 
    // without knowing exact dimensions. AutoTable handles it well enough.

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
            if (!ctx) { reject('No config'); return; }
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject('Error loading image');
    });
}
