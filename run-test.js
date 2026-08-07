import { execSync } from 'child_process';
import fs from 'fs';
try {
  const out = execSync('node dist/test-use-case.js', { encoding: 'utf-8', stdio: 'pipe' });
  fs.writeFileSync('dashboard-test.log', out);
} catch (e) {
  fs.writeFileSync('dashboard-test.log', e.stdout + '\n' + e.stderr + '\n' + e.message);
}
