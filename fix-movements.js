const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/app/dashboard/movements/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// The marker to insert before
const marker = '        </div>\n    );\n}';
const insertion = `            {/* MODAL DE DETALLE DE MOVIMIENTO */}\n            {selectedMovement && (\n                <MovementDetailModal \n                    movement={selectedMovement} \n                    onClose={() => setSelectedMovement(null)} \n                />\n            )}\n`;

if (content.includes(marker)) {
    content = content.replace(marker, insertion + marker);
    fs.writeFileSync(filePath, content);
    console.log('Successfully updated page.tsx');
} else {
    console.error('Could not find marker in page.tsx');
    process.exit(1);
}
