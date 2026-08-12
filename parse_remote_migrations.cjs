const fs = require('fs');

let raw = fs.readFileSync('remote_schema_migrations_raw.txt', 'utf8');
const match = raw.match(/\[.*\]/s);
if (match) {
  const json = JSON.parse(match[0]);
  fs.writeFileSync('remote_schema_migrations.json', JSON.stringify({rows: json}, null, 2));
  console.log("Parsed remote migrations.");
} else {
  console.error("Could not find JSON in raw file");
}
