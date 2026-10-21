-- AlterTable Tenant with status and archivedAt
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- Update asas_immutable_posting to allow administrative tenant purge
CREATE OR REPLACE FUNCTION asas_immutable_posting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Allow deletion during privileged administrative tenant purge
  IF current_setting('asas.allow_tenant_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Posted journals are append-only; use a future explicit reversal workflow';
END;
$$;

-- Create trigger function to enforce last-owner invariant on Member at database level
CREATE OR REPLACE FUNCTION asas_validate_last_owner()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_count INTEGER;
BEGIN
  -- If tenant purge is active, allow deletion of members
  IF current_setting('asas.allow_tenant_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;

  -- Only check if the row being deleted or demoted was an OWNER
  IF OLD."role" = 'OWNER' AND (TG_OP = 'DELETE' OR NEW."role" != 'OWNER') THEN
    SELECT COUNT(*)
    INTO v_owner_count
    FROM "Member"
    WHERE "tenantId" = OLD."tenantId"
      AND "role" = 'OWNER'
      AND "id" != OLD."id";

    IF v_owner_count < 1 THEN
      RAISE EXCEPTION 'Cannot remove or demote the last owner of the workspace';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_asas_validate_last_owner ON "Member";
CREATE TRIGGER trg_asas_validate_last_owner
  BEFORE DELETE OR UPDATE OF "role" ON "Member"
  FOR EACH ROW
  EXECUTE FUNCTION asas_validate_last_owner();

-- Create privileged procedure for compliant purge of archived tenant
CREATE OR REPLACE FUNCTION purge_archived_tenant(target_tenant_id TEXT)
RETURNS VOID AS $$
BEGIN
  -- Strictly enforce that the tenant must be ARCHIVED before it can be purged
  IF NOT EXISTS (SELECT 1 FROM "Tenant" WHERE "id" = target_tenant_id AND "status" = 'ARCHIVED') THEN
    RAISE EXCEPTION 'Cannot purge tenant %: must be in ARCHIVED status', target_tenant_id;
  END IF;

  -- Set session setting to allow privileged cascade purge
  PERFORM set_config('asas.allow_tenant_purge', 'on', true);

  -- 1. Purge financial records
  DELETE FROM "JournalLine" WHERE "tenantId" = target_tenant_id;
  DELETE FROM "JournalEntry" WHERE "tenantId" = target_tenant_id;
  DELETE FROM "LedgerAccount" WHERE "tenantId" = target_tenant_id;
  DELETE FROM "ExchangeRate" WHERE "tenantId" = target_tenant_id;

  -- 2. Purge memberships and invitations
  DELETE FROM "Invitation" WHERE "tenantId" = target_tenant_id;
  DELETE FROM "Member" WHERE "tenantId" = target_tenant_id;

  -- 3. Clear active sessions
  UPDATE "Session" SET "activeOrganizationId" = NULL WHERE "activeOrganizationId" = target_tenant_id;

  -- 4. Delete the tenant row (foreign keys cascade to all remaining tenant models)
  DELETE FROM "Tenant" WHERE "id" = target_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

