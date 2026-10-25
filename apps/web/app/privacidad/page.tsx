import type { Metadata } from "next";
import { DocumentoLegal } from "@/components/documento-legal";
import { avisoPrivacidad, datosResponsable } from "@/lib/legal";

export const metadata: Metadata = { title: "Aviso de privacidad" };
export const dynamic = "force-dynamic";

export default function Privacidad() {
  return <DocumentoLegal titulo="Aviso de privacidad" secciones={avisoPrivacidad(datosResponsable())} />;
}
