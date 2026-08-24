import ollama from "ollama";

async function main() {
  const tools = [
    {
      type: "function" as const,
      function: {
        name: "gestionar_proveedores",
        description:
          "Consulta información de contacto de proveedores registrados. Para obtener todos los proveedores usa listar.",
        parameters: {
          type: "object",
          properties: {
            p_accion: {
              type: "string",
              enum: ["listar", "buscar", "consultar"],
              description:
                "listar = todos los proveedores; buscar = buscar por nombre; consultar = consultar un proveedor.",
            },
            p_datos: {
              type: "object",
              properties: {
                nombre: {
                  type: "string",
                  description: "Nombre del proveedor cuando corresponda.",
                },
              },
            },
          },
          required: ["p_accion"],
        },
      },
    },
  ];

  console.log("=== QWEN PROVIDER FINAL ===");

  const result = await ollama.chat({
    model: "phi4-mini:latest",
    messages: [
      {
        role: "user",
        content: "¿Qué proveedores tenemos registrados?",
      },
    ],
    tools,
    think: false,
    stream: false,
  });

  console.log("=== RESULTADO ===");
  console.log(JSON.stringify(result.message, null, 2));
}

main().catch((error) => {
  console.error("=== ERROR ===");
  console.error(error);
  process.exit(1);
});
