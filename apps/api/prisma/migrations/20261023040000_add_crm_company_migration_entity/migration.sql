-- Add the CRM company dataset separately so PostgreSQL commits the enum addition before it is used.
ALTER TYPE "DataMigrationEntity" ADD VALUE 'CRM_COMPANIES';
