import { auth } from './src/auth.js';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
  const headers = new Headers();
  headers.append('cookie', 'better-auth.session_token=pHMy0zKy814ChgU12ETsUvHyYCH2BlR1');
  const sessionData = await auth.api.getSession({ headers });
  console.log('Session Data:', sessionData);
  
  if (sessionData) {
    const members = await prisma.member.findMany({ where: { userId: sessionData.user.id } })
    console.log('Members:', members.length);
  }
}
test().catch(console.error).finally(() => prisma.$disconnect());
