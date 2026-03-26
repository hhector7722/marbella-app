// request_and_call.js
// Ejecuta: node request_and_call.js
(async () => {
  // Si tu Node tiene global fetch (Node 18+), se usa; si no, intentamos importar node-fetch.
  let fetchFn = globalThis.fetch;
  if (!fetchFn) {
    try {
      const nodeFetch = await import('node-fetch');
      fetchFn = nodeFetch.default;
    } catch (err) {
      console.error('Falta fetch. Instala node-fetch: npm install node-fetch@2');
      process.exit(1);
    }
  }

  try {
    const tokenRes = await fetchFn('http://localhost:3000/api/ai/voice-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const tokenJson = await tokenRes.json();
    console.log('token response status:', tokenRes.status);
    console.log('token body:', tokenJson);

    if (!tokenJson?.token) {
      console.error('No token in response — aborting.');
      process.exit(1);
    }

    const chatRes = await fetchFn('http://localhost:3000/api/ai/voice-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + tokenJson.token
      },
      body: JSON.stringify({ query: 'que tal' })
    });

    console.log('chat response status:', chatRes.status);
    const chatBody = await chatRes.text();
    console.log('chat response body:', chatBody);
  } catch (err) {
    console.error('Error during requests:', err);
    process.exit(1);
  }
})();