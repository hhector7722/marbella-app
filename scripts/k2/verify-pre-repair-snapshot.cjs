const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

const snapshotPath = '/tmp/pg-test/pre_repair_snapshot.json';

try {
  const snapshotRaw = fs.readFileSync(snapshotPath, 'utf8');
  const snapshotData = JSON.parse(snapshotRaw);
  
  // Exclude timestamp and snapshot_hash for verification
  const { timestamp, snapshot_hash, ...contentToHash } = snapshotData;
  
  const computedHash = sha256(JSON.stringify(contentToHash, null, 2));
  
  console.log(`Expected Hash: ${snapshot_hash}`);
  console.log(`Computed Hash: ${computedHash}`);
  
  if (computedHash === snapshot_hash) {
    console.log('SNAPSHOT INTEGRITY: PASS');
  } else {
    console.log('SNAPSHOT INTEGRITY: FAIL');
  }
} catch (e) {
  console.error('Error reading snapshot:', e);
  console.log('SNAPSHOT INTEGRITY: FAIL');
}
