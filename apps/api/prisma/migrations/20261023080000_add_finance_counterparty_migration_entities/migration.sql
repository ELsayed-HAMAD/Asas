-- Financial counterparties are master data; invoices and balances remain separate migrations.
ALTER TYPE "DataMigrationEntity" ADD VALUE 'FINANCE_VENDORS';
ALTER TYPE "DataMigrationEntity" ADD VALUE 'FINANCE_CUSTOMERS';
