-- Inventory catalog migration is separate from quantity and valuation cutover.
ALTER TYPE "DataMigrationEntity" ADD VALUE 'INVENTORY_PRODUCTS';
