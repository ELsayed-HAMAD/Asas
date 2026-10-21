ALTER TABLE "Member"
  ADD COLUMN "seatReservationId" TEXT;

ALTER TABLE "Invitation"
  ADD COLUMN "seatReservationId" TEXT;

CREATE INDEX "Member_tenantId_seatReservationId_idx"
  ON "Member"("tenantId", "seatReservationId");
CREATE INDEX "Invitation_tenantId_seatReservationId_idx"
  ON "Invitation"("tenantId", "seatReservationId");

CREATE TABLE "SeatReservation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "invitationId" TEXT,
  "purpose" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeatReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SeatReservation_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SeatReservation_tenantId_invitationId_key"
  ON "SeatReservation"("tenantId", "invitationId");
CREATE INDEX "SeatReservation_tenantId_expiresAt_idx"
  ON "SeatReservation"("tenantId", "expiresAt");

ALTER TABLE "SeatReservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SeatReservation" FORCE ROW LEVEL SECURITY;
CREATE POLICY asas_tenant_isolation ON "SeatReservation"
  FOR ALL
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
