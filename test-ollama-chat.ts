import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

async function main() {
  const ollama = createOpenAI({
    baseURL: "http://localhost:11434/v1",
    apiKey: "ollama",
  });

  const result = await generateText({
    model: ollama.chat("qwen3:8b"),
    prompt: "Di solamente: OK",
  });

  console.log(JSON.stringify({
    text: result.text,
    finishReason: result.finishReason,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
