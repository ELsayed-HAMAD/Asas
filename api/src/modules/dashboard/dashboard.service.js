export async function getOverview(prisma, tenantId) {
  // Aggregate data for the main dashboard
  // 1. Total users
  const totalUsers = await prisma.user.count({ where: { tenantId } });

  // 2. Active deals count
  const activeDeals = await prisma.deal.count({
    where: { 
      tenantId, 
      stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] }
    }
  });

  // 3. Open projects
  const openProjects = await prisma.project.count({
    where: {
      tenantId,
      status: { not: 'COMPLETED' }
    }
  });

  // 4. Monthly Revenue (sum of won deals or paid invoices)
  // For simplicity, sum of paid receivable invoices this month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const revenueAgg = await prisma.receivableInvoice.aggregate({
    _sum: { amount: true },
    where: {
      tenantId,
      status: 'PAID',
      updatedAt: { gte: startOfMonth }
    }
  });

  const revenue = revenueAgg._sum.amount || 0;

  return {
    metrics: {
      totalUsers,
      activeDeals,
      openProjects,
      monthlyRevenue: revenue
    },
    // We can return more data for charts if needed
  };
}
