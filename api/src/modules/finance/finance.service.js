export async function getOverview(prisma, tenantId) {
  let cashFlows = await prisma.cashFlowSnapshot.findMany({
    where: { tenantId }
  })
  const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  cashFlows.sort((a, b) => monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month));
  // YTD is up to current month. We can just take all of them if it's YTD (up to 8 in this dataset).

  // Group expenses by category
  const expenses = await prisma.expense.groupBy({
    by: ['category'],
    where: { tenantId, status: 'APPROVED' },
    _sum: { amount: true },
  })
  
  const expenseBreakdown = expenses.map(e => ({
    name: e.category,
    value: e._sum.amount || 0,
  }))

  const recentTransactions = await prisma.ledgerTransaction.findMany({
    where: { tenantId },
    orderBy: { date: 'desc' },
    take: 5,
  })

  const mrrSparkline = cashFlows.map(snapshot => Number(snapshot.net) || 0)

  return {
    mrrSparkline,
    cashFlows: cashFlows.length ? cashFlows : [
      { month: 'Jan', inflow: 0, outflow: 0, net: 0 }
    ],
    expenseBreakdown,
    recentTransactions: recentTransactions.map(t => ({
      id: t.id,
      date: t.date.toISOString(),
      description: t.description,
      amount: t.amount,
      status: t.status,
      type: t.isCredit ? 'credit' : 'debit'
    })),
  }
}

export async function listPayables(prisma, tenantId) {
  const invoices = await prisma.payableInvoice.findMany({
    where: { tenantId },
    include: { vendor: true },
    orderBy: { date: 'desc' },
  })

  return {
    items: invoices.map(inv => ({
      id: inv.id,
      vendor: inv.vendor.name,
      avatar: inv.vendor.avatarUrl,
      invoiceNumber: inv.invoiceNumber,
      date: inv.date.toISOString(),
      amount: inv.amount,
      status: inv.status,
    }))
  }
}

export async function listReceivables(prisma, tenantId) {
  const customers = await prisma.customer.findMany({
    where: { tenantId },
    include: {
      invoices: {
        orderBy: { dueDate: 'asc' }
      },
      activities: {
        orderBy: { createdAt: 'desc' }
      }
    },
  })

  return {
    items: customers.map(c => {
      const outstandingInvoices = c.invoices.filter(i => i.status !== 'PAID')
      const totalOutstanding = outstandingInvoices.reduce((sum, inv) => sum + inv.amount, 0)
      
      let oldest = 0
      if (outstandingInvoices.length > 0) {
        const oldestInvoice = outstandingInvoices[0]
        if (oldestInvoice.dueDate) {
          const diffTime = Math.abs(new Date() - oldestInvoice.dueDate)
          oldest = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        }
      }

      return {
        id: c.id,
        name: c.name,
        avatar: c.avatarUrl,
        totalOutstanding,
        oldest,
        status: c.collectionStatus,
        invoices: c.invoices.map(i => ({
          id: i.id,
          number: i.number,
          amount: i.amount,
          dueDate: i.dueDate ? i.dueDate.toISOString() : null,
          status: i.status
        })),
        activities: c.activities.map(a => ({
          id: a.id,
          title: a.title,
          author: a.author,
          body: a.body,
          date: a.createdAt.toISOString()
        }))
      }
    })
  }
}

export async function listExpenses(prisma, tenantId) {
  const expenses = await prisma.expense.findMany({
    where: { tenantId },
    include: { employee: true },
    orderBy: { date: 'desc' }
  })

  return {
    items: expenses.map(e => ({
      id: e.id,
      name: e.name,
      employeeName: e.employee?.name || 'Unknown',
      avatar: e.employee?.avatarUrl,
      category: e.category,
      merchant: e.merchant,
      date: e.date.toISOString(),
      amount: e.amount,
      tax: e.tax,
      policyMatch: e.policyMatch,
      status: e.status,
    }))
  }
}
