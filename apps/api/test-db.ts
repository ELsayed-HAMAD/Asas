import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  console.log('Tenant:', await prisma.tenant.findUnique({ where: { id: '1LgbrYufu7QWJY9baFTfMEv2ORRi0rwj' } }))
}
main().finally(() => prisma.$disconnect())
