-- Cancellation retains unpaid documents without pretending a payment was reversed.
ALTER TYPE "PayableStatus" ADD VALUE 'VOID';
ALTER TYPE "ReceivableStatus" ADD VALUE 'VOID';
