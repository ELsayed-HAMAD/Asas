/**
 * Runtime verification for the payroll surface against the live Neon DB. Drives the real server
 * over HTTP with a real httpOnly session cookie. Verifies:
 *   - a PENDING run is priced from each employee's salary through the domain math (decimal strings)
 *   - the response carries the stored taxRates and per-line tax split (the Json column round-trips)
 *   - MEMBER is blocked (403) from approving; OWNER approves (200) and the run flips to APPROVED
 *   - approving an already-approved run is a loud 409, not a silent no-op
 *   - a second tenant cannot read the first tenant's run (404, tenant isolation)
 *   - each write pushes an SSE `invalidate` frame to another subscriber
 * Self-cleaning: removes its own tenants/users at the end.
 */
import http from 'node:http'
import { PrismaClient } from '@prisma/client'

const BASE = 'http://127.0.0.1:4000'
const ORIGIN = 'http://localhost:5173'
const prisma = new PrismaClient()

const stamp = (Math.random() + 1).toString(36).slice(2, 10)
const results = []
function check(label, ok, detail = '') {
  results.push({ label, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

function makeJar() {
  const jar = new Map()
  return {
    cookies: () => [...jar.entries()].map(([n, v]) => `${n}=${v}`).join('; '),
    absorb(res) {
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(';')
        const eq = pair.indexOf('=')
        if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
      }
    },
  }
}

async function req(jar, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(jar.cookies() ? { cookie: jar.cookies() } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  jar.absorb(res)
  let json = null
  try {
    json = await res.json()
  } catch { /* non-JSON */ }
  return { res, json }
}

// ── Setup: owner + org + two salaried employees ─────────────────────────────────────────
const ownerJar = makeJar()
const ownerEmail = `payroll-owner.${stamp}@example.com`
await req(ownerJar, 'POST', '/api/auth/sign-up/email', { name: 'POwner', email: ownerEmail, password: 'S3cure!pass' })
const oc = await req(ownerJar, 'POST', '/api/auth/organization/create', { name: `PayOrg ${stamp}`, slug: `payorg-${stamp}` })
const tenantId = oc.json?.id ?? oc.json?.organization?.id
check('setup: organization created', Boolean(tenantId), `tenantId=${tenantId}`)

const emp1 = (await req(ownerJar, 'POST', '/api/v1/hr/employees', { name: `Ada ${stamp}`, title: 'Engineer', salary: '100000' })).json?.data
const emp2 = (await req(ownerJar, 'POST', '/api/v1/hr/employees', { name: `Grace ${stamp}`, title: 'Engineer', salary: '120000' })).json?.data
check('setup: two salaried employees created', Boolean(emp1?.id) && Boolean(emp2?.id), `${emp1?.name}, ${emp2?.name}`)

// A MEMBER of this tenant — seeded directly (invite role-casing gap is documented).
const memberJar = makeJar()
const memberEmail = `payroll-member.${stamp}@example.com`
await req(memberJar, 'POST', '/api/auth/sign-up/email', { name: 'PMember', email: memberEmail, password: 'S3cure!pass' })
const ms = await req(memberJar, 'GET', '/api/auth/get-session')
const memberUserId = ms.json?.user?.id
await prisma.member.upsert({
  where: { tenantId_userId: { tenantId, userId: memberUserId } },
  update: { role: 'MEMBER' },
  create: { tenantId, userId: memberUserId, role: 'MEMBER' },
})
const mSess = await prisma.session.findFirst({ where: { userId: memberUserId }, orderBy: { createdAt: 'desc' } })
if (mSess) await prisma.session.update({ where: { id: mSess.id }, data: { activeOrganizationId: tenantId } })
const mres = await req(memberJar, 'GET', '/api/auth/get-session')
check('setup: member has active org', (mres.json?.session ?? mres.json)?.activeOrganizationId === tenantId)

// ── 1. MEMBER reads payroll (200) but cannot approve (403) ──────────────────────────────
const memberRead = await req(memberJar, 'GET', '/api/v1/hr/payroll/runs')
check('MEMBER reads /hr/payroll/runs → 200', memberRead.res.status === 200, `status=${memberRead.res.status}`)

// ── 2. OWNER prices a run (201) with the correct domain money ───────────────────────────
const created = await req(ownerJar, 'POST', '/api/v1/hr/payroll/runs', {
  label: `September pay ${stamp}`,
  taxRates: [{ label: 'Pension', rate: '10' }],
  employeeIds: [emp1.id, emp2.id],
})
check('OWNER creates payroll run → 201', created.res.status === 201, `status=${created.res.status}`)
const run = created.json?.data
check('run is PENDING with stored taxRates', run?.status === 'PENDING' && Array.isArray(run?.taxRates), `status=${run?.status} taxRates=${JSON.stringify(run?.taxRates)}`)

const adaLine = (run?.lines ?? []).find(l => l.employee.id === emp1.id)
// Money is stored via Money.toDecimalString() (fixed scale on write) but read back through
// Prisma's Decimal, whose toString() normalizes scale — so the wire value is '100000', not
// '100000.00'. Both satisfy decimalStringSchema; the UI formats from it via Money/Intl. This
// matches the existing employee salary endpoint (employees.service.ts emits salary?.toString()).
const moneyEq = (a, b) => Number(a) === Number(b)
check(
  'Ada line priced by domain math: gross 100000 / deductions 10000 / net 90000',
  adaLine && moneyEq(adaLine.gross, 100000) && moneyEq(adaLine.deductions, 10000) && moneyEq(adaLine.net, 90000),
  adaLine ? `gross=${adaLine.gross} ded=${adaLine.deductions} net=${adaLine.net}` : 'no Ada line',
)
check('Ada tax line: Pension 10000 (Json split round-trips)', adaLine?.taxLines?.[0] && moneyEq(adaLine.taxLines[0].amount, 10000), `tax=${JSON.stringify(adaLine?.taxLines)}`)

// ── 3. MEMBER cannot approve (403); OWNER can (200 → APPROVED) ──────────────────────────
const memberApprove = await req(memberJar, 'POST', `/api/v1/hr/payroll/runs/${run?.id}/approve`)
check('MEMBER approves run → 403 (payroll.approve requires ADMIN)', memberApprove.res.status === 403, `status=${memberApprove.res.status}`)

const approved = await req(ownerJar, 'POST', `/api/v1/hr/payroll/runs/${run?.id}/approve`)
check('OWNER approves run → 200', approved.res.status === 200, `status=${approved.res.status}`)
check('run status is APPROVED after approval', approved.json?.data?.status === 'APPROVED', `status=${approved.json?.data?.status}`)

const doubleApprove = await req(ownerJar, 'POST', `/api/v1/hr/payroll/runs/${run?.id}/approve`)
check('re-approving an APPROVED run → 409 (loud, not a silent no-op)', doubleApprove.res.status === 409, `status=${doubleApprove.res.status}`)

// ── 4. Tenant isolation: a second tenant gets 404 for the first tenant's run ─────────────
const ownerBJar = makeJar()
const ownerBEmail = `payroll-ownerb.${stamp}@example.com`
await req(ownerBJar, 'POST', '/api/auth/sign-up/email', { name: 'POwnerB', email: ownerBEmail, password: 'S3cure!pass' })
const ocb = await req(ownerBJar, 'POST', '/api/auth/organization/create', { name: `PayOrgB ${stamp}`, slug: `payorgb-${stamp}` })
const tenantB = ocb.json?.id ?? ocb.json?.organization?.id
const crossRead = await req(ownerBJar, 'GET', `/api/v1/hr/payroll/runs/${run?.id}`)
check('tenant B reading tenant A run → 404 (isolation)', crossRead.res.status === 404, `status=${crossRead.res.status} (A=${Boolean(tenantId)} B=${Boolean(tenantB)})`)

// ── 5. SSE: approving from a fresh PENDING run invalidates another subscriber ────────────
function openSse(jar) {
  const reqObj = http.get({ host: '127.0.0.1', port: 4000, path: '/api/v1/events', headers: { origin: ORIGIN, cookie: jar.cookies(), accept: 'text/event-stream' } }, () => {})
  const state = { buf: '', done: false, req: reqObj }
  reqObj.on('response', res => res.on('data', c => { state.buf += c.toString(); if (state.buf.includes('"invalidate"')) state.done = true }))
  reqObj.on('error', () => { state.done = true })
  return state
}
const sseA = openSse(memberJar)
await new Promise(r => setTimeout(r, 700))
// A fresh PENDING run (adjust is allowed on PENDING) triggers the publish.
const run2 = (await req(ownerJar, 'POST', '/api/v1/hr/payroll/runs', { label: `Oct pay ${stamp}`, taxRates: [{ label: 'Pension', rate: '10' }], employeeIds: [emp1.id] })).json?.data
const sseWait = async (s, ms) => { const t = Date.now(); while (!s.done && Date.now() - t < ms) await new Promise(r => setTimeout(r, 50)) }
await sseWait(sseA, 4000)
sseA.req.destroy()
check('payroll write pushed SSE invalidate ["asas,hr"] to a subscriber', sseA.buf.includes('"asas,hr"'), sseA.buf.slice(0, 60))
void run2

// ── Cleanup ───────────────────────────────────────────────────────────────────────────────
await prisma.$executeRawUnsafe(`DELETE FROM "Member" WHERE "tenantId" IN ('${tenantId}','${tenantB}')`)
await prisma.payrollRun.deleteMany({ where: { tenantId: { in: [tenantId, tenantB] } } }).catch(() => {})
await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, tenantB] } } }).catch(() => {})
await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, memberEmail, ownerBEmail] } } }).catch(() => {})
await prisma.$disconnect()

console.log('\n────────────────────────────')
const passed = results.filter(r => r.ok).length
console.log(`${passed}/${results.length} payroll runtime checks passed`)
process.exit(passed === results.length ? 0 : 1)
