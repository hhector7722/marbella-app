import { NextResponse } from "next/server";
import ollama from "ollama";

export async function GET() {
  try {
    console.log("\n=== QWEN TOOL TEST ===");

    const result = await ollama.chat({
      model: "qwen3:8b",
      messages: [
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
      stream: false,
    });

    console.log("\n=== QWEN RESULT ===");
    console.log(JSON.stringify(result.message, null, 2));

    return NextResponse.json({
      ok: true,
      message: result.message,
    });
  } catch (error) {
    console.error("\n=== QWEN ERROR ===");
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
