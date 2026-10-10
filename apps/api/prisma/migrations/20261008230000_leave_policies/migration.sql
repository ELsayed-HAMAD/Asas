CREATE TABLE "LeavePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "annualAllowanceDays" INTEGER NOT NULL,
    "weekdaysOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeavePolicy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LeavePolicy_annualAllowanceDays_check" CHECK ("annualAllowanceDays" >= 0 AND "annualAllowanceDays" <= 366),
    CONSTRAINT "LeavePolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LeavePolicy_tenantId_type_key" ON "LeavePolicy"("tenantId", "type");
CREATE INDEX "LeavePolicy_tenantId_idx" ON "LeavePolicy"("tenantId");
