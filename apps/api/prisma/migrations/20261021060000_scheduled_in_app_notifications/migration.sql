ALTER TABLE "Notification"
ADD COLUMN "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Notification_tenantId_availableAt_idx"
ON "Notification"("tenantId", "availableAt");
