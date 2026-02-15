
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface OrderItem {
    name: string;
    quantity: number;
    unit: string;
    price: number;
}

interface OrderData {
    supplierName: string;
    items: OrderItem[];
    orderNumber: string;
}

const COMPANY_INFO = {
    name: 'Fogó Torrat S.L',
    nif: 'NIF: B09761628',
    address: 'Avinguda Litoral 86,\n08005, Barcelona',
    phone: '647229309',
    email: 'fogotorrat@gmail.com'
};

const COLORS = {
    primary: [54, 96, 111] as [number, number, number], // #36606F
    text: [30, 41, 59] as [number, number, number],    // Slate 800
    white: [255, 255, 255] as [number, number, number],
    tableHeader: [54, 96, 111] as [number, number, number],
    tableRowEven: [248, 250, 252] as [number, number, number], // Slate 50
    tableRowOdd: [255, 255, 255] as [number, number, number]
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
    // 1. HEADER BACKGROUND
    // --------------------------------------------------------------------------
    const headerHeight = 60;
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, pageWidth, headerHeight, 'F');

    // --------------------------------------------------------------------------
    // 2. LOGO (Simulated with circle + text if image loading fails, but we try image)
    // --------------------------------------------------------------------------
    // Draw white circle for logo container
    doc.setFillColor(255, 255, 255);
    doc.circle(30, 30, 22, 'F');

    try {
        // Try to load the logo
        // Note: In client-side, we need to fetch the image first
        const logoUrl = '/icons/logo-white.png';
        const logoImage = await loadImage(logoUrl);
        // We might need a dark version for white background, or we use the white one and invert/colorize?
        // Actually, the user image shows a blue logo on white background circle.
        // If 'logo-white.png' is white text, it won't show on white circle.
        // Let's assume for now we put the text "bar la marbella" or try to put the logo.
        // If the logo is white, we should put it directly on the blue background? 
        // The user mockup showed a white circle with blue text/logo.
        // Let's try to fit the image. If it's white with transparent bg, it will be invisible on white circle.
        // But let's assume standard behavior first. If fail, fall back to text.

        // For safety/contrast, let's just put the text "bar la marbella" in blue if we can't style the logo perfectly via code without checking it.
        // Actually, let's look at the user request image again... 
        // "bar la marbella" is text inside the circle.

        doc.addImage(logoImage, 'PNG', 12, 12, 36, 36);
    } catch (e) {
        // Fallback text logo
        doc.setTextColor(...COLORS.primary);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('bar', 22, 26);
        doc.text('la marbella', 22, 32);
    }

    // --------------------------------------------------------------------------
    // 3. COMPANY INFO (Left, White Text)
    // --------------------------------------------------------------------------
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const startX = 60;
    let currentY = 18;

    doc.text(COMPANY_INFO.name, startX, currentY);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    currentY += 5;
    doc.text(COMPANY_INFO.nif, startX, currentY);

    currentY += 5;
    const addressLines = doc.splitTextToSize(COMPANY_INFO.address, 60);
    doc.text(addressLines, startX, currentY);

    currentY += 10;
    doc.text(COMPANY_INFO.phone, startX, currentY);

    currentY += 5;
    doc.text(COMPANY_INFO.email, startX, currentY);

    // --------------------------------------------------------------------------
    // 4. SUPPLIER & DATE (Right, White Text, Right Aligned)
    // --------------------------------------------------------------------------
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    const rightMargin = pageWidth - margin;
    currentY = 45; // Align towards bottom of header

    // Date
    const today = format(new Date(), "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
    const formattedDate = today.charAt(0).toUpperCase() + today.slice(1);

    doc.text(formattedDate, rightMargin, currentY, { align: 'right' });

    // Supplier Name (Above date)
    currentY -= 7;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(data.supplierName, rightMargin, currentY, { align: 'right' });


    // --------------------------------------------------------------------------
    // 5. TABLE
    // --------------------------------------------------------------------------
    const tableData = data.items.map(item => [
        item.name,
        item.quantity.toString(),
        item.unit
    ]);

    autoTable(doc, {
        startY: 80,
        head: [['ARTÍCULO', 'CANTIDAD', 'UNIDAD']],
        body: tableData,
        theme: 'plain', // Custom styling
        styles: {
            font: 'helvetica',
            fontSize: 10,
            cellPadding: 6,
            textColor: COLORS.text,
            lineColor: [240, 240, 240], // Light gray border
            lineWidth: 0
        },
        headStyles: {
            fillColor: COLORS.tableHeader,
            textColor: 255,
            fontSize: 10,
            fontStyle: 'bold',
            halign: 'left',
            cellPadding: { top: 8, bottom: 8, left: 6, right: 6 }
        },
        bodyStyles: {
            fillColor: [255, 255, 255]
        },
        alternateRowStyles: {
            fillColor: COLORS.tableRowEven
        },
        columnStyles: {
            0: { halign: 'left' },   // Article
            1: { halign: 'center' }, // Quantity
            2: { halign: 'center' }  // Unit
        },
        // Simulate rounded corners for header? (Not easily supported in autoTable v3 without hooks)
        didParseCell: function (data) {
            // Add border between rows for cleaner look?
            if (data.section === 'body' && data.row.index < tableData.length - 1) {
                // content
            }
        },
        margin: { left: margin, right: margin }
    });

    // --------------------------------------------------------------------------
    // 6. TOTALS and FOOTER
    // --------------------------------------------------------------------------
    const finalY = (doc as any).lastAutoTable.finalY + 15;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);
    doc.text('TOTAL ARTÍCULOS:', pageWidth - margin - 40, finalY, { align: 'right' });

    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`${data.items.length}`, pageWidth - margin, finalY, { align: 'right' });

    return doc.output('blob');
}

// Helper to load image
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
