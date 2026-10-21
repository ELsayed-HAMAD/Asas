-- AlterTable SupportTicket with createdById
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
CREATE INDEX IF NOT EXISTS "SupportTicket_createdById_idx" ON "SupportTicket"("createdById");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SupportTicket_createdById_fkey'
  ) THEN
    ALTER TABLE "SupportTicket"
      ADD CONSTRAINT "SupportTicket_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Enable Row Level Security (RLS) on Tenant table
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS asas_tenant_isolation ON "Tenant";
CREATE POLICY asas_tenant_isolation ON "Tenant"
  FOR ALL
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "id" = current_setting('app.tenant_id', true)
  );

-- Helper procedure to enable RLS and attach tenant policy across all tenant-scoped tables
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'Member', 'Invitation', 'AuditLog', 'Department', 'ActivityEvent',
    'Employee', 'EmployeeSalaryHistory', 'PayrollRun', 'PayrollLine',
    'Timesheet', 'AttendanceException', 'LeaveRequest', 'LeavePolicy',
    'Candidate', 'Vendor', 'PayableInvoice', 'Customer', 'ReceivableInvoice',
    'CollectionActivity', 'Expense', 'LedgerAccount', 'ExchangeRate',
    'JournalEntry', 'JournalLine', 'BankStatementImport', 'BankStatementLine',
    'LedgerTransaction', 'CashFlowSnapshot', 'Company', 'Deal',
    'DealStageHistory', 'CrmHistoryCoverage', 'SettlementHistoryCoverage',
    'DealActivity', 'AgendaItem', 'SalesQuota', 'ForecastSnapshot',
    'Product', 'StockMovement', 'Supplier', 'PurchaseOrder',
    'Project', 'Sprint', 'Issue', 'RoadmapPhase', 'RoadmapTask',
    'Subscription', 'PaymentMethod', 'BillingInvoice', 'Integration',
    'NotificationPreference', 'QuietHours', 'ExportJob', 'BackupSchedule',
    'SupportTicket'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
      EXECUTE format('DROP POLICY IF EXISTS asas_tenant_isolation ON %I;', t);
      EXECUTE format(
        'CREATE POLICY asas_tenant_isolation ON %I FOR ALL USING (current_setting(''app.bypass_rls'', true) = ''on'' OR "tenantId" = current_setting(''app.tenant_id'', true));',
        t
      );
    END IF;
  END LOOP;
END $$;
