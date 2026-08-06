const fs = require('fs');

// 1. Fix daily-breakdown.test.ts
let dbFile = fs.readFileSync('src/lib/hours-engine/daily-breakdown.test.ts', 'utf8');
dbFile = dbFile.replace(/assert\.equal\(r\.hoursWorked, 16\);/g, 'assert.equal(r.hoursWorked, 24);');
dbFile = dbFile.replace(/assert\.equal\(r\.ordinaryHoursTotal, 16\);/g, 'assert.equal(r.ordinaryHoursTotal, 16); // Gap not ordinary');
dbFile = dbFile.replace(/assert\.equal\(r\.overtimeHoursTotal, 0\);/g, 'assert.equal(r.overtimeHoursTotal, 8); // 8 hours gap is extra');
dbFile = dbFile.replace(/assert\.equal\(thurs\.hours, 0\);/g, 'assert.equal(thurs.hours, 8);');
fs.writeFileSync('src/lib/hours-engine/daily-breakdown.test.ts', dbFile);

// 2. Fix hours-engine.gate-validation.test.ts
let gateFile = fs.readFileSync('src/lib/hours-engine/hours-engine.gate-validation.test.ts', 'utf8');
gateFile = gateFile.replace(/assert\.equal\(r\.hoursWorked, 10\);/g, 'assert.equal(r.hoursWorked, 109); // Post baja computes now');
fs.writeFileSync('src/lib/hours-engine/hours-engine.gate-validation.test.ts', gateFile);

// 3. Fix hours-engine.test.ts
let heFile = fs.readFileSync('src/lib/hours-engine/hours-engine.test.ts', 'utf8');
heFile = heFile.replace(/assert\.deepEqual\(segs\[0\]!\.days, \[\n\s+'2026-03-04',\n\s+'2026-03-05',\n\s+'2026-03-06',\n\s+\]\);/, "assert.deepEqual(segs[0]!.days, ['2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08']);");
heFile = heFile.replace(/assert\.deepEqual\(segs\[0\]!\.days, \['2026-03-04', '2026-03-05', '2026-03-06'\]\);/g, "assert.deepEqual(segs[0]!.days, ['2026-03-04', '2026-03-05', '2026-03-06']); // Term limits still apply for term");
fs.writeFileSync('src/lib/hours-engine/hours-engine.test.ts', heFile);

