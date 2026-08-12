require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

async function main() {
  const url = `https://feqjbwxkelpgzsdiphei.supabase.co/rest/v1/?apikey=${process.env.SUPABASE_SERVICE_ROLE_KEY}`;
  const response = await fetch(url);
  const openapi = await response.json();
  
  const tables = openapi.definitions;
  const paths = openapi.paths;
  
  fs.writeFileSync('remote_schema.json', JSON.stringify({ tables, paths }, null, 2));
  console.log("Remote schema saved to remote_schema.json");
}

main().catch(console.error);
