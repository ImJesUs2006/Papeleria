// ============================================================
// Service worker del POS (Paso 8): la aplicación abre sin servidor.
//
//   /_next/static/*  → caché primero (archivos con hash, inmutables)
//   páginas          → red primero; sin red, la última copia (o /cobro)
//   /api/*           → SIEMPRE red (nunca se guardan datos de negocio)
//
// Las ventas sin red las encola la app en IndexedDB y se sincronizan
// al volver la conexión.
// ============================================================

const VERSION = "papeleria-v1";
const ESTATICOS = `${VERSION}-estaticos`;
const PAGINAS = `${VERSION}-paginas`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((c) => !c.startsWith(VERSION)).map((c) => caches.delete(c)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(ESTATICOS).then(async (cache) => {
        const guardada = await cache.match(req);
        if (guardada) return guardada;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGINAS);
        try {
          const res = await fetch(req);
          // No se guarda la redirección al login ni páginas de error.
          if (res.ok && !res.redirected) cache.put(req, res.clone());
          return res;
        } catch {
          return (
            (await cache.match(req)) ||
            (await cache.match("/cobro")) ||
            new Response(
              "<h1>Sin conexión</h1><p>Abre el punto de venta una vez con conexión para usarlo sin red.</p>",
              { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 }
            )
          );
        }
      })()
    );
  }
});
