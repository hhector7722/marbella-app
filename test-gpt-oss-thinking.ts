import ollama from "ollama";

async function test(think: boolean) {
  const start = Date.now();

  const result = await ollama.chat({
    model: "gpt-oss:20b",
    messages: [
      {
        role: "system",
        content:
          "You are a function calling router. " +
          "You MUST call gestionar_proveedores when the user asks about suppliers. " +
          "Do not answer directly.",
      },
      {
        role: "user",
        content: "¿Qué proveedores tenemos registrados?",
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "gestionar_proveedores",
          description: "Lista los proveedores registrados.",
          parameters: {
            type: "object",
            properties: {
              p_accion: {
                type: "string",
                enum: ["listar"],
              },
            },
            required: ["p_accion"],
          },
        },
      },
    ],
    think,
    stream: false,
  });

  console.log(`\nTHINK = ${think}`);
  console.log(`TIME = ${((Date.now() - start) / 1000).toFixed(2)}s`);
  console.log("THINKING:", result.message.thinking);
  console.log("TOOL CALLS:", JSON.stringify(result.message.tool_calls, null, 2));
}

async function main() {
  await test(false);
  await test(true);
}

main().catch(console.error);
