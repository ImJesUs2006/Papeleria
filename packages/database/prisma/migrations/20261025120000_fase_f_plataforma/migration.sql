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
