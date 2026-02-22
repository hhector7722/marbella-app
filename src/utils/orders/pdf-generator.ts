
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
    console.log("PDF GENERATOR V5.0: Implementing clean minimalist design");

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
    const logoUrl = '/icons/logo-white.png'; // Using the same logo, but we'll draw it on white
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

    // Logo on the left
    if (logoImage) {
        // Draw a light blue circle background for the logo to make the white logo visible
        doc.setFillColor(91, 143, 185); // #5B8FB9
        doc.circle(margin + 12, currentY + 12, 13, 'F');
        doc.addImage(logoImage, 'PNG', margin + 3, currentY + 3, 18, 18);
    }

    // Title and Date on the right
    doc.setTextColor(...COLORS.text);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(32);
    doc.text('Pedido', pageWidth - margin, currentY + 15, { align: 'right' });

    const today = format(new Date(), "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
    const formattedDate = today.charAt(0).toUpperCase() + today.slice(1);
    doc.setFontSize(14);
    doc.setTextColor(100, 100, 100);
    doc.text(formattedDate, pageWidth - margin, currentY + 24, { align: 'right' });

    // --------------------------------------------------------------------------
    // 2. COMPANY INFO (Supplier)
    // --------------------------------------------------------------------------
    currentY = 60;
    const infoX = margin;

    doc.setTextColor(54, 96, 111); // Dark Teal/Primary
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(COMPANY_INFO.name, infoX, currentY);

    currentY += 8;
    doc.setFontSize(11);
    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'normal');
    doc.text(COMPANY_INFO.nif, infoX, currentY);

    currentY += 6;
    doc.text(COMPANY_INFO.address, infoX, currentY);
    currentY += 6;
    doc.text(COMPANY_INFO.phone, infoX, currentY);
    currentY += 6;
    doc.text(COMPANY_INFO.email, infoX, currentY);

    // --------------------------------------------------------------------------
    // 3. TABLE (Bento Grid Design)
    // --------------------------------------------------------------------------
    const startTableY = 110;

    // 1. Draw the container (Rounded rect for the body area)
    const tableHeight = (data.items.length * 28) + 16; // Estimated height
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, startTableY, pageWidth - (margin * 2), tableHeight, 8, 8, 'S');

    // 2. Draw the header background (Rounded top)
    doc.setFillColor(54, 96, 111); // #36606F
    doc.roundedRect(margin, startTableY, pageWidth - (margin * 2), 14, 8, 8, 'F');
    // Rect to square off the bottom of the header rounded rect
    doc.rect(margin, startTableY + 7, pageWidth - (margin * 2), 7, 'F');

    autoTable(doc, {
        startY: startTableY,
        head: [['Producto', 'Cantidad', 'Unidad']],
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
            fillColor: [0, 0, 0, 0] as any,
            textColor: 255,
            fontSize: 13,
            fontStyle: 'bold',
            halign: 'center',
            cellPadding: { top: 4, bottom: 4, left: 10, right: 10 }
        },

        columnStyles: {
            0: { halign: 'left' },
            1: { halign: 'center', cellWidth: 40 },
            2: { halign: 'center', cellWidth: 40 }
        },

        bodyStyles: {
            fillColor: [255, 255, 255, 0] // Transparent to show container
        },

        didDrawCell: function (data) {
            // Product Images in Column 0
            if (data.section === 'body' && data.column.index === 0) {
                const rowIndex = data.row.index;
                const image = productImages[rowIndex];
                if (image) {
                    const cell = data.cell;
                    const imgSize = 20;
                    const x = cell.x + 8;
                    const y = cell.y + (cell.height - imgSize) / 2;
                    doc.addImage(image, 'PNG', x, y, imgSize, imgSize);
                }
            }

            // Bottom Border for rows (except last one)
            if (data.section === 'body' && data.row.index < data.table.body.length - 1) {
                doc.setDrawColor(245, 245, 245);
                doc.setLineWidth(0.1);
                doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
            }
        },

        didParseCell: function (data: any) {
            if (data.section === 'body' && data.column.index === 0) {
                // Indent text for image
                data.cell.styles.cellPadding = { left: 35, top: 9, bottom: 9, right: 10 };
            }
        },

        margin: { left: margin, right: margin }
    });

    console.log("PDF GENERATOR V5.0: Clean design implementation complete");
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
