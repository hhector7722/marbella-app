import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { normalizeCopilotRole, type RoleName } from "@/lib/copilot/permissions";
import { executeCopilotTool, type CopilotSupabaseClient } from "@/lib/copilot/tool-runtime";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = (normalizeCopilotRole(profileRow?.role) ?? "staff") as RoleName;
    const body = await req.json();

    const result = await executeCopilotTool({
      supabase: supabase as unknown as CopilotSupabaseClient,
      role,
      userId: user.id,
      toolName: body?.toolName,
      args: body?.args,
      sessionId: typeof body?.sessionId === "string" ? body.sessionId : null,
      mode: "voice",
    });

    if (!result.ok) {
      console.error("[Copiloto Tools] Error:", result);
      return NextResponse.json(
        {
          error: result.error,
          detail: result.detail,
          sent: result.sent,
          result: result.error,
        },
        { status: result.status }
      );
    }

    return NextResponse.json({ result: result.data });
  } catch (error: unknown) {
    console.error("[Copiloto Tools] Error:", error);
    const detail = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: "Error interno", detail }, { status: 500 });
  }
}
