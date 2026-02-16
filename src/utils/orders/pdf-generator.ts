
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
    console.log("PDF GENERATOR V4.0: Starting precise redesign");

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
    // 1. HEADER (Design matching "Second Image")
    // --------------------------------------------------------------------------
    // Main Blue background
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, pageWidth, 52, 'F');

    // Main Wave at bottom
    doc.moveTo(0, 52);
    // Double curve wave
    doc.curveTo(
        pageWidth * 0.3, 62,
        pageWidth * 0.7, 42,
        pageWidth, 52
    );
    doc.lineTo(pageWidth, 0);
    doc.lineTo(0, 0);
    doc.fill();

    // Secondary Wave Line (White/Light Blue curve above the bottom)
    doc.setDrawColor(...COLORS.secondaryLine);
    doc.setLineWidth(0.8);
    doc.moveTo(0, 48);
    doc.curveTo(
        pageWidth * 0.3, 58,
        pageWidth * 0.7, 38,
        pageWidth, 48
    );
    doc.stroke();

    // --------------------------------------------------------------------------
    // 2. LOGO & TITLE
    // --------------------------------------------------------------------------
    // Logo (White circle logic from Image 2)
    doc.setFillColor(255, 255, 255);
    doc.circle(28, 26, 19, 'F');
    // Subtle shadow or second circle for depth if needed, but keeping it clean

    if (logoImage) {
        doc.addImage(logoImage, 'PNG', 15, 13, 26, 26);
    }

    // "Pedido" Title
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(38);
    doc.text('Pedido', pageWidth - margin, 26, { align: 'right' });

    // Date
    const today = format(new Date(), "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
    const formattedDate = today.charAt(0).toUpperCase() + today.slice(1);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(210, 210, 210);
    doc.text(formattedDate, pageWidth - margin, 35, { align: 'right' });

    // --------------------------------------------------------------------------
    // 3. COMPANY INFO
    // --------------------------------------------------------------------------
    let currentY = 88;
    const infoX = margin;

    doc.setTextColor(...COLORS.primary);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(COMPANY_INFO.name, infoX, currentY);

    currentY += 8;
    doc.setFontSize(11);
    doc.setTextColor(70, 70, 70);
    doc.setFont('helvetica', 'normal');
    doc.text(COMPANY_INFO.nif, infoX, currentY);

    currentY += 6;
    doc.text(COMPANY_INFO.address, infoX, currentY);
    currentY += 6;
    doc.text(COMPANY_INFO.phone, infoX, currentY);
    currentY += 6;
    doc.text(COMPANY_INFO.email, infoX, currentY);

    // --------------------------------------------------------------------------
    // 4. TABLE (Redesigned with Rounded Header simulation)
    // --------------------------------------------------------------------------
    const startTableY = 135;

    // Simulate rounded header: Draw a rounded rect behind where the head will be
    doc.setFillColor(...COLORS.primary);
    // headHeight is usually around 15mm with padding. 
    // We draw a bit extra and AutoTable will draw the names on top.
    doc.roundedRect(margin, startTableY, pageWidth - (margin * 2), 16, 3, 3, 'F');

    autoTable(doc, {
        startY: startTableY,
        head: [['ARTÍCULO', 'CANTIDAD', 'UNIDAD']],
        body: data.items.map(item => [item.name, item.quantity, item.unit]),
        theme: 'plain',

        styles: {
            font: 'helvetica',
            fontSize: 12,
            textColor: [60, 60, 60],
            cellPadding: { top: 9, bottom: 9, left: 10, right: 10 },
            valign: 'middle',
            minCellHeight: 28
        },

        headStyles: {
            fillColor: [0, 0, 0, 0] as any, // Transparent since we drew the rounded rect
            textColor: 255,
            fontSize: 12,
            fontStyle: 'bold',
            halign: 'center',
            cellPadding: 10
        },

        columnStyles: {
            0: { halign: 'left' },
            1: { halign: 'center', cellWidth: 40 },
            2: { halign: 'center', cellWidth: 40 }
        },

        bodyStyles: {
            fillColor: [255, 255, 255]
        },

        didDrawCell: function (data) {
            // Product Images in Column 0
            if (data.section === 'body' && data.column.index === 0) {
                const rowIndex = data.row.index;
                const image = productImages[rowIndex];
                if (image) {
                    const cell = data.cell;
                    const imgSize = 20;
                    const x = cell.x + 5;
                    const y = cell.y + (cell.height - imgSize) / 2;
                    doc.addImage(image, 'PNG', x, y, imgSize, imgSize);
                }
            }

            // Bottom Border for rows
            if (data.section === 'body') {
                doc.setDrawColor(245, 245, 245);
                doc.setLineWidth(0.1);
                doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
            }
        },

        didParseCell: function (data: any) {
            if (data.section === 'body' && data.column.index === 0) {
                // Indent text for image
                data.cell.styles.cellPadding = { left: 30, top: 9, bottom: 9, right: 10 };
            }
        },

        margin: { left: margin, right: margin }
    });

    console.log("PDF GENERATOR V4.0: Precise redesign complete");
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
