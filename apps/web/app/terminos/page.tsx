import type { Metadata } from "next";
import { DocumentoLegal } from "@/components/documento-legal";
import { datosResponsable, terminosCondiciones } from "@/lib/legal";

export const metadata: Metadata = { title: "Términos y condiciones" };
export const dynamic = "force-dynamic";

export default function Terminos() {
  return <DocumentoLegal titulo="Términos y condiciones" secciones={terminosCondiciones(datosResponsable())} />;
}
