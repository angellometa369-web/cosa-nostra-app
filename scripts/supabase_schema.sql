-- =============================================================================
-- COSA NOSTRA APP - ESQUEMA OFICIAL SUPABASE (PostgreSQL DDL)
-- =============================================================================

-- 1. AUTH & USERS
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT UNIQUE NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "alias" TEXT,
  "avatarUrl" TEXT,
  "role" TEXT NOT NULL DEFAULT 'soldado',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Account" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT,
  CONSTRAINT "Account_provider_providerAccountId_key" UNIQUE ("provider", "providerAccountId")
);

CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT PRIMARY KEY,
  "sessionToken" TEXT UNIQUE NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "VerificationToken" (
  "identifier" TEXT NOT NULL,
  "token" TEXT UNIQUE NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VerificationToken_identifier_token_key" UNIQUE ("identifier", "token")
);

-- 2. PLAYERS & EXTERNAL IDENTITIES
CREATE TABLE IF NOT EXISTS "Player" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE REFERENCES "User"("id") ON DELETE SET NULL,
  "displayName" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "club" TEXT,
  "normalizedClub" TEXT,
  "rankingPoints" INTEGER NOT NULL DEFAULT 1000,
  "efficiency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "wins" INTEGER NOT NULL DEFAULT 0,
  "losses" INTEGER NOT NULL DEFAULT 0,
  "tournamentsPlayed" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Player_normalizedName_idx" ON "Player"("normalizedName");
CREATE INDEX IF NOT EXISTS "Player_normalizedClub_idx" ON "Player"("normalizedClub");
CREATE INDEX IF NOT EXISTS "Player_active_idx" ON "Player"("active");

CREATE TABLE IF NOT EXISTS "ExternalIdentity" (
  "id" TEXT PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL REFERENCES "Player"("id") ON DELETE CASCADE,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalIdentity_provider_externalId_key" UNIQUE ("provider", "externalId")
);

CREATE INDEX IF NOT EXISTS "ExternalIdentity_playerId_idx" ON "ExternalIdentity"("playerId");

CREATE TABLE IF NOT EXISTS "ClubAlias" (
  "id" TEXT PRIMARY KEY,
  "alias" TEXT UNIQUE NOT NULL,
  "canonical" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ClubAlias_canonical_idx" ON "ClubAlias"("canonical");

-- 3. SEASONS, TOURNAMENTS & RESULTS
CREATE TABLE IF NOT EXISTS "Season" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ImportBatch" (
  "id" TEXT PRIMARY KEY,
  "source" TEXT NOT NULL DEFAULT 'betadomino',
  "originalFilename" TEXT NOT NULL,
  "fileHash" TEXT UNIQUE NOT NULL,
  "externalKey" TEXT NOT NULL,
  "detectedType" TEXT NOT NULL,
  "tournamentName" TEXT NOT NULL,
  "tournamentDate" TEXT NOT NULL,
  "roundNumber" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'preview',
  "statsJson" TEXT,
  "notes" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  "confirmedById" TEXT REFERENCES "User"("id")
);

CREATE INDEX IF NOT EXISTS "ImportBatch_externalKey_idx" ON "ImportBatch"("externalKey");
CREATE INDEX IF NOT EXISTS "ImportBatch_status_idx" ON "ImportBatch"("status");

