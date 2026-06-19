import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export type EncargoPdfMeta = {
  encargoDate: string
  encargoTime: string
  encargoName: string
  contactPhone: string | null
}

export type EncargoPdfItem = {
  name: string
  quantity: number
  notes?: string | null
}

export async function generateEncargoOrderPdf(
  meta: EncargoPdfMeta,
  items: EncargoPdfItem[]
): Promise<Blob> {
  const estimatedHeight = 36 + 18 + items.length * 9 + 16

  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: [210, Math.max(297, estimatedHeight)],
  }) as jsPDF & { lastAutoTable?: { finalY: number } }

  const margin = 8

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text('Pedido por encargo', margin, 14)

  const metaY = 22
  let metaX = margin
  const metaParts: Array<[string, string]> = [
    ['Fecha', meta.encargoDate],
    ['Hora', meta.encargoTime],
    ['Nombre', meta.encargoName],
    ['Contacto', meta.contactPhone?.trim() || ' '],
  ]

  doc.setFontSize(8)
  for (const [label, value] of metaParts) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(82, 82, 91)
    const labelText = label.toUpperCase()
    doc.text(labelText, metaX, metaY)
    const labelW = doc.getTextWidth(labelText) + 1.5
    doc.setTextColor(0, 0, 0)
    doc.text(value, metaX + labelW, metaY)
    metaX += labelW + doc.getTextWidth(value) + 6
    if (metaX > 185) {
      metaX = margin
    }
  }

  autoTable(doc, {
    startY: metaY + 8,
    head: [['Producto', '', 'Cantidad']],
    body: items.map((it) => [
      it.name,
      it.notes?.trim()?.toLowerCase() || ' ',
      it.quantity > 0 ? String(it.quantity) : ' ',
    ]),
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: {
      fontSize: 10,
      cellPadding: { top: 3.5, right: 2, bottom: 3.5, left: 2 },
      textColor: [0, 0, 0],
      lineColor: [228, 228, 231],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [250, 250, 250],
      textColor: [82, 82, 91],
      fontSize: 8,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 'auto' },
      1: { fontSize: 11, cellWidth: 'auto' },
      2: { halign: 'center', fontStyle: 'bold', cellWidth: 20 },
    },
  })

  return doc.output('blob')
}
