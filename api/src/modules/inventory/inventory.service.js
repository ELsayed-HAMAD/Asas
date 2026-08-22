export async function listProducts(prisma, tenantId) {
  return prisma.product.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' }
  });
}

export async function getProduct(prisma, tenantId, id) {
  return prisma.product.findFirst({
    where: { id, tenantId }
  });
}

export async function createProduct(prisma, tenantId, data) {
  return prisma.product.create({
    data: {
      ...data,
      tenantId
    }
  });
}

export async function updateProduct(prisma, tenantId, id, data) {
  return prisma.product.update({
    where: { id_tenantId: { id, tenantId } },
    data
  }).catch(() => {
    // fallback if composite key doesn't exist, use updateMany or findFirst
    return prisma.product.updateMany({
      where: { id, tenantId },
      data
    }).then(() => prisma.product.findFirst({ where: { id, tenantId } }));
  });
}

export async function deleteProduct(prisma, tenantId, id) {
  return prisma.product.deleteMany({
    where: { id, tenantId }
  });
}
