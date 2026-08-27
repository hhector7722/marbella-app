import ollama from "ollama";

async function main() {
  const tools = [
    {
      type: "function" as const,
      function: {
        name: "gestionar_proveedores",
        description:
          "OBLIGATORIO para consultar proveedores registrados. Usa listar para obtener todos los proveedores.",
        parameters: {
          type: "object",
          properties: {
            p_accion: {
              type: "string",
              enum: ["listar"],
              description: "Lista todos los proveedores registrados.",
            },
          },
          required: ["p_accion"],
        },
      },
    },
  ];

  console.time("GPT-OSS");

  const result = await ollama.chat({
    model: "gpt-oss:20b",
    messages: [
      {
        role: "system",
        content:
          "Eres el router de herramientas de Bar La Marbella. " +
          "Cuando el usuario pregunte por proveedores, DEBES usar gestionar_proveedores. " +
          "No respondas directamente al usuario.",
      },
      {
        role: "user",
        content: "¿Qué proveedores tenemos registrados?",
      },
    ],
    tools,
    think: false,
    stream: false,
  });

  console.timeEnd("GPT-OSS");

  console.log("=== RESULTADO ===");
  console.log(JSON.stringify(result.message, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
