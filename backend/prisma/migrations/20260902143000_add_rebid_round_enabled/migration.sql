-- AlterTable
ALTER TABLE "RoomSettings" ADD COLUMN IF NOT EXISTS "rebidRoundEnabled" BOOLEAN NOT NULL DEFAULT false;
