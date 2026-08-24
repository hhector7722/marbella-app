import ollama from "ollama";

async function main() {
  const tools = [
    {
      type: "function" as const,
      function: {
        name: "gestionar_proveedores",
        description: "Lista los proveedores registrados.",
        parameters: {
          type: "object",
          properties: {
            p_accion: {
              type: "string",
              enum: ["listar"],
              description: "Usa listar para obtener todos los proveedores.",
            },
          },
          required: ["p_accion"],
        },
      },
    },
  ];

  console.time("FUNCTIONGEMMA");

  const result = await ollama.chat({
    model: "functiongemma:latest",
    messages: [
      {
        role: "developer",
        content:
          "You are a model that can do function calling with the following functions",
      },
      {
        role: "user",
        content: "¿Qué proveedores tenemos registrados?",
      },
    ],
    tools,
    stream: false,
  });

  console.timeEnd("FUNCTIONGEMMA");

  console.log("=== MESSAGE ===");
  console.log(JSON.stringify(result.message, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
