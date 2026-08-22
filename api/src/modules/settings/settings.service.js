export async function getGeneralSettings(prisma, tenantId) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId }
  });
  return { tenant };
}

export async function updateGeneralSettings(prisma, tenantId, data) {
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data
  });
  return { tenant };
}

export async function getBillingPlans(prisma, tenantId) {
  const subscriptions = await prisma.subscription.findMany({
    where: { tenantId }
  });
  return { subscriptions };
}

export async function getIntegrations(prisma, tenantId) {
  const integrations = await prisma.integration.findMany({
    where: { tenantId }
  });
  return { integrations };
}

export async function getNotifications(prisma, tenantId) {
  const preferences = await prisma.notificationPreference.findMany({
    where: { tenantId }
  });
  
  const quietHours = await prisma.quietHours.findFirst({
    where: { tenantId }
  });
  
  return { preferences, quietHours };
}

export async function getDataExport(prisma, tenantId) {
  const jobs = await prisma.exportJob.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' }
  });
  
  const backups = await prisma.backupSchedule.findMany({
    where: { tenantId }
  });

  return { jobs, backups };
}
