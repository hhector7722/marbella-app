const fs = require('fs');

let content = fs.readFileSync('src/app/dashboard/movements/page.tsx', 'utf8');

// Replace Excel
const regexExcel = /const wb = XLSX\.utils\.book_new\(\);\n\s*XLSX\.utils\.book_append_sheet\(wb, ws, 'Movimientos'\);\n\s*const now = new Date\(\);\n\s*const fileName = `movimientos_\$\{format\(now, 'yyyy-MM-dd_HHmm'\)\}\.xlsx`;\n\s*XLSX\.writeFile\(wb, fileName, \{ compression: true \}\);/g;

const replaceExcel = `const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
            const now = new Date();
            const fileName = \`movimientos_\${format(now, 'yyyy-MM-dd_HHmm')}.xlsx\`;
            
            try {
                const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const file = new File([excelBuffer], fileName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: fileName });
                } else {
                    XLSX.writeFile(wb, fileName, { compression: true });
                }
            } catch (e) {
                console.error('Share fallback', e);
                XLSX.writeFile(wb, fileName, { compression: true });
            }`;

content = content.replace(regexExcel, replaceExcel);

// Replace Print
const regexPrint = /const iframe = document\.createElement\('iframe'\);[\s\S]*?doc\.close\(\);\n\s*setTimeout\(\(\) => \{[\s\S]*?iframe\.remove\(\);\n\s*\}, 1000\);/g;

const replacePrint = `const printContainer = document.createElement('div');
            printContainer.id = 'marbella-print-container';
            const styles = \`
              <style>
                * { box-sizing: border-box; }
                body { margin: 24px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color: #111827; background: white; }
                table { width: 100%; border-collapse: collapse; }
                thead th { background: #36606F; color: white; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 800; font-size: 11px; padding: 10px 12px; text-align: right; }
                thead th:first-child { text-align: left; }
                tbody td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; text-align: right; }
                tbody td:nth-child(1), tbody td:nth-child(2) { text-align: left; }
                tbody tr:nth-child(even) { background: #fafafa; }
                @media print { @page { size: portrait; } body { margin: 0; } }
              </style>
            \`;
            printContainer.innerHTML = styles + html;
            
            document.body.appendChild(printContainer);
            document.body.classList.add('marbella-printing');
            
            window.print();
            
            setTimeout(() => {
                document.body.classList.remove('marbella-printing');
                printContainer.remove();
            }, 1000);`;

content = content.replace(regexPrint, replacePrint);

fs.writeFileSync('src/app/dashboard/movements/page.tsx', content);

