const fs = require('fs');
const path = 'src/types/payroll-facts.ts';
let code = fs.readFileSync(path, 'utf8');
code = code.replace(
  /document_id\?:\s*string\s*\|\s*null;/g,
  "document_id?: string | null;\n  settlement_hash?: string | null;"
);
fs.writeFileSync(path, code);
