-- Statut d'un scan dont les photos sont encore en cours d'envoi (une requête par photo).
ALTER TYPE "ScanStatus" ADD VALUE 'UPLOADING' BEFORE 'PENDING';
