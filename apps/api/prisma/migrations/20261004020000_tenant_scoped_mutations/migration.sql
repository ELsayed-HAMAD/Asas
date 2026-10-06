CREATE UNIQUE INDEX "Employee_id_tenantId_key" ON "Employee"("id", "tenantId");
CREATE UNIQUE INDEX "Candidate_id_tenantId_key" ON "Candidate"("id", "tenantId");
CREATE UNIQUE INDEX "PayableInvoice_id_tenantId_key" ON "PayableInvoice"("id", "tenantId");
CREATE UNIQUE INDEX "ReceivableInvoice_id_tenantId_key" ON "ReceivableInvoice"("id", "tenantId");
CREATE UNIQUE INDEX "Deal_id_tenantId_key" ON "Deal"("id", "tenantId");
CREATE UNIQUE INDEX "Project_id_tenantId_key" ON "Project"("id", "tenantId");
CREATE UNIQUE INDEX "Sprint_id_tenantId_key" ON "Sprint"("id", "tenantId");
CREATE UNIQUE INDEX "Issue_id_tenantId_key" ON "Issue"("id", "tenantId");
