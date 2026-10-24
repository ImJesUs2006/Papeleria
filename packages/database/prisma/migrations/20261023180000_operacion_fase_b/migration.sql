-- AlterEnum
ALTER TYPE "EstadoFactura" ADD VALUE 'PENDIENTE';

-- AlterTable
ALTER TABLE "categorias" ADD COLUMN     "orden" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "codigoPostalFiscal" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "notas" TEXT,
ADD COLUMN     "regimenFiscal" TEXT,
ADD COLUMN     "usoCfdi" TEXT;

-- AlterTable
ALTER TABLE "configuracion_negocio" ADD COLUMN     "corteConReferencia" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "diasDevolucion" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "montoAutorizarDevolucion" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "devolucion_lineas" ADD COLUMN     "destino" TEXT NOT NULL DEFAULT 'INVENTARIO';

-- AlterTable
ALTER TABLE "devoluciones" ADD COLUMN     "autorizadoPor" TEXT,
ADD COLUMN     "motivoCategoria" TEXT;

-- AlterTable
ALTER TABLE "facturas" ADD COLUMN     "fechaTimbrado" TIMESTAMP(3),
ADD COLUMN     "folioFiscal" TEXT;

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "escalasPrecio" JSONB;

-- AlterTable
ALTER TABLE "sesiones_caja" ADD COLUMN     "conteoDenominaciones" JSONB;

