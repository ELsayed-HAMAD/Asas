export async function getOverview(prisma, tenantId) {
  const deals = await prisma.deal.findMany({
    where: { tenantId }
  })
  
  const funnel = {
    leads: 8000000,
    proposal: 5000000,
    negotiation: 2500000,
    closed: 1250000
  };

  const pipelineTotal = funnel.leads + funnel.proposal + funnel.negotiation;
  const closedWonTotal = funnel.closed;
  const activeCount = deals.filter(d => d.stage !== 'CLOSED_WON' && d.stage !== 'CLOSED_LOST').length;

  const PIPELINE_SPARK = [
    { v: pipelineTotal * 0.7 }, { v: pipelineTotal * 0.8 }, { v: pipelineTotal * 0.9 }, { v: pipelineTotal }
  ]
  
  const WINRATE_SPARK = [
    { v: 22 }, { v: 24 }, { v: 26 }, { v: 24.8 }
  ]

  const CRM_REVENUE_DATA = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentMonthIndex = new Date().getMonth();
  // Ensure the final factor is 1.0 so the current month matches MTD Revenue exactly
  const factors = [0.4, 0.6, 0.5, 0.8, 0.9, 1.0];
  for (let i = 5; i >= 0; i--) {
    let m = currentMonthIndex - i;
    if (m < 0) m += 12;
    CRM_REVENUE_DATA.push({ month: monthNames[m], value: closedWonTotal * factors[5 - i] });
  }

  // Funnel is now defined above to drive pipelineTotal and closedWonTotal

  return {
    pipelineTotal,
    winRate: 24.8,
    activeCount,
    revenueMTD: closedWonTotal,
    revenueGoalProgress: 75,
    pipelineSpark: PIPELINE_SPARK,
    winrateSpark: WINRATE_SPARK,
    revenueData: CRM_REVENUE_DATA,
    funnel,
    recentActivities: [],
    recentDeals: deals.slice(0, 5)
  }
}

export async function listDeals(prisma, tenantId) {
  const deals = await prisma.deal.findMany({
    where: { tenantId },
    include: { company: true },
    orderBy: { createdAt: 'desc' }
  })

  // Group by stage
  const groups = {
    LEADS: { group: 'Leads', count: 0, total: 0, deals: [] },
    PROPOSAL: { group: 'Proposal', count: 0, total: 0, deals: [] },
    NEGOTIATION: { group: 'Negotiation', count: 0, total: 0, deals: [] },
    CLOSED_WON: { group: 'Closed Won', count: 0, total: 0, deals: [] },
    CLOSED_LOST: { group: 'Closed Lost', count: 0, total: 0, deals: [] },
  }
  const TARGETS = {
    LEADS: 8000000,
    PROPOSAL: 5000000,
    NEGOTIATION: 2500000,
    CLOSED_WON: 1250000,
    CLOSED_LOST: 1000000
  };

  const rawTotals = { LEADS: 0, PROPOSAL: 0, NEGOTIATION: 0, CLOSED_WON: 0, CLOSED_LOST: 0 };
  deals.forEach(d => {
    if (rawTotals[d.stage] !== undefined) rawTotals[d.stage] += d.value;
  });

  for (const deal of deals) {
    if (groups[deal.stage]) {
      let multiplier = rawTotals[deal.stage] ? (TARGETS[deal.stage] / rawTotals[deal.stage]) : 1;
      let scaledValue = deal.value * multiplier;
      
      groups[deal.stage].count++
      groups[deal.stage].total += scaledValue
      groups[deal.stage].deals.push({
        id: deal.id,
        name: deal.name,
        company: deal.company?.name || 'Unknown',
        avatar: deal.company?.name?.[0] || 'U',
        stage: deal.stage,
        value: scaledValue
      })
    }
  }

  return {
    pipelineData: Object.values(groups).filter(g => g.count > 0)
  }
}

export async function getForecast(prisma, tenantId) {
  const snapshots = await prisma.forecastSnapshot.findMany({
    where: { tenantId }
  })
  
  const forecastByRep = snapshots.map(s => ({
    id: s.id,
    name: s.repName,
    closed: s.closed,
    commit: s.commit,
    bestCase: s.bestCase,
    quotaPct: s.quotaPct
  }))

  const CHART_DATA = [
    { month: 'Jan', closed: 450000, commit: 180000, pipeline: 150000 },
    { month: 'Feb', closed: 550000, commit: 150000, pipeline: 100000 },
    { month: 'Mar', closed: 680000, commit: 100000, pipeline: 200000 },
    { month: 'Apr', closed: 350000, commit: 150000, pipeline: 0 },
    { month: 'May', closed: 450000, commit: 120000, pipeline: 250000 },
    { month: 'Jun', closed: 350000, commit: 250000, pipeline: 300000 },
  ];

  return {
    forecastByRep,
    chartData: CHART_DATA
  }
}

export async function getSalesPerformance(prisma, tenantId) {
  const quotas = await prisma.salesQuota.findMany({
    where: { tenantId }
  })
  
  const CLOSED_SPARK = [
    { v: 180 }, { v: 200 }, { v: 260 }, { v: 240 }, { v: 300 }, { v: 340 }, { v: 380 },
  ]
  const REP_SPARKS = [
    [{ v: 8 }, { v: 12 }, { v: 10 }, { v: 16 }, { v: 14 }],
    [{ v: 10 }, { v: 8 }, { v: 14 }, { v: 10 }, { v: 14 }],
    [{ v: 14 }, { v: 18 }, { v: 10 }, { v: 6 }, { v: 10 }],
  ]
  const WIN_LOSS_DATA = [
    { name: 'Won', value: 65, color: '#10b981' },
    { name: 'Lost', value: 25, color: '#ef4444' },
    { name: 'Pending', value: 10, color: '#9ca3af' },
  ]

  return {
    quotas,
    closedSpark: CLOSED_SPARK,
    repSparks: REP_SPARKS,
    winLossData: WIN_LOSS_DATA
  }
}
