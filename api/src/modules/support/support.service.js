export async function getTickets(prisma, tenantId) {
  const tickets = await prisma.supportTicket.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' }
  });
  return { tickets };
}
