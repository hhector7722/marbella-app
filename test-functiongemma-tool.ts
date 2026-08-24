import ollama from "ollama";

async function main() {
  const tools = [
    {
      type: "function" as const,
      function: {
        name: "gestionar_proveedores",
        description:
          "Consulta proveedores. Debes usar esta herramienta cuando el usuario pregunte qué proveedores están registrados.",
        parameters: {
          type: "object",
          properties: {
            p_accion: {
              type: "string",
              enum: ["listar", "buscar"],
              description:
                "Usa listar para obtener todos los proveedores. Usa buscar para buscar por nombre.",
            },
            p_datos: {
              type: "object",
              properties: {
                nombre: {
                  type: "string",
                },
              },
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
