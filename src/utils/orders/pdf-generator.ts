
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
    // 0. PRE-LOAD IMAGES (Logo + Products)
    // --------------------------------------------------------------------------
    const logoUrl = '/icons/logo-white.png';
    const logoPromise = loadImage(logoUrl).catch(() => null);

    // Process product images
    // We'll store loaded images in a map or array matching items
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
    // 1. HEADER (Curved Blue Background)
    // --------------------------------------------------------------------------
    // Draw a shape with a bezier curve at bottom
    // Approximate Height: 60mm

    doc.setFillColor(...COLORS.primary);

    // Method: moveTo -> lineTo -> bezierCurveTo -> lineTo -> close
    doc.lines(
        [
            [pageWidth, 0],           // Top edge
            [0, 50],                  // Right edge down to 50
            // Bezier curve from right(w, 50) to left(0, 50)
            // We want a curve that dips slightly or waves. The reference shows a gentle wave.
            // Let's do a simple convex curve for style.
            [-pageWidth, 0, -pageWidth / 2, 15, -pageWidth, 0], // This syntax for lines is relative [dx, dy, x1, y1, x2, y2]
            [0, -50]                  // Back to top left
        ],
        0,
        0,
        [1.0, 1.0],
        'F',
        true
    );

    // Let's use simpler explicit construction for the curve to be safe
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, pageWidth, 40, 'F'); // Base rect

    // Draw the curve bottom
    doc.moveTo(0, 40);
    doc.curveTo(
        pageWidth / 2, 55, // Control point 1
        pageWidth / 2, 55, // Control point 2
        pageWidth, 40      // End point
    );
    doc.lineTo(pageWidth, 0);
    doc.lineTo(0, 0);
    doc.fill();

    // --------------------------------------------------------------------------
    // 2. LOGO & TITLE
    // --------------------------------------------------------------------------
    // Logo Circle (White) at top left
    doc.setFillColor(255, 255, 255);
    doc.circle(30, 28, 20, 'F');

    if (logoImage) {
        doc.addImage(logoImage, 'PNG', 14, 12, 32, 32);
    } else {
        doc.setTextColor(...COLORS.primary);
        doc.setFontSize(8);
        doc.text('NO LOGO', 30, 28, { align: 'center' });
    }

    // Title: "Pedido" (Top Right)
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.text('Pedido', pageWidth - margin, 25, { align: 'right' });

    // Date (Below Title)
    const today = format(new Date(), "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
    const formattedDate = today.charAt(0).toUpperCase() + today.slice(1);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(220, 220, 220); // Light gray text
    doc.text(formattedDate, pageWidth - margin, 32, { align: 'right' });

    // --------------------------------------------------------------------------
    // 3. COMPANY INFO (Left, Below Header)
    // --------------------------------------------------------------------------
    let currentY = 75; // Start below the curve
    const infoX = margin;

    doc.setTextColor(...COLORS.primary);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(COMPANY_INFO.name, infoX, currentY);

    currentY += 6;
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.setFont('helvetica', 'normal');
    doc.text(COMPANY_INFO.nif, infoX, currentY);

    currentY += 5;
    doc.text(COMPANY_INFO.address, infoX, currentY);

    currentY += 5;
    doc.text(COMPANY_INFO.phone, infoX, currentY);

    currentY += 5;
    doc.text(COMPANY_INFO.email, infoX, currentY);

    // --------------------------------------------------------------------------
    // 4. SUPPLIER (Right, Aligned with Company Info)
    // --------------------------------------------------------------------------
    // We can put supplier info on the right side if needed, or keep it simple
    // The reference image doesn't explicitly show supplier info block, but it's an order *to* a supplier.
    // Let's add it for clarity on the right side.

    // doc.text(data.supplierName, pageWidth - margin, 75, { align: 'right' });

    // --------------------------------------------------------------------------
    // 5. TABLE WITH IMAGES
    // --------------------------------------------------------------------------
    const startTableY = 110;

    autoTable(doc, {
        startY: startTableY,
        head: [['', 'ARTÍCULO', 'CANTIDAD', 'UNIDAD']],
        body: data.items.map(item => ['', item.name, item.quantity, item.unit]),
        theme: 'plain',

        // STYLES
        styles: {
            font: 'helvetica',
            fontSize: 10,
            textColor: COLORS.text,
            cellPadding: 4,
            valign: 'middle',
            minCellHeight: 18 // Ensure height for images
        },

        // HEADER STYLES
        headStyles: {
            fillColor: COLORS.tableHeader,
            textColor: 255,
            fontSize: 9,
            fontStyle: 'bold',
            halign: 'center',
            cellPadding: 8
        },

        // COLUMN STYLES
        columnStyles: {
            0: { cellWidth: 15 }, // Image column
            1: { halign: 'left' }, // Article
            2: { halign: 'center', cellWidth: 30 }, // Quantity
            3: { halign: 'center', cellWidth: 30 }  // Unit
        },

        // ALTERNATE ROW
        alternateRowStyles: {
            fillColor: COLORS.tableRowEven
        },

        // DRAW IMAGES HOOK
        didDrawCell: function (data) {
            if (data.section === 'body' && data.column.index === 0) {
                const rowIndex = data.row.index;
                const image = productImages[rowIndex];

                if (image) {
                    // Fit image in cell
                    const cell = data.cell;
                    const padding = 2;
                    const dim = Math.min(cell.width, cell.height) - (padding * 2);
                    const x = cell.x + (cell.width - dim) / 2;
                    const y = cell.y + (cell.height - dim) / 2;

                    doc.addImage(image, 'PNG', x, y, dim, dim);
                }
            }
        },

        // ROUNDED CORNERS (Simulated by drawing a border rect around the table if possible, or just standard)
        // AutoTable doesn't support border-radius easily on the main table container.
        // We'll trust standard look.

        margin: { left: margin, right: margin }
    });

    // White line separator for header columns?
    // Not strictly needed with 'plain' theme but 'striped' or custom is better.

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
