-- Notifications are delivered to individual workspace members. A nullable userId
-- made shared rows visible to every member while sharing a single read/delete state.
-- Fan existing shared rows out to current tenant members before enforcing ownership.
INSERT INTO "Notification" (
  "id", "tenantId", "userId", "title", "message", "type", "link", "read", "availableAt", "createdAt"
)
SELECT
  'ntf_' || md5(notification."id" || ':' || member."userId"),
  notification."tenantId",
  member."userId",
  notification."title",
  notification."message",
  notification."type",
  notification."link",
  notification."read",
  notification."availableAt",
  notification."createdAt"
FROM "Notification" AS notification
JOIN "Member" AS member ON member."tenantId" = notification."tenantId"
WHERE notification."userId" IS NULL
ON CONFLICT ("id") DO NOTHING;

-- Rows with no current tenant members have no valid recipient and are discarded.
DELETE FROM "Notification" WHERE "userId" IS NULL;

ALTER TABLE "Notification" ALTER COLUMN "userId" SET NOT NULL;
