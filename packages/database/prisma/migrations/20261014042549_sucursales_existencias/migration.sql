-- AlterTable
ALTER TABLE "movimientos_kardex" ADD COLUMN     "idSucursal" TEXT;

-- AlterTable
ALTER TABLE "sesiones_caja" ADD COLUMN     "idSucursal" TEXT;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "idSucursal" TEXT;

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "idSucursal" TEXT;

-- CreateTable
CREATE TABLE "sucursales" (
    "idSucursal" TEXT NOT NULL,
    "idNegocio" TEXT NOT NULL DEFAULT 'default',
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "esMatriz" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("idSucursal")
);

-- CreateTable
CREATE TABLE "existencias" (
    "idExistencia" TEXT NOT NULL,
    "idNegocio" TEXT NOT NULL DEFAULT 'default',
    "idSucursal" TEXT NOT NULL,
    "codigoItem" TEXT NOT NULL,
    "stock" DECIMAL(10,3) NOT NULL DEFAULT 0,

    CONSTRAINT "existencias_pkey" PRIMARY KEY ("idExistencia")
);

-- CreateTable
CREATE TABLE "traspasos" (
    "idTraspaso" TEXT NOT NULL,
    "idNegocio" TEXT NOT NULL DEFAULT 'default',
    "folio" TEXT NOT NULL,
    "idOrigen" TEXT NOT NULL,
    "idDestino" TEXT NOT NULL,
    "notas" TEXT,
    "idUsuario" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lineas" JSONB NOT NULL,

    CONSTRAINT "traspasos_pkey" PRIMARY KEY ("idTraspaso")
);

-- CreateIndex
CREATE INDEX "sucursales_idNegocio_idx" ON "sucursales"("idNegocio");

-- CreateIndex
CREATE UNIQUE INDEX "sucursales_idNegocio_nombre_key" ON "sucursales"("idNegocio", "nombre");

-- CreateIndex
CREATE INDEX "existencias_idNegocio_idx" ON "existencias"("idNegocio");

-- CreateIndex
CREATE UNIQUE INDEX "existencias_idSucursal_codigoItem_key" ON "existencias"("idSucursal", "codigoItem");

-- CreateIndex
CREATE UNIQUE INDEX "traspasos_folio_key" ON "traspasos"("folio");

-- CreateIndex
CREATE INDEX "traspasos_idNegocio_fecha_idx" ON "traspasos"("idNegocio", "fecha");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_idSucursal_fkey" FOREIGN KEY ("idSucursal") REFERENCES "sucursales"("idSucursal") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones_caja" ADD CONSTRAINT "sesiones_caja_idSucursal_fkey" FOREIGN KEY ("idSucursal") REFERENCES "sucursales"("idSucursal") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sucursales" ADD CONSTRAINT "sucursales_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_idSucursal_fkey" FOREIGN KEY ("idSucursal") REFERENCES "sucursales"("idSucursal") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_idNegocio_codigoItem_fkey" FOREIGN KEY ("idNegocio", "codigoItem") REFERENCES "productos"("idNegocio", "codigoItem") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill (Paso 5): cada negocio existente recibe su sucursal "Matriz",
-- que absorbe el stock, las cajas y las ventas registradas hasta hoy.
INSERT INTO "sucursales" ("idSucursal", "idNegocio", "nombre", "esMatriz")
SELECT gen_random_uuid()::text, n."idNegocio", 'Matriz', true
FROM "negocios" n
WHERE NOT EXISTS (
  SELECT 1 FROM "sucursales" s WHERE s."idNegocio" = n."idNegocio" AND s."esMatriz"
);

INSERT INTO "existencias" ("idExistencia", "idNegocio", "idSucursal", "codigoItem", "stock")
SELECT gen_random_uuid()::text, p."idNegocio", s."idSucursal", p."codigoItem", p."stockActual"
FROM "productos" p
JOIN "sucursales" s ON s."idNegocio" = p."idNegocio" AND s."esMatriz"
WHERE p."esServicio" = false;

UPDATE "sesiones_caja" c SET "idSucursal" = s."idSucursal"
FROM "sucursales" s WHERE s."idNegocio" = c."idNegocio" AND s."esMatriz" AND c."idSucursal" IS NULL;

UPDATE "ventas" v SET "idSucursal" = s."idSucursal"
FROM "sucursales" s WHERE s."idNegocio" = v."idNegocio" AND s."esMatriz" AND v."idSucursal" IS NULL;
