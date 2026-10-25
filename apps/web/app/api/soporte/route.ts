import { NextResponse } from "next/server";
import { contactoSoporte } from "@/lib/soporte";

// GET /api/soporte → cómo contactar al soporte (público: se muestra en el login).
export async function GET() {
  return NextResponse.json(contactoSoporte());
}
