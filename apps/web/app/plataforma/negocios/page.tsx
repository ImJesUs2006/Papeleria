import { redirect } from "next/navigation";

// La alta de negocios ahora vive en la consola de plataforma.
export default function AltaNegocioRedirect() {
  redirect("/plataforma");
}
