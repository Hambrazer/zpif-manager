-- V3.8.1: Pipeline status + many-to-many fund ↔ property через FundProperty
-- Сохраняем существующую связь Property.fundId, перенося её в FundProperty (ownershipPct=100).

-- 1. Новый enum PipelineStatus
CREATE TYPE "PipelineStatus" AS ENUM (
    'SCREENING',
    'DUE_DILIGENCE',
    'APPROVED',
    'IN_FUND',
    'REJECTED',
    'SOLD'
);

-- 2. Колонка pipelineStatus у Property (существующие строки → IN_FUND, у них уже есть фонд)
ALTER TABLE "Property" ADD COLUMN "pipelineStatus" "PipelineStatus" NOT NULL DEFAULT 'IN_FUND';
ALTER TABLE "Property" ALTER COLUMN "pipelineStatus" SET DEFAULT 'SCREENING';

-- 3. Промежуточная таблица FundProperty (many-to-many)
CREATE TABLE "FundProperty" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "ownershipPct" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundProperty_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FundProperty_fundId_propertyId_key"
    ON "FundProperty"("fundId", "propertyId");

CREATE INDEX "FundProperty_propertyId_idx" ON "FundProperty"("propertyId");

ALTER TABLE "FundProperty" ADD CONSTRAINT "FundProperty_fundId_fkey"
    FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FundProperty" ADD CONSTRAINT "FundProperty_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Перенос данных: каждая существующая Property.fundId → строка в FundProperty (100% владения)
INSERT INTO "FundProperty" ("id", "fundId", "propertyId", "ownershipPct", "addedAt")
SELECT
    'fp_' || replace(gen_random_uuid()::text, '-', ''),
    "fundId",
    "id",
    100,
    NOW()
FROM "Property";

-- 5. Удаляем старый прямой FK Property.fundId
ALTER TABLE "Property" DROP CONSTRAINT "Property_fundId_fkey";
ALTER TABLE "Property" DROP COLUMN "fundId";
