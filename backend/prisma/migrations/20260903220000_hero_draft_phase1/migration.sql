-- CreateEnum
CREATE TYPE "RoomMode" AS ENUM ('FREE_MARKET', 'HERO_DRAFT');

-- CreateEnum
CREATE TYPE "PlayerTier" AS ENUM ('GOLD', 'HERO', 'ICON');

-- AlterTable Room
ALTER TABLE "Room" ADD COLUMN "mode" "RoomMode" NOT NULL DEFAULT 'FREE_MARKET';

-- AlterTable Player
ALTER TABLE "Player" ADD COLUMN "tier" "PlayerTier" NOT NULL DEFAULT 'GOLD';

-- Backfill tier from legacy flags
UPDATE "Player" SET "tier" = 'ICON' WHERE "isIcon" = true;
UPDATE "Player" SET "tier" = 'HERO' WHERE "isHero" = true AND "isIcon" = false;

-- AlterTable SquadPlayer
ALTER TABLE "SquadPlayer" ADD COLUMN "draftSlotIndex" INTEGER;
ALTER TABLE "SquadPlayer" ADD COLUMN "draftAcquisition" TEXT;

-- CreateIndex
CREATE INDEX "Player_roomId_status_tier_position_idx" ON "Player"("roomId", "status", "tier", "position");

-- CreateTable HeroDraftSettings
CREATE TABLE "HeroDraftSettings" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "startingBudget" INTEGER NOT NULL DEFAULT 500000000,
    "bidTimerSeconds" INTEGER NOT NULL DEFAULT 60,
    "tierWeightGold" INTEGER NOT NULL DEFAULT 70,
    "tierWeightHero" INTEGER NOT NULL DEFAULT 25,
    "tierWeightIcon" INTEGER NOT NULL DEFAULT 5,
    "goldenRoundMinRating" INTEGER NOT NULL DEFAULT 80,
    "turnHolderMustOpenBid" BOOLEAN NOT NULL DEFAULT true,
    "bidTurnTimeoutSeconds" INTEGER NOT NULL DEFAULT 20,
    "passiveDeductionRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "tradeWindowMinutes" INTEGER NOT NULL DEFAULT 30,
    "tradeWindowEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HeroDraftSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HeroDraftSettings_roomId_key" ON "HeroDraftSettings"("roomId");

ALTER TABLE "HeroDraftSettings" ADD CONSTRAINT "HeroDraftSettings_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable HeroDraftState
CREATE TABLE "HeroDraftState" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "goldenRoundIndex" INTEGER,
    "turnQueue" TEXT[],
    "turnQueuePointer" INTEGER NOT NULL DEFAULT 0,
    "biddingOrder" TEXT[],
    "slotTemplate" JSONB NOT NULL,
    "filledSlotIndexes" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "tierWeights" JSONB NOT NULL,
    "goldenRoundMinRating" INTEGER NOT NULL DEFAULT 80,
    "tradeWindowEndsAt" TIMESTAMP(3),
    "currentSlotIndex" INTEGER,
    "currentAuctionedPlayerId" TEXT,
    "currentTurnHolderId" TEXT,
    "currentRoundActiveBidders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentRoundPassedBidders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentRoundLastBids" JSONB,
    "currentRoundHighestBid" INTEGER,
    "currentRoundHighestBidderId" TEXT,
    "currentRoundTurnUserId" TEXT,
    "currentRoundTurnExpiresAt" TIMESTAMP(3),
    "pendingReleaseUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HeroDraftState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HeroDraftState_roomId_key" ON "HeroDraftState"("roomId");

ALTER TABLE "HeroDraftState" ADD CONSTRAINT "HeroDraftState_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable ForcedPlayerRelease
CREATE TABLE "ForcedPlayerRelease" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "releasedPlayerId" TEXT NOT NULL,
    "refundAmount" INTEGER NOT NULL,
    "downgradeSlotIndex" INTEGER NOT NULL,
    "downgradePlayerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForcedPlayerRelease_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ForcedPlayerRelease_roomId_userId_idx" ON "ForcedPlayerRelease"("roomId", "userId");

ALTER TABLE "ForcedPlayerRelease" ADD CONSTRAINT "ForcedPlayerRelease_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable DraftRoundHistory
CREATE TABLE "DraftRoundHistory" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "slotPosition" TEXT NOT NULL,
    "isGoldenRound" BOOLEAN NOT NULL DEFAULT false,
    "auctionedPlayerId" TEXT NOT NULL,
    "turnHolderId" TEXT NOT NULL,
    "winnerId" TEXT NOT NULL,
    "winningBid" INTEGER NOT NULL,
    "passOrder" JSONB NOT NULL,
    "randomRolls" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftRoundHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DraftRoundHistory_roomId_roundIndex_key" ON "DraftRoundHistory"("roomId", "roundIndex");
CREATE INDEX "DraftRoundHistory_roomId_idx" ON "DraftRoundHistory"("roomId");

ALTER TABLE "DraftRoundHistory" ADD CONSTRAINT "DraftRoundHistory_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
