import ollama from "ollama";

async function main() {
  const tools = [
    {
      type: "function" as const,
      function: {
        name: "gestionar_proveedores",
        description: "OBLIGATORIO para cualquier pregunta sobre proveedores. Lista los proveedores registrados.",
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
  ];

  const tests = [
    "¿Qué proveedores tenemos registrados?",
    "Enséñame los proveedores",
    "Lista de proveedores",
    "¿Qué proveedores tenemos?",
    "Dime nuestros proveedores",
  ];

  for (const prompt of tests) {
    console.log("\n================================");
    console.log("PROMPT:", prompt);

    const start = Date.now();

    const result = await ollama.chat({
      model: "functiongemma:latest",
      messages: [
        {
          role: "developer",
          content:
            "You are a function calling router. " +
            "You MUST call the available function when the user's request matches it. " +
            "Do not ask questions. Do not answer the user directly.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      tools,
      stream: false,
    });

    console.log("TIME:", ((Date.now() - start) / 1000).toFixed(2), "s");
    console.log(JSON.stringify(result.message, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
