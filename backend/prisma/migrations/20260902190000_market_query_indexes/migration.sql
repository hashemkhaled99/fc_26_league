-- CreateIndex
CREATE INDEX IF NOT EXISTS "Player_roomId_status_isIcon_isHero_idx" ON "Player"("roomId", "status", "isIcon", "isHero");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Player_roomId_isIcon_isHero_idx" ON "Player"("roomId", "isIcon", "isHero");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Auction_roomId_status_endsAt_idx" ON "Auction"("roomId", "status", "endsAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Auction_playerId_status_idx" ON "Auction"("playerId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Auction_status_currentBidderId_idx" ON "Auction"("status", "currentBidderId");
