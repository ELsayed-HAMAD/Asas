-- Migration: Audit Log Immutability and Platform Hardening (Findings 22, 23 & L1)
--
-- Enforces engine-level append-only immutability on the AuditLog table.
-- Any UPDATE or DELETE statement is unconditionally rejected unless an authorized
-- compliant workspace purge is in progress with `asas.allow_tenant_purge = 'on'`.

CREATE OR REPLACE FUNCTION fn_asas_prevent_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
  IF current_setting('asas.allow_tenant_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'ASAS_AUDIT_LOG_IMMUTABILITY: Audit logs are append-only and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_asas_prevent_audit_log_mutation ON "AuditLog";
CREATE TRIGGER trg_asas_prevent_audit_log_mutation
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION fn_asas_prevent_audit_log_mutation();

