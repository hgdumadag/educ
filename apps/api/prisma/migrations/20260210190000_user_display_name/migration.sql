-- Add optional display name for imported/managed identities.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "displayName" TEXT;

