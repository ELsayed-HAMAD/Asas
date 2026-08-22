export async function getPortfolio(prisma, tenantId) {
  const projects = await prisma.project.findMany({
    where: { tenantId },
    include: {
      sprints: true
    },
    orderBy: { createdAt: 'desc' }
  });

  return { projects };
}

export async function getSprints(prisma, tenantId) {
  const sprints = await prisma.sprint.findMany({
    where: { tenantId },
    include: {
      issues: true,
      project: true
    },
    orderBy: { createdAt: 'desc' }
  });

  return { sprints };
}

export async function getRoadmap(prisma, tenantId) {
  const phases = await prisma.roadmapPhase.findMany({
    where: { tenantId },
    include: {
      tasks: {
        include: {
          assignees: {
            include: { employee: true }
          }
        },
        orderBy: { startDate: 'asc' }
      }
    },
    orderBy: { sortOrder: 'asc' }
  });

  return { phases };
}
