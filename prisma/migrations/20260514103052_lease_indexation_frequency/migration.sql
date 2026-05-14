-- AlterTable
ALTER TABLE "LeaseContract" ADD COLUMN     "firstIndexationDate" TIMESTAMP(3),
ADD COLUMN     "indexationFrequency" INTEGER,
ADD COLUMN     "opexFirstIndexationDate" TIMESTAMP(3),
ADD COLUMN     "opexIndexationFrequency" INTEGER;

