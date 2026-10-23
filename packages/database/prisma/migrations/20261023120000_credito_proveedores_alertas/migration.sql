-- AlterTable
ALTER TABLE "configuracion_negocio" ADD COLUMN     "diasApartado" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "pedidos_proveedor" ADD COLUMN     "condicionPago" TEXT NOT NULL DEFAULT 'CONTADO';

-- AlterTable
ALTER TABLE "proveedores" ADD COLUMN     "diasCredito" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "cuentas_por_pagar" (
    "idNegocio" TEXT NOT NULL DEFAULT 'default',
    "idCuenta" TEXT NOT NULL,
    "idProveedor" TEXT NOT NULL,
    "idPedido" TEXT,
    "concepto" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "saldo" DECIMAL(10,2) NOT NULL,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuentas_por_pagar_pkey" PRIMARY KEY ("idCuenta")
);

-- CreateTable
CREATE TABLE "alertas_descartadas" (
    "idNegocio" TEXT NOT NULL DEFAULT 'default',
    "idAlerta" TEXT NOT NULL,
    "idPersona" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "hasta" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alertas_descartadas_pkey" PRIMARY KEY ("idAlerta")
);

-- CreateIndex
CREATE INDEX "cuentas_por_pagar_idNegocio_estado_fechaVencimiento_idx" ON "cuentas_por_pagar"("idNegocio", "estado", "fechaVencimiento");

-- CreateIndex
CREATE INDEX "cuentas_por_pagar_idProveedor_idx" ON "cuentas_por_pagar"("idProveedor");

-- CreateIndex
CREATE INDEX "alertas_descartadas_idNegocio_idx" ON "alertas_descartadas"("idNegocio");

-- CreateIndex
CREATE UNIQUE INDEX "alertas_descartadas_idPersona_clave_key" ON "alertas_descartadas"("idPersona", "clave");

-- AddForeignKey
ALTER TABLE "cuentas_por_pagar" ADD CONSTRAINT "cuentas_por_pagar_idProveedor_fkey" FOREIGN KEY ("idProveedor") REFERENCES "proveedores"("idProveedor") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_por_pagar" ADD CONSTRAINT "cuentas_por_pagar_idPedido_fkey" FOREIGN KEY ("idPedido") REFERENCES "pedidos_proveedor"("idPedido") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_por_pagar" ADD CONSTRAINT "cuentas_por_pagar_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas_descartadas" ADD CONSTRAINT "alertas_descartadas_idPersona_fkey" FOREIGN KEY ("idPersona") REFERENCES "usuarios"("idPersona") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas_descartadas" ADD CONSTRAINT "alertas_descartadas_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

