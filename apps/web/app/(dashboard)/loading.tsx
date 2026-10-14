import { Skeleton } from "@/components/ui/skeleton";

// Respuesta inmediata al cambiar de módulo: el menú se queda y aquí se
// muestra un esqueleto mientras llega el código de la página.
export default function CargandoModulo() {
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-label="Cargando módulo">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
