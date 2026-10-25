import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { VERSION_LEGAL, type SeccionLegal } from "@/lib/legal";

/** Página pública de un documento legal (aviso de privacidad, términos). */
export function DocumentoLegal({ titulo, secciones }: { titulo: string; secciones: SeccionLegal[] }) {
  const fecha = new Date(`${VERSION_LEGAL}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  return (
    <main className="min-h-screen bg-app px-4 py-10">
      <article className="mx-auto max-w-3xl rounded-2xl border border-surface-600 bg-surface-800 p-6 sm:p-10" data-testid="documento-legal">
        <Link href="/login" className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-gray-100">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <h1 className="text-2xl font-black text-gray-100">{titulo}</h1>
        <p className="mt-1 text-xs text-muted">Última actualización: {fecha}</p>
        <div className="mt-8 space-y-7">
          {secciones.map((s) => (
            <section key={s.titulo}>
              <h2 className="mb-2 font-bold text-gray-100">{s.titulo}</h2>
              {s.parrafos.map((p, i) => (
                <p key={i} className="mb-2 text-sm leading-relaxed text-gray-300">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
        <p className="mt-10 border-t border-surface-600 pt-4 text-xs text-muted">
          <Link href="/privacidad" className="hover:underline">Aviso de privacidad</Link>
          {" · "}
          <Link href="/terminos" className="hover:underline">Términos y condiciones</Link>
        </p>
      </article>
    </main>
  );
}
