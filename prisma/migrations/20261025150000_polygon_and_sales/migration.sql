-- Colonnes ajoutées au schéma par les PR #1 et #2 sans migration (contours inclinés, ventes estimées).
-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "sales12m" INTEGER,
ADD COLUMN     "sales30d" INTEGER;

-- AlterTable
ALTER TABLE "Detection" ADD COLUMN     "polygon" JSONB,
ADD COLUMN     "textDirection" TEXT;

