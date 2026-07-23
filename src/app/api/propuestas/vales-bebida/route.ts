import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { canDownloadPropuestasVales } from "@/lib/propuestas-vales-access";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!canDownloadPropuestasVales(user?.email)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const pdfPath = join(
    process.cwd(),
    "docs/propuestas/vales-bebida-cena-monitores.pdf"
  );

  try {
    const buf = await readFile(pdfPath);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          'attachment; filename="vales-bebida-cena-monitores.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "PDF no encontrado" },
      { status: 404 }
    );
  }
}
