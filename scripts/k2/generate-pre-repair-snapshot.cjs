const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');
const path = require('path');

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

const snapshotPath = '/tmp/pg-test/pre_repair_snapshot.json';

// 1. Local migrations manifest
const migrationsDir = path.join(__dirname, '../../supabase/migrations');
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
const localManifest = files.map(f => {
  const content = fs.readFileSync(path.join(migrationsDir, f));
  return { version: f.split('_')[0], filename: f, sha256: sha256(content) };
});
const localManifestStr = JSON.stringify(localManifest, null, 2);
const localManifestHash = sha256(localManifestStr);

// 2. Remote history
const remoteHistoryStr = fs.readFileSync('/tmp/pg-test/remote_history.txt', 'utf8');
const remoteHistoryHash = sha256(remoteHistoryStr);

// 3. Git HEAD and Worktree
const gitHead = execSync('git rev-parse HEAD').toString().trim();
let gitWorktreeDiff = '';
try {
  gitWorktreeDiff = execSync('git diff HEAD --binary').toString();
} catch (e) {
  gitWorktreeDiff = '';
}
const gitWorktreeHash = sha256(gitWorktreeDiff);

let gitIndexDiff = '';
try {
  gitIndexDiff = execSync('git diff --cached --binary').toString();
} catch (e) {
  gitIndexDiff = '';
}
const gitIndexHash = sha256(gitIndexDiff);

// 4. SET A, B, C
const setA = [
  "20260713000756", "20260713012154", "20260716134302", "20260716135420",
  "20260716140057", "20260716140142", "20260716140849", "20260716140905",
  "20260716141056", "20260716141119", "20260716142619", "20260716152348",
  "20260716153048", "20260716153140", "20260716153205", "20260716153246",
  "20260716154119", "20260716155946", "20260716160302", "20260716161424",
  "20260716163651", "20260716185302", "20260721070321", "20260723215624",
  "20260724045536", "20260724062138", "20260724064003", "20260724103743",
  "20260724181230", "20260726031357", "20260726112854", "20260729023408"
].sort();
const setB = [
  "20260713120000", "20260713140000", "20260716134100", "20260716153000",
  "20260716160000", "20260716162000", "20260716170000", "20260716171000",
  "20260716180000", "20260716190000", "20260716192000", "20260716193000",
  "20260716200000", "20260716210000", "20260716220000", "20260716230000",
  "20260716240000", "20260716250000", "20260721120000", "20260723230000",
  "20260724060000", "20260724080000", "20260724090000", "20260724120000",
  "20260724190000", "20260726031225", "20260726112525", "20260729023014"
].sort();
const setC = [
  "20260804000000", "20260804000001", "20260806000000", "20260806000001",
  "20260806180509"
].sort();

const setAHash = sha256(JSON.stringify(setA));
const setBHash = sha256(JSON.stringify(setB));
const setCHash = sha256(JSON.stringify(setC));

// 5. Mapping
const mappingData = {
  '20260713000756': '20260713120000',
  '20260713012154': '20260713140000',
  '20260716134302': '20260716134100',
  '20260716135420': '20260716153000',
  '20260716140057': '20260716160000',
  '20260716140142': '20260716160000',
  '20260716140849': '20260716162000',
  '20260716140905': '20260716162000',
  '20260716141056': '20260716170000',
  '20260716141119': '20260716171000',
  '20260716142619': '20260716180000',
  '20260716152348': '20260716190000',
  '20260716153048': '20260716230000',
  '20260716153140': '20260716192000',
  '20260716153205': '20260716230000',
  '20260716153246': '20260716193000',
  '20260716154119': '20260716200000',
  '20260716155946': '20260716210000',
  '20260716160302': '20260716220000',
  '20260716161424': '20260716230000',
  '20260716163651': '20260716240000',
  '20260716185302': '20260716250000',
  '20260721070321': '20260721120000',
  '20260723215624': '20260723230000',
  '20260724045536': '20260724060000',
  '20260724062138': '20260724080000',
  '20260724064003': '20260724090000',
  '20260724103743': '20260724120000',
  '20260724181230': '20260724190000',
  '20260726031357': '20260726031225',
  '20260726112854': '20260726112525',
  '20260729023408': '20260729023014'
};
const mappingArray = Object.keys(mappingData).sort().map(remote => ({
  remote_version: remote,
  local_version: mappingData[remote],
  mapping_type: 'REVERT_ABSORBED'
}));
const mappingHash = sha256(JSON.stringify(mappingArray, null, 2));
fs.writeFileSync('/tmp/pg-test/remote_to_local_mapping.json', JSON.stringify(mappingArray, null, 2));

const snapshotObj = {
  git_head: gitHead,
  git_worktree_hash: gitWorktreeHash,
  git_index_hash: gitIndexHash,
  local_migrations_manifest_hash: localManifestHash,
  remote_history_hash: remoteHistoryHash,
  set_a_hash: setAHash,
  set_b_hash: setBHash,
  set_c_hash: setCHash,
  mapping_hash: mappingHash,
  data: {
    local_manifest: localManifest,
    set_a: setA,
    set_b: setB,
    set_c: setC,
    mapping: mappingArray
  }
};

const contentToHash = JSON.stringify(snapshotObj, null, 2);
const snapshotHash = sha256(contentToHash);

const finalSnapshot = {
  timestamp: new Date().toISOString(),
  snapshot_hash: snapshotHash,
  ...snapshotObj
};

fs.writeFileSync(snapshotPath, JSON.stringify(finalSnapshot, null, 2));

console.log('--- HASHES ---');
console.log('Snapshot Hash:', snapshotHash);
console.log('Git HEAD:', gitHead);
console.log('Worktree Hash:', gitWorktreeHash);
console.log('Index Hash:', gitIndexHash);
console.log('Local Manifest Hash:', localManifestHash);
console.log('Remote History Hash:', remoteHistoryHash);
console.log('Set A Hash:', setAHash);
console.log('Set B Hash:', setBHash);
console.log('Set C Hash:', setCHash);
console.log('Mapping Hash:', mappingHash);
