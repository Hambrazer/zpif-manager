-- AlterTable
ALTER TABLE "CapexItem" ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "CapexReserve" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "ratePerSqm" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "indexationType" "IndexationType" NOT NULL,
    "indexationRate" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapexReserve_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CapexReserve_propertyId_key" ON "CapexReserve"("propertyId");

-- AddForeignKey
ALTER TABLE "CapexReserve" ADD CONSTRAINT "CapexReserve_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

