import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { buildPlantillaInventario } from "@/lib/excel";

// GET /api/inventario/plantilla → plantilla .xlsx de carga masiva (siempre al día con las columnas).
export async function GET() {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario" })();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const buffer = await buildPlantillaInventario();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-inventario.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
