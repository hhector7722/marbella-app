const fs = require('fs');

function fix(file, fnName) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace print function
    const regexPrint = new RegExp(`function ${fnName}\\(.*?\\) \\{([\\s\\S]*?)doc\\.close\\(\\);\\n\\}`, 'm');
    const replacementPrint = `function ${fnName}(closings, title) {
    const rows = typeof buildClosingExportRows !== 'undefined' ? buildClosingExportRows(closings) : closings;
    const html = typeof buildExportTableHtml !== 'undefined' ? buildExportTableHtml(rows, title) : 'html';

    const printContainer = document.createElement('div');
    printContainer.id = 'marbella-print-container';
    
    // Create a styled version of the HTML
    const styles = \`
      <style>
        * { box-sizing: border-box; }
        body { margin: 24px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color: #111827; background: white; }
        table { width: 100%; border-collapse: collapse; }
        thead th { background: #36606F; color: white; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 800; font-size: 11px; padding: 10px 12px; text-align: right; }
        thead th:first-child { text-align: left; }
        tbody td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; }
        tbody tr:nth-child(even) { background: #fafafa; }
        @media print { @page { size: landscape; } body { margin: 0; } }
      </style>
    \`;
    printContainer.innerHTML = styles + html;
    
    document.body.appendChild(printContainer);
    document.body.classList.add('marbella-printing');
    
    window.print();
    
    setTimeout(() => {
        document.body.classList.remove('marbella-printing');
        printContainer.remove();
    }, 1000);
}`;
    
    content = content.replace(regexPrint, replacementPrint);
    fs.writeFileSync(file, content);
}

fix('src/app/dashboard/history/page.tsx', 'printClosingsTable');

