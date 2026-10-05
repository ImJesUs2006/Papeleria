import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSignedBusinessConfig } from "@/lib/feature-flags";

// ============================================================
// GET /api/configuracion/negocio/cache
// Blob firmado para hidratar store/config.ts (Feature Flags).
// La sessionKey se entrega en la respuesta y el cliente la retiene
// SOLO en memoria. Sin ella no se puede verificar la firma local,
// por lo que los flags no verificados quedan apagados (offline frío).
// ============================================================

export async function GET() {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const signed = await getSignedBusinessConfig(auth.user.idNegocio);
  return NextResponse.json(signed);
}