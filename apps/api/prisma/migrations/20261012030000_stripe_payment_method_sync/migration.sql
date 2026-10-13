ALTER TABLE "PaymentMethod"
  ADD COLUMN "stripePaymentMethodId" TEXT;

CREATE UNIQUE INDEX "PaymentMethod_stripePaymentMethodId_key"
  ON "PaymentMethod"("stripePaymentMethodId");
