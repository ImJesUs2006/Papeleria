-- CreateTable
CREATE TABLE "plataforma_logs" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accion" TEXT NOT NULL,
    "idNegocio" TEXT,
    "detalle" JSONB,
    CONSTRAINT "plataforma_logs_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "plataforma_logs_fecha_idx" ON "plataforma_logs"("fecha");

-- Fase F · tipos de usuario: cada negocio necesita un dueño(a). En los
-- negocios que no tienen uno marcado (datos anteriores), la administradora
-- activa más antigua queda como dueña; después puede transferir la propiedad.
UPDATE "usuarios" SET "isRoot" = true
WHERE "idPersona" IN (
  SELECT DISTINCT ON (x."idNegocio") x."idPersona"
  FROM "usuarios" x
  WHERE x."rol" = 'ADMINISTRADORA'
    AND x."activa" = true
    AND NOT EXISTS (
      SELECT 1 FROM "usuarios" r WHERE r."idNegocio" = x."idNegocio" AND r."isRoot" = true AND r."activa" = true
    )
  ORDER BY x."idNegocio", x."createdAt" ASC
);
