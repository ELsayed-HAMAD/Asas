-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3);

-- Create trigger function to enforce PurchaseOrder status state machine at database level
CREATE OR REPLACE FUNCTION asas_validate_purchase_order_status()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" IS DISTINCT FROM NEW."status" THEN
    -- Only allowed transitions from DRAFT: APPROVED or CANCELLED
    IF OLD."status" = 'DRAFT' AND NEW."status" NOT IN ('APPROVED', 'CANCELLED') THEN
      RAISE EXCEPTION 'Purchase order cannot transition directly from DRAFT to %: must be APPROVED before receiving', NEW."status";
    END IF;

    -- Only allowed transitions from APPROVED: RECEIVED or CANCELLED
    IF OLD."status" = 'APPROVED' AND NEW."status" NOT IN ('RECEIVED', 'CANCELLED') THEN
      RAISE EXCEPTION 'Purchase order cannot transition from APPROVED to %', NEW."status";
    END IF;

    -- Terminal states cannot be changed
    IF OLD."status" = 'RECEIVED' THEN
      RAISE EXCEPTION 'Purchase order is already received and cannot change status';
    END IF;

    IF OLD."status" = 'CANCELLED' THEN
      RAISE EXCEPTION 'Purchase order is cancelled and cannot change status';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_asas_validate_purchase_order_status ON "PurchaseOrder";
CREATE TRIGGER trg_asas_validate_purchase_order_status
  BEFORE UPDATE ON "PurchaseOrder"
  FOR EACH ROW
  EXECUTE FUNCTION asas_validate_purchase_order_status();

