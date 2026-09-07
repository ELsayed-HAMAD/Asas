import { PrismaClient } from '@prisma/client'
import { buildApp } from '../dist/app.js'
import { loadEnv } from '../dist/config/env.js'

function extractCookie(response) {
  const setCookie = response.headers['set-cookie']
  if (!setCookie) return null
  const list = Array.isArray(setCookie) ? setCookie : [setCookie]
  return list.map(entry => entry.split(';')[0]).join('; ')
}

async function main() {
  const prisma = new PrismaClient()
  const app = await buildApp(loadEnv(), { prisma, logger: false })

  const email = `owner-${Date.now()}@example.com`
  const password = 'correct-horse-battery-staple'

  const origin = { origin: 'http://localhost:5173' }

  console.log('1. sign-up/email')
  const signUp = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: origin,
    payload: { email, password, name: 'Ada Lovelace' },
  })
  console.log('   status:', signUp.statusCode, signUp.body.slice(0, 200))
  const cookie = extractCookie(signUp)
  console.log('   cookie:', cookie ? 'received' : 'MISSING')

  console.log('2. get-session (right after sign-up)')
  const session1 = await app.inject({ method: 'GET', url: '/api/auth/get-session', headers: { cookie } })
  console.log('   status:', session1.statusCode, session1.body)

  console.log('3. organization/create')
  const orgCreate = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/create',
    headers: { cookie, ...origin },
    payload: { name: "Ada's Workspace", slug: `ada-workspace-${Date.now()}` },
  })
  console.log('   status:', orgCreate.statusCode, orgCreate.body.slice(0, 400))

  console.log('4. get-session (after organization/create)')
  const session2 = await app.inject({ method: 'GET', url: '/api/auth/get-session', headers: { cookie } })
  console.log('   status:', session2.statusCode, session2.body)
  const session2Json = JSON.parse(session2.body)
  const activeOrgId = session2Json?.session?.activeOrganizationId
  console.log('   activeOrganizationId:', activeOrgId ?? 'NOT SET')

  console.log('5. GET /api/v1/hr/employees (should succeed \u2014 creator should be OWNER)')
  const employeesList = await app.inject({ method: 'GET', url: '/api/v1/hr/employees', headers: { cookie } })
  console.log('   status:', employeesList.statusCode, employeesList.body.slice(0, 400))

  console.log('6. POST /api/v1/hr/departments')
  const deptCreate = await app.inject({
    method: 'POST',
    url: '/api/v1/hr/departments',
    headers: { cookie },
    payload: { name: 'Engineering' },
  })
  console.log('   status:', deptCreate.statusCode, deptCreate.body.slice(0, 400))
  const departmentId = JSON.parse(deptCreate.body)?.data?.id

  console.log('7. POST /api/v1/hr/employees')
  const empCreate = await app.inject({
    method: 'POST',
    url: '/api/v1/hr/employees',
    headers: { cookie },
    payload: { name: 'Grace Hopper', title: 'Principal Engineer', departmentId, salary: '185000.00' },
  })
  console.log('   status:', empCreate.statusCode, empCreate.body.slice(0, 500))
  const employeeId = JSON.parse(empCreate.body)?.data?.id

  console.log('8. DELETE /api/v1/hr/employees/:id')
  const empDelete = await app.inject({ method: 'DELETE', url: `/api/v1/hr/employees/${employeeId}`, headers: { cookie } })
  console.log('   status:', empDelete.statusCode)

  console.log('9. AuditLog row check')
  const auditRows = await prisma.auditLog.findMany({ where: { action: 'employee.delete' } })
  console.log('   audit rows:', JSON.stringify(auditRows))

  await app.close()
}

main().catch(error => {
  console.error('SMOKE TEST FAILED:', error)
  process.exit(1)
})
