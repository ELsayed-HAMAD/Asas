-- Opening stock quantities are a separate migration entity from product catalog data.
ALTER TYPE "DataMigrationEntity" ADD VALUE 'INVENTORY_OPENING_STOCK';
