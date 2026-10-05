import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getBusinessConfig } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

// ============================================================
// FASE 12 · Configuración pública de Cloudinary
//
// Solo se expone lo que Cloudinary exige público para una subida
// "unsigned": el nombre de la nube y el preset. NUNCA se devuelve
// CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET / CLOUDINARY_URL.
//
// Si el negocio no activó el flag `imagenesCloudinary` o faltan las
// variables, responde `enabled: false` y el formulario oculta el uploader.
// ============================================================

export async function GET() {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const config = await getBusinessConfig();

    if (!config.featureFlags?.imagenesCloudinary) {
      return NextResponse.json({
        enabled: false,
        razon: "La función de imágenes está desactivada en Configuración",
      });
    }

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() || "";
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET?.trim() || "";

    if (!cloudName || !uploadPreset) {
      return NextResponse.json({
        enabled: false,
        razon:
          "Faltan NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME o NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET en el .env",
      });
    }

    return NextResponse.json({
      enabled: true,
      cloudName,
      uploadPreset,
      // Carpeta de destino (opcional).
      folder: process.env.CLOUDINARY_FOLDER?.trim() || "papeleria/productos",
    });
  } catch (error) {
    console.error("[cloudinary] GET error:", error);
    return NextResponse.json(
      { enabled: false, razon: "No se pudo leer la configuración de imágenes" },
      { status: 500 }
    );
  }
}