import jsPDF from 'jspdf';
import 'jspdf-autotable';
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

export async function generateOrderPDF(data: OrderData): Promise<Blob> {
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    }) as any;

    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const today = format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });

    // --- Header ---
    doc.setFillColor(54, 96, 111); // Azul Marbella #36606F
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('PEDIDO A PROVEEDOR', margin, 25);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(data.orderNumber, pageWidth - margin, 25, { align: 'right' });

    // --- Supplier & Date Info ---
    doc.setTextColor(54, 96, 111);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('PROVEEDOR:', margin, 55);

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.text(data.supplierName, margin + 30, 55);

    doc.setTextColor(54, 96, 111);
    doc.setFont('helvetica', 'bold');
    doc.text('FECHA:', margin, 62);

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.text(today.charAt(0).toUpperCase() + today.slice(1), margin + 30, 62);

    // --- Table ---
    const tableData = data.items.map(item => [
        item.name,
        item.quantity.toString(),
        item.unit,
        `${item.price.toFixed(2)}€`,
        `${(item.quantity * item.price).toFixed(2)}€`
    ]);

    doc.autoTable({
        startY: 75,
        head: [['ARTÍCULO', 'CANTIDAD', 'UNIDAD', 'PRECIO UN.', 'TOTAL']],
        body: tableData,
        theme: 'striped',
        headStyles: {
            fillColor: [54, 96, 111],
            textColor: 255,
            fontSize: 10,
            fontStyle: 'bold',
            halign: 'center'
        },
        columnStyles: {
            0: { cellWidth: 'auto', halign: 'left' },
            1: { cellWidth: 30, halign: 'center' },
            2: { cellWidth: 30, halign: 'center' },
            3: { cellWidth: 30, halign: 'right' },
            4: { cellWidth: 30, halign: 'right' }
        },
        styles: {
            fontSize: 9,
            cellPadding: 4
        },
        margin: { left: margin, right: margin }
    });

    // --- Totals ---
    const finalY = doc.lastAutoTable.finalY + 10;
    const total = data.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(54, 96, 111);
    doc.text('TOTAL PEDIDO:', pageWidth - margin - 40, finalY, { align: 'right' });

    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`${total.toFixed(2)}€`, pageWidth - margin, finalY, { align: 'right' });

    // --- Footer ---
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Bar La Marbella - Generado automáticamente', pageWidth / 2, 285, { align: 'center' });

    return doc.output('blob');
}