CREATE TABLE IF NOT EXISTS "Tournament" (
  "id" TEXT PRIMARY KEY,
  "seasonId" TEXT REFERENCES "Season"("id"),
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'individual',
  "format" TEXT,
  "status" TEXT NOT NULL DEFAULT 'upcoming',
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "location" TEXT,
  "description" TEXT,
  "roundCount" INTEGER,
  "externalSource" TEXT,
  "externalKey" TEXT UNIQUE,
  "importBatchId" TEXT UNIQUE REFERENCES "ImportBatch"("id"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Tournament_status_idx" ON "Tournament"("status");
CREATE INDEX IF NOT EXISTS "Tournament_type_idx" ON "Tournament"("type");

CREATE TABLE IF NOT EXISTS "TournamentResult" (
  "id" TEXT PRIMARY KEY,
  "tournamentId" TEXT NOT NULL REFERENCES "Tournament"("id") ON DELETE CASCADE,
  "playerId" TEXT NOT NULL REFERENCES "Player"("id"),
  "position" INTEGER NOT NULL,
  "pairId" TEXT,
  "partnerPlayerId" TEXT,
  "pj" INTEGER NOT NULL,
  "pg" INTEGER NOT NULL,
  "pp" INTEGER NOT NULL,
  "efe" INTEGER NOT NULL,
  "pf" INTEGER NOT NULL,
  "pc" INTEGER NOT NULL,
  "pm" INTEGER NOT NULL DEFAULT 0,
  "avg" DOUBLE PRECISION NOT NULL,
  "sanctions" INTEGER,
  "rawName" TEXT,
  "rawClub" TEXT,
  "rawBetaId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentResult_tournamentId_playerId_key" UNIQUE ("tournamentId", "playerId")
);

CREATE INDEX IF NOT EXISTS "TournamentResult_playerId_idx" ON "TournamentResult"("playerId");
CREATE INDEX IF NOT EXISTS "TournamentResult_position_idx" ON "TournamentResult"("position");

CREATE TABLE IF NOT EXISTS "Match" (
  "id" TEXT PRIMARY KEY,
  "tournamentId" TEXT NOT NULL REFERENCES "Tournament"("id") ON DELETE CASCADE,
  "tableNumber" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "winnerSide" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "MatchPlayer" (
  "id" TEXT PRIMARY KEY,
  "matchId" TEXT NOT NULL REFERENCES "Match"("id") ON DELETE CASCADE,
  "playerId" TEXT NOT NULL REFERENCES "Player"("id"),
  "side" TEXT NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 0,
  "position" INTEGER,
  CONSTRAINT "MatchPlayer_matchId_playerId_key" UNIQUE ("matchId", "playerId")
);

CREATE TABLE IF NOT EXISTS "RankingSnapshot" (
  "id" TEXT PRIMARY KEY,
  "seasonId" TEXT NOT NULL REFERENCES "Season"("id"),
  "playerId" TEXT NOT NULL REFERENCES "Player"("id"),
  "position" INTEGER NOT NULL,
  "points" INTEGER NOT NULL,
  "efficiency" DOUBLE PRECISION NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "importBatchId" TEXT REFERENCES "ImportBatch"("id"),
  CONSTRAINT "RankingSnapshot_seasonId_playerId_recordedAt_key" UNIQUE ("seasonId", "playerId", "recordedAt")
);

CREATE INDEX IF NOT EXISTS "RankingSnapshot_seasonId_position_idx" ON "RankingSnapshot"("seasonId", "position");

CREATE TABLE IF NOT EXISTS "RankingChange" (
  "id" TEXT PRIMARY KEY,
  "importBatchId" TEXT NOT NULL REFERENCES "ImportBatch"("id") ON DELETE CASCADE,
  "seasonId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL REFERENCES "Player"("id"),
  "previousPosition" INTEGER,
  "newPosition" INTEGER NOT NULL,
  "previousPoints" INTEGER,
  "newPoints" INTEGER NOT NULL,
  "previousWins" INTEGER,
  "newWins" INTEGER NOT NULL,
  "previousLosses" INTEGER,
  "newLosses" INTEGER NOT NULL,
  "previousEfficiency" DOUBLE PRECISION,
  "newEfficiency" DOUBLE PRECISION NOT NULL,
  "deltaPosition" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "RankingChange_importBatchId_idx" ON "RankingChange"("importBatchId");
CREATE INDEX IF NOT EXISTS "RankingChange_playerId_idx" ON "RankingChange"("playerId");

CREATE TABLE IF NOT EXISTS "ImportDecision" (
  "id" TEXT PRIMARY KEY,
  "importBatchId" TEXT NOT NULL REFERENCES "ImportBatch"("id") ON DELETE CASCADE,
  "rowIndex" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "proposedPlayerId" TEXT,
  "selectedPlayerId" TEXT,
  "confidence" DOUBLE PRECISION,
  "matchStatus" TEXT NOT NULL,
  "rawDataJson" TEXT NOT NULL,
  "decidedById" TEXT REFERENCES "User"("id"),
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ImportDecision_importBatchId_idx" ON "ImportDecision"("importBatchId");

-- 4. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id" TEXT PRIMARY KEY,
  "endpoint" TEXT UNIQUE NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "topics" TEXT NOT NULL DEFAULT '["ranking","tournaments","results"]',
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "InAppNotification" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT REFERENCES "User"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'info',
  "url" TEXT,
  "topic" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS "NotificationRead" (
  "id" TEXT PRIMARY KEY,
  "notificationId" TEXT NOT NULL REFERENCES "InAppNotification"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationRead_notificationId_userId_key" UNIQUE ("notificationId", "userId")
);
