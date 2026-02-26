import { generateOrderPDF } from '../src/utils/orders/pdf-generator';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

async function run() {
    const items = [];
    for (let i = 0; i < 50; i++) {
        items.push({
            name: `Item ${i}`,
            quantity: i,
            unit: 'Kg',
            price: 10,
            image: null
        });
    }

    const data = {
        supplierName: 'Test Supplier',
        items,
        orderNumber: '12345'
    };

    const blob = await generateOrderPDF(data);
    const arrayBuffer = await blob.arrayBuffer();

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    console.log(`TOTAL PAGES GENERATED: ${pdf.numPages}`);
}

run().catch(console.error);
