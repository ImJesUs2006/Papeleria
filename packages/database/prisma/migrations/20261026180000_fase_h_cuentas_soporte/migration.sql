-- AlterTable
ALTER TABLE "negocios" ADD COLUMN     "permitirSoporte" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "terminosAceptadosEn" TIMESTAMP(3),
ADD COLUMN     "terminosAceptadosPor" TEXT,
ADD COLUMN     "terminosVersion" TEXT;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "email" TEXT;

-- CreateTable
CREATE TABLE "recuperaciones_clave" (
    "idNegocio" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "idPersona" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "usadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recuperaciones_clave_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recuperaciones_clave_tokenHash_key" ON "recuperaciones_clave"("tokenHash");

-- CreateIndex
CREATE INDEX "recuperaciones_clave_idPersona_idx" ON "recuperaciones_clave"("idPersona");

