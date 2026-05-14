-- CreateTable
CREATE TABLE "LeaseStepRent" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "rentRate" DOUBLE PRECISION NOT NULL,
    "indexAfterEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaseStepRent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LeaseStepRent" ADD CONSTRAINT "LeaseStepRent_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "LeaseContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

