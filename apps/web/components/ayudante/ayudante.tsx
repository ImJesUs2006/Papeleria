"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Circle, ListChecks, MessageCircleQuestion, RotateCcw, Sparkles, X } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { pasosDe, TEMA_GENERAL, temaPara, type Pregunta, type Progreso } from "@/lib/ayudante";
import { cn } from "@/lib/utils";
import { ContactoSoporteAyudante } from "@/components/ayudante/contacto-soporte";

// ============================================================
// Ayudante (mascota) con guiones: se abre desde el pie del menú, habla
// del módulo en el que estás y lleva la lista de "Primeros pasos".
// Sin IA: todo el texto vive en lib/ayudante.ts.
// ============================================================

interface Burbuja {
  de: "ayudante" | "usuario";
  texto: string;
  ir?: Pregunta["ir"];
}

const llaveSaludo = (id: string | null) => `ayudante:saludo:${id ?? "anon"}`;

function leer(llave: string): string | null {
  try {
    return localStorage.getItem(llave);
  } catch {
    return null;
  }
}
function guardar(llave: string, valor: string) {
  try {
    localStorage.setItem(llave, valor);
  } catch {
    /* modo privado: solo se pierde el "ya te saludé" */
  }
}

/** Carita del ayudante: un clip con ojos, va con el giro de papelería y con cualquiera. */
function Mascota({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("flex items-center justify-center rounded-2xl bg-acento/15 text-acento", className)}
    >
      <svg viewBox="0 0 32 32" className="h-[70%] w-[70%]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M11 22V9a5 5 0 0 1 10 0v15a7 7 0 0 1-14 0V12" />
        <circle cx="14" cy="14" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="18" cy="14" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export function Ayudante() {
  const pathname = usePathname() ?? "/";
  const { idPersona, nombre, rol } = useAuthStore();
  const [abierto, setAbierto] = useState(false);
  const [vista, setVista] = useState<"charla" | "pasos">("charla");
  const [charla, setCharla] = useState<Burbuja[]>([]);
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const fin = useRef<HTMLDivElement>(null);

  const tema = useMemo(() => temaPara(pathname), [pathname]);
  const pasos = useMemo(() => pasosDe(rol), [rol]);
  const hechos = progreso ? pasos.filter((p) => progreso[p.id]).length : 0;
  const pendientes = pasos.length - hechos;

  const cargarProgreso = useCallback(() => {
    fetch("/api/ayudante/progreso", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.progreso && setProgreso(d.progreso))
      .catch(() => {});
  }, []);

  const reiniciar = useCallback(() => {
    const primerNombre = nombre?.split(" ")[0];
    setCharla([{ de: "ayudante", texto: `${primerNombre ? `¡Hola, ${primerNombre}! ` : ""}${tema.saludo}` }]);
  }, [nombre, tema]);

  // Cada módulo empieza su propia conversación.
  useEffect(() => {
    reiniciar();
  }, [reiniciar]);

  // Primera vez de este usuario: el botón pulsa (sin abrirse encima del
  // trabajo) y al abrirlo arranca en los primeros pasos.
  useEffect(() => {
    setNuevo(!!idPersona && !leer(llaveSaludo(idPersona)));
  }, [idPersona]);

  const alternar = () => {
    if (nuevo) {
      guardar(llaveSaludo(idPersona), "1");
      setNuevo(false);
      setVista("pasos");
    }
    setAbierto((v) => !v);
  };

  useEffect(() => {
    if (abierto) cargarProgreso();
  }, [abierto, cargarProgreso, pathname]);

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [charla]);

  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [abierto]);

  const preguntar = (p: Pregunta) => {
    setCharla((c) => [
      ...c,
      { de: "usuario", texto: p.pregunta },
      ...p.respuesta.map((texto, i) => ({
        de: "ayudante" as const,
        texto,
        ir: i === p.respuesta.length - 1 ? p.ir : undefined,
      })),
    ]);
  };

  const yaPreguntadas = new Set(charla.filter((b) => b.de === "usuario").map((b) => b.texto));
  const sugeridas = [...tema.preguntas, ...(tema === TEMA_GENERAL ? [] : TEMA_GENERAL.preguntas)].filter(
    (p) => !yaPreguntadas.has(p.pregunta)
  );

  return (
    <>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        data-testid="ayudante-boton"
        className="relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-all hover:bg-surface-700 hover:text-gray-100"
      >
        <span className="relative">
          <Mascota className="h-6 w-6 rounded-lg" />
          {nuevo && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-acento" />}
        </span>
        <span>{nuevo ? "¡Hola! Te ayudo a empezar" : "Ayudante"}</span>
        {progreso && pendientes > 0 && (
          <span className="ml-auto rounded-full bg-acento/20 px-1.5 text-[10px] font-bold text-acento" title="Primeros pasos pendientes">
            {pendientes}
          </span>
        )}
      </button>

      <AnimatePresence>
        {abierto && (
          <motion.section
            role="dialog"
            aria-label="Ayudante"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-4 left-[17rem] z-50 flex max-h-[min(36rem,calc(100vh-2rem))] w-[22rem] max-w-[calc(100vw-18rem)] flex-col overflow-hidden rounded-3xl border border-surface-600 bg-surface-800 shadow-2xl"
          >
            <header className="flex items-center gap-3 border-b border-surface-600 px-4 py-3">
              <Mascota className="h-9 w-9" />
              <div className="min-w-0 flex-1">
                <p className="font-black text-gray-100">Ayudante</p>
                <p className="truncate text-[11px] text-muted">Te explico: {tema.titulo}</p>
              </div>
              <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar ayudante" className="text-muted hover:text-gray-100">
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="flex gap-1 border-b border-surface-600 p-1.5" role="tablist">
              {(
                [
                  ["charla", "Preguntas", MessageCircleQuestion],
                  ["pasos", `Primeros pasos ${progreso ? `${hechos}/${pasos.length}` : ""}`, ListChecks],
                ] as const
              ).map(([id, etiqueta, Icono]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={vista === id}
                  onClick={() => setVista(id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-bold",
                    vista === id ? "bg-acento/15 text-acento" : "text-muted hover:text-gray-100"
                  )}
                >
                  <Icono className="h-3.5 w-3.5" /> {etiqueta}
                </button>
              ))}
            </div>

            {vista === "charla" ? (
              <>
                <div className="flex-1 space-y-2 overflow-y-auto p-4" aria-live="polite">
                  {charla.map((b, i) => (
                    <div key={i} className={cn("flex", b.de === "usuario" ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug",
                          b.de === "usuario"
                            ? "rounded-br-md bg-acento/20 text-gray-100"
                            : "rounded-bl-md border border-surface-600 bg-surface-700 text-gray-200"
                        )}
                      >
                        {b.texto}
                        {b.ir && (
                          <Link
                            href={b.ir.href}
                            onClick={() => setAbierto(false)}
                            className="mt-2 flex items-center gap-1 text-xs font-bold text-acento hover:underline"
                          >
                            {b.ir.etiqueta} <ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={fin} />
                </div>
                <div className="space-y-1.5 border-t border-surface-600 p-3">
                  {sugeridas.slice(0, 4).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => preguntar(p)}
                      className="block w-full rounded-xl border border-surface-500 px-3 py-1.5 text-left text-xs text-gray-200 hover:border-acento/60 hover:text-acento"
                    >
                      {p.pregunta}
                    </button>
                  ))}
                  {sugeridas.length === 0 && (
                    <p className="text-center text-xs text-muted">Ya vimos todo lo de este módulo.</p>
                  )}
                  {charla.length > 1 && (
                    <button
                      type="button"
                      onClick={reiniciar}
                      className="flex w-full items-center justify-center gap-1 pt-1 text-[11px] text-muted hover:text-gray-100"
                    >
                      <RotateCcw className="h-3 w-3" /> Empezar de nuevo
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto p-4">
                {progreso && pendientes === 0 ? (
                  <p className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300">
                    <Sparkles className="h-4 w-4 shrink-0" /> ¡Listo! Ya completaste los primeros pasos.
                  </p>
                ) : (
                  <p className="mb-3 text-sm text-gray-200">
                    Para dejar todo funcionando, sigue estos pasos. Se marcan solos cuando los haces.
                  </p>
                )}
                <ol className="space-y-2">
                  {pasos.map((p) => {
                    const hecho = progreso?.[p.id] ?? false;
                    return (
                      <li key={p.id}>
                        <Link
                          href={p.href}
                          onClick={() => setAbierto(false)}
                          className={cn(
                            "flex items-start gap-3 rounded-xl border p-3 transition-colors",
                            hecho ? "border-surface-600 opacity-70" : "border-surface-500 hover:border-acento/60"
                          )}
                          data-testid={`paso-${p.id}`}
                          data-hecho={hecho}
                        >
                          {hecho ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                          ) : (
                            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                          )}
                          <span className="min-w-0">
                            <span className={cn("block text-sm font-bold", hecho ? "text-muted line-through" : "text-gray-100")}>
                              {p.titulo}
                            </span>
                            <span className="block text-xs text-muted">{p.detalle}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
            <ContactoSoporteAyudante />
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
