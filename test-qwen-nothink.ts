import ollama from "ollama";

async function main() {
  console.time("CLASSIFIER");

  const result = await ollama.chat({
    model: "qwen3:4b-nothink",
    messages: [
      {
        role: "system",
        content: `Eres un clasificador de acciones.

Devuelve SOLO JSON válido, sin explicaciones.

Acciones disponibles:
gestionar_proveedores = consultar proveedores
gestionar_recetas = consultar recetas
gestionar_ingredientes = consultar ingredientes
consultar_inventario = consultar stock
consultar_usuarios = consultar empleados o usuarios

Ejemplo:
{"action":"gestionar_proveedores","arguments":{"p_accion":"listar"}}`,
      },
      {
        role: "user",
        content: "¿Qué proveedores tenemos registrados?",
      },
    ],
    think: false,
    stream: false,
  });

  console.timeEnd("CLASSIFIER");

  console.log("=== RESULTADO ===");
  console.log(result.message.content);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
