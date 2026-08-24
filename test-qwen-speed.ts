import ollama from "ollama";

async function main() {
  console.time("OLLAMA");

  const result = await ollama.chat({
    model: "qwen3:8b",
    messages: [
      {
        role: "system",
        content: "Responde de forma breve.",
      },
      {
        role: "user",
        content: "¿Qué proveedores tenemos registrados?",
      },
    ],
    think: false,
    stream: false,
  });

  console.timeEnd("OLLAMA");
  console.log(JSON.stringify(result.message, null, 2));
}

main().catch(console.error);
