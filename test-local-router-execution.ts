import { createClient } from "@/utils/supabase/server";
import {
  executeCopilotTool,
  type CopilotSupabaseClient,
} from "@/lib/copilot/tool-runtime";

async function main() {
  const supabase = await createClient();

  const result = await executeCopilotTool({
    supabase: supabase as unknown as CopilotSupabaseClient,
    role: "manager",
    userId: "TEST",
    toolName: "gestionar_proveedores",
    args: {
      p_accion: "listar",
      p_datos: {},
    },
    sessionId: null,
    mode: "chat",
  });

  console.log("=== TOOL RESULT ===");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("=== ERROR ===");
  console.error(error);
  process.exit(1);
});
