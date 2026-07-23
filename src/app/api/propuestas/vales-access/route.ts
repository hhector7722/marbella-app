import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { canDownloadPropuestasVales } from "@/lib/propuestas-vales-access";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return NextResponse.json({
    canDownload: canDownloadPropuestasVales(user?.email),
  });
}
