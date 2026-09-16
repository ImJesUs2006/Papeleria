import { NextResponse } from "next/server";
import { getBusinessConfig } from "@/lib/feature-flags";

// ============================================================
// GET /api/configuracion/negocio/cache
// Blob firmado para hidratar store/config.ts (Feature Flags).
// La sessionKey se entrega en la respuesta y el cliente la retiene
// SOLO en memoria. Sin ella no se puede verificar la firma local,
// por lo que los flags no verificados quedan apagados (offline frío).
// ============================================================

export async function GET() {
  const config = await getBusinessConfig();
  const { getSignedBusinessConfig } = await import("@/lib/feature-flags");
  const signed = await getSignedBusinessConfig();
  return NextResponse.json(signed);
}