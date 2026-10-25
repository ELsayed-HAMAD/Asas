-- Keep the Inventory supplier master and supplier-to-product associations independently traceable.
ALTER TYPE "DataMigrationEntity" ADD VALUE 'INVENTORY_SUPPLIERS';
ALTER TYPE "DataMigrationEntity" ADD VALUE 'INVENTORY_PRODUCT_SUPPLIERS';
