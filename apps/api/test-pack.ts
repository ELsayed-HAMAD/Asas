import { PrismaClient } from '@prisma/client'
import { applyEnterpriseSamplePack } from './src/modules/onboarding/samplePack.service.js'

const prisma = new PrismaClient()
async function test() {
  try {
    const summary = await applyEnterpriseSamplePack(prisma, '1LgbrYufu7QWJY9baFTfMEv2ORRi0rwj')
    console.log('Success:', summary)
  } catch (e) {
    console.error('Error applying pack:', e)
  }
}
test().finally(() => prisma.$disconnect())
