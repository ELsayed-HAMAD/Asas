-- Remember which sessions proved a second factor. The platform console uses this marker
-- to step-up OAuth, trusted-device, and pre-migration sessions that never passed through
-- Better Auth's TOTP challenge.
ALTER TABLE "Session"
  ADD COLUMN "twoFactorVerifiedAt" TIMESTAMP(3);
