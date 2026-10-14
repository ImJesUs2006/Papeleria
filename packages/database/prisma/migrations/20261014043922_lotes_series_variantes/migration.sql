-- AlterTable
ALTER TABLE "lineas_detalle_venta" ADD COLUMN     "lotes" JSONB,
ADD COLUMN     "series" JSONB;

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "atributosVariante" JSONB,
ADD COLUMN     "grupoVariante" TEXT,
ADD COLUMN     "usaLotes" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "usaSeries" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "lotes" (
    "idLote" TEXT NOT NULL,
    "idNegocio" TEXT NOT NULL DEFAULT 'default',
    "idSucursal" TEXT NOT NULL,
    "codigoItem" TEXT NOT NULL,
    "numeroLote" TEXT NOT NULL,
    "caducidad" TIMESTAMP(3),
    "cantidad" DECIMAL(10,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lotes_pkey" PRIMARY KEY ("idLote")
);

-- CreateTable
CREATE TABLE "numeros_serie" (
    "idSerie" TEXT NOT NULL,
    "idNegocio" TEXT NOT NULL DEFAULT 'default',
    "idSucursal" TEXT NOT NULL,
    "codigoItem" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'DISPONIBLE',
    "folioVenta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "numeros_serie_pkey" PRIMARY KEY ("idSerie")
);

-- CreateIndex
CREATE INDEX "lotes_idNegocio_caducidad_idx" ON "lotes"("idNegocio", "caducidad");

-- CreateIndex
CREATE UNIQUE INDEX "lotes_idSucursal_codigoItem_numeroLote_key" ON "lotes"("idSucursal", "codigoItem", "numeroLote");

-- CreateIndex
CREATE INDEX "numeros_serie_idNegocio_estado_idx" ON "numeros_serie"("idNegocio", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "numeros_serie_idNegocio_codigoItem_serie_key" ON "numeros_serie"("idNegocio", "codigoItem", "serie");

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_idNegocio_codigoItem_fkey" FOREIGN KEY ("idNegocio", "codigoItem") REFERENCES "productos"("idNegocio", "codigoItem") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "numeros_serie" ADD CONSTRAINT "numeros_serie_idNegocio_codigoItem_fkey" FOREIGN KEY ("idNegocio", "codigoItem") REFERENCES "productos"("idNegocio", "codigoItem") ON DELETE RESTRICT ON UPDATE CASCADE;
