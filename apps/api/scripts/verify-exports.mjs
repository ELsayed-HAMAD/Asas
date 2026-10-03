/**
 * Runtime verification for the export surface, in-process: builds the real compiled app
 * (`dist/app.js`) with a real `PrismaClient` (Neon) and drives it with `app.inject` — the same
 * pattern as `smoke-test.mjs`, so it runs without a free port and without the live server.
 *
 * Verifies:
 *   - payslip PDF: 200, application/pdf, %PDF- magic, and a re-fetch is BYTE-IDENTICAL (determinism)
 *   - invoice PDF: the same four properties on /finance/payables/:id/pdf
 *   - CV flow: mint signed grant → tampered signature 403 → stale exp 403 → non-PDF bytes 400
 *     → good PUT 200 (resumeUrl set) → GET streams the exact bytes back as application/pdf
 *   - export jobs: employees + ledger go straight to DONE (inline queue), download is a real
 *     xlsx (PK zip magic) named employees.xlsx / ledger.xlsx, re-download byte-identical
 *   - MEMBER creating an export job → 403 (employee.write requires ADMIN)
 *   - tenant B downloading tenant A's job → 404 (isolation)
 * Self-cleaning: removes its own tenants/users (and the CV file) at the end.
 *
 * Run from `apps/api`: `node scripts/verify-exports.mjs` (storage/ files land in apps/api/storage).
 */
import { createHash } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../dist/app.js'
import { loadEnv } from '../dist/config/env.js'

const prisma = new PrismaClient()
const app = await buildApp(loadEnv(), { prisma, logger: false })

const ORIGIN = { origin: 'http://localhost:5174' }
const stamp = (Math.random() + 1).toString(36).slice(2, 10)
const results = []
function check(label, ok, detail = '') {
  results.push({ label, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

/** One session's cookies, absorbed from every response's set-cookie (httpOnly, never read by JS in the browser). */
function makeJar() {
  const jar = new Map()
  return {
    headers: () => (jar.size ? { cookie: [...jar.entries()].map(([n, v]) => `${n}=${v}`).join('; ') } : {}),
    absorb(res) {
      const setCookie = res.headers['set-cookie']
      for (const raw of Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []) {
        const [pair] = raw.split(';')
        const eq = pair.indexOf('=')
        if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
      }
    },
  }
}

/** Inject a JSON request; returns { statusCode, headers, bytes, json }. */
async function req(jar, method, url, body) {
  const res = await app.inject({
    method,
    url,
    headers: { ...ORIGIN, ...jar.headers(), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(body !== undefined && { payload: JSON.stringify(body) }),
  })
  jar.absorb(res)
  const bytes = Buffer.from(res.rawPayload ?? '')
  let json = null
  try {
    json = JSON.parse(res.body)
  } catch {
    /* binary body */
  }
  return { res, bytes, json, statusCode: res.statusCode, headers: res.headers }
}

/** Inject a raw-bytes request (the CV PUT). */
async function raw(jar, method, url, bytes, contentType) {
  const res = await app.inject({
    method,
    url,
    headers: { ...ORIGIN, ...jar.headers(), 'content-type': contentType },
    payload: bytes,
  })
  jar.absorb(res)
  const out = Buffer.from(res.rawPayload ?? '')
  return { statusCode: res.statusCode, headers: res.headers, bytes: out }
}

// A minimal valid-enough PDF for the CV flow: the magic check is `%PDF-`, and the preview
// test only asserts the exact bytes round-trip, not a full parse.
const TINY_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n' +
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n' +
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj\n' +
    'trailer << /Root 1 0 R >>\n%%EOF\n',
)

// ── Setup: owner + org + one salaried employee + vendor ────────────────────────────────
const ownerJar = makeJar()
const ownerEmail = `exports-owner.${stamp}@example.com`
await req(ownerJar, 'POST', '/api/auth/sign-up/email', { name: 'EOwner', email: ownerEmail, password: 'S3cure!pass' })
const oc = await req(ownerJar, 'POST', '/api/auth/organization/create', { name: `ExportOrg ${stamp}`, slug: `exportorg-${stamp}` })
const tenantId = oc.json?.id ?? oc.json?.organization?.id
check('setup: organization created', Boolean(tenantId), `tenantId=${tenantId}`)

const emp = (await req(ownerJar, 'POST', '/api/v1/hr/employees', { name: `Ada ${stamp}`, title: 'Engineer', salary: '100000' })).json?.data
check('setup: salaried employee created', Boolean(emp?.id), `${emp?.name}`)

const vendor = (await req(ownerJar, 'POST', '/api/v1/finance/vendors', { name: `Acme Corp ${stamp}` })).json?.data
check('setup: vendor created', Boolean(vendor?.id), vendor?.name)

// ── 1. Payslip PDF: create + approve a run, fetch the payslip twice ────────────────────
const created = await req(ownerJar, 'POST', '/api/v1/hr/payroll/runs', {
  label: `Export check ${stamp}`,
  taxRates: [{ label: 'Pension', rate: '10' }],
  employeeIds: [emp.id],
})
check('payroll run created (201)', created.statusCode === 201, `status=${created.statusCode} ${created.json?.error?.message ?? ''}`)
const run = created.json?.data
const line = (run?.lines ?? [])[0]

const approved = await req(ownerJar, 'POST', `/api/v1/hr/payroll/runs/${run.id}/approve`)
check('payroll run approved (200)', approved.statusCode === 200, `status=${approved.statusCode} ${approved.json?.error?.message ?? ''}`)

const pdf1 = await req(ownerJar, 'GET', `/api/v1/hr/payroll/runs/${run.id}/payslips/${line.id}`)
check(
  'payslip PDF: 200 + application/pdf + %PDF- magic',
  pdf1.statusCode === 200 &&
    (pdf1.headers['content-type'] ?? '').includes('application/pdf') &&
    pdf1.bytes.subarray(0, 5).toString('latin1') === '%PDF-',
  `status=${pdf1.statusCode} ct=${pdf1.headers['content-type']} bytes=${pdf1.bytes.length}`,
)
const pdf2 = await req(ownerJar, 'GET', `/api/v1/hr/payroll/runs/${run.id}/payslips/${line.id}`)
check('payslip PDF re-fetch is byte-identical (deterministic)', sha256(pdf1.bytes) === sha256(pdf2.bytes), sha256(pdf1.bytes).slice(0, 12) + '…')

// ── 2. Invoice PDF ─────────────────────────────────────────────────────────────────────
const payable = (
  await req(ownerJar, 'POST', '/api/v1/finance/payables', {
    vendorId: vendor.id,
    invoiceNumber: `INV-${stamp.toUpperCase()}`,
    date: '2026-09-01',
    amount: '2500.00',
  })
).json?.data
check('setup: payable created', Boolean(payable?.id), `status=${payable?.status}`)

const inv1 = await req(ownerJar, 'GET', `/api/v1/finance/payables/${payable.id}/pdf`)
check(
  'invoice PDF: 200 + application/pdf + %PDF- magic',
  inv1.statusCode === 200 &&
    (inv1.headers['content-type'] ?? '').includes('application/pdf') &&
    inv1.bytes.subarray(0, 5).toString('latin1') === '%PDF-',
  `status=${inv1.statusCode} ct=${inv1.headers['content-type']} bytes=${inv1.bytes.length}`,
)
const inv2 = await req(ownerJar, 'GET', `/api/v1/finance/payables/${payable.id}/pdf`)
check('invoice PDF re-fetch is byte-identical (deterministic)', sha256(inv1.bytes) === sha256(inv2.bytes), sha256(inv1.bytes).slice(0, 12) + '…')

// ── 3. CV upload: signed PUT + preview stream ──────────────────────────────────────────
const candidate = (
  await req(ownerJar, 'POST', '/api/v1/hr/candidates', { name: `Lin ${stamp}`, role: 'Backend Engineer', email: `lin-${stamp}@example.com` })
).json?.data
check('setup: candidate created', Boolean(candidate?.id), candidate?.name)

const grant = (await req(ownerJar, 'GET', `/api/v1/hr/candidates/${candidate.id}/resume-upload-url`)).json?.data
check(
  'resume-upload-url returns a signed PUT grant',
  Boolean(grant?.uploadUrl?.includes('h=') && grant?.uploadUrl?.includes('exp=')) && grant?.method === 'PUT',
  `uploadUrl=${grant?.uploadUrl?.slice(0, 60)}…`,
)
const query = grant.uploadUrl.split('?')[1]
const [hParam, expParam] = query.split('&')

// 3a. tampered signature → 403
const badSig = await raw(ownerJar, 'PUT', `/api/v1/hr/candidates/${candidate.id}/resume?h=${'0'.repeat(64)}&${expParam}`, TINY_PDF, 'application/pdf')
check('CV upload with tampered signature → 403', badSig.statusCode === 403, `status=${badSig.statusCode}`)

// 3b. stale exp (outside the window) → 403. exp must sit in (now, now+600]; exp-601 fails.
// The window check runs before signature verification, so any 64-char h is fine here.
const staleExp = Math.floor(Date.now() / 1000) - 601
const badExp = await raw(ownerJar, 'PUT', `/api/v1/hr/candidates/${candidate.id}/resume?h=${'0'.repeat(64)}&exp=${staleExp}`, TINY_PDF, 'application/pdf')
check('CV upload with stale signature → 403', badExp.statusCode === 403, `status=${badExp.statusCode}`)

// 3c. good signature, non-PDF bytes → 400 (magic check)
const notPdf = await raw(ownerJar, 'PUT', `/api/v1/hr/candidates/${candidate.id}/resume?${hParam}&${expParam}`, Buffer.from('not a pdf at all'), 'application/pdf')
check('CV upload of non-PDF bytes → 400 (magic check)', notPdf.statusCode === 400, `status=${notPdf.statusCode}`)

// 3d. good signature, PDF bytes → 200, resumeUrl set
const goodPutRes = await raw(ownerJar, 'PUT', `/api/v1/hr/candidates/${candidate.id}/resume?${hParam}&${expParam}`, TINY_PDF, 'application/pdf')
let goodPutJson = null
try {
  goodPutJson = JSON.parse(goodPutRes.bytes.toString('utf8'))
} catch {
  /* n/a */
}
check(
  'CV upload (valid PDF) → 200 with resumeUrl set',
  goodPutRes.statusCode === 200 && Boolean(goodPutJson?.data?.resumeUrl),
  `status=${goodPutRes.statusCode} resumeUrl=${goodPutJson?.data?.resumeUrl ?? 'MISSING'}`,
)

// 3e. preview streams back the exact bytes
const preview = await req(ownerJar, 'GET', `/api/v1/hr/candidates/${candidate.id}/resume`)
check(
  'CV preview: 200 + application/pdf + exact bytes',
  preview.statusCode === 200 &&
    (preview.headers['content-type'] ?? '').includes('application/pdf') &&
    preview.bytes.equals(TINY_PDF),
  `status=${preview.statusCode} ct=${preview.headers['content-type']} bytes=${preview.bytes.length} uploaded=${TINY_PDF.length}`,
)

// ── 4. Export jobs: employees + ledger → DONE → xlsx download ──────────────────────────
const empJob = (await req(ownerJar, 'POST', '/api/v1/exports/jobs', { kind: 'employees' })).json?.data
check(
  'employees export job created (202) and DONE (inline queue)',
  empJob?.status === 'DONE' && empJob?.progressPct === 100,
  `status=${empJob?.status} progress=${empJob?.progressPct}`,
)

const empDl1 = await req(ownerJar, 'GET', `/api/v1/exports/jobs/${empJob.id}/download`)
check(
  'employees export download: 200 + xlsx (PK zip magic) + attachment filename',
  empDl1.statusCode === 200 &&
    empDl1.bytes.subarray(0, 2).toString('latin1') === 'PK' &&
    (empDl1.headers['content-disposition'] ?? '').includes('employees.xlsx'),
  `status=${empDl1.statusCode} ct=${empDl1.headers['content-type']} bytes=${empDl1.bytes.length}`,
)
const empDl2 = await req(ownerJar, 'GET', `/api/v1/exports/jobs/${empJob.id}/download`)
check('employees export re-download is byte-identical (deterministic)', sha256(empDl1.bytes) === sha256(empDl2.bytes), sha256(empDl1.bytes).slice(0, 12) + '…')

const ledJob = (await req(ownerJar, 'POST', '/api/v1/exports/jobs', { kind: 'ledger' })).json?.data
check('ledger export job created (202) and DONE (inline queue)', ledJob?.status === 'DONE', `status=${ledJob?.status}`)
const ledDl = await req(ownerJar, 'GET', `/api/v1/exports/jobs/${ledJob.id}/download`)
check(
  'ledger export download: 200 + xlsx (PK zip magic) + ledger.xlsx filename',
  ledDl.statusCode === 200 &&
    ledDl.bytes.subarray(0, 2).toString('latin1') === 'PK' &&
    (ledDl.headers['content-disposition'] ?? '').includes('ledger.xlsx'),
  `status=${ledDl.statusCode} bytes=${ledDl.bytes.length}`,
)

const jobList = (await req(ownerJar, 'GET', '/api/v1/exports/jobs')).json?.data
check('export job list returns both jobs', (jobList?.items ?? []).length >= 2, `count=${jobList?.items?.length}`)

// ── 5. RBAC: MEMBER cannot create an export job (employee.write = ADMIN) ───────────────
const memberJar = makeJar()
const memberEmail = `exports-member.${stamp}@example.com`
await req(memberJar, 'POST', '/api/auth/sign-up/email', { name: 'EMember', email: memberEmail, password: 'S3cure!pass' })
const ms = await req(memberJar, 'GET', '/api/auth/get-session')
const memberUserId = ms.json?.user?.id
await prisma.member.upsert({
  where: { tenantId_userId: { tenantId, userId: memberUserId } },
  update: { role: 'MEMBER' },
  create: { tenantId, userId: memberUserId, role: 'MEMBER' },
})
const mSess = await prisma.session.findFirst({ where: { userId: memberUserId }, orderBy: { createdAt: 'desc' } })
if (mSess) await prisma.session.update({ where: { id: mSess.id }, data: { activeOrganizationId: tenantId } })

const memberJob = await req(memberJar, 'POST', '/api/v1/exports/jobs', { kind: 'employees' })
check('MEMBER creating an export job → 403 (employee.write requires ADMIN)', memberJob.statusCode === 403, `status=${memberJob.statusCode}`)

const memberRead = await req(memberJar, 'GET', '/api/v1/exports/jobs')
check('MEMBER can still list export jobs (MEMBER read gate)', memberRead.statusCode === 200, `status=${memberRead.statusCode}`)

// ── 6. Isolation: a second tenant cannot download the first tenant's job ───────────────
const ownerBJar = makeJar()
const ownerBEmail = `exports-ownerb.${stamp}@example.com`
await req(ownerBJar, 'POST', '/api/auth/sign-up/email', { name: 'EOwnerB', email: ownerBEmail, password: 'S3cure!pass' })
const ocb = await req(ownerBJar, 'POST', '/api/auth/organization/create', { name: `ExportOrgB ${stamp}`, slug: `exportorgb-${stamp}` })
const tenantB = ocb.json?.id ?? ocb.json?.organization?.id
const crossDl = await req(ownerBJar, 'GET', `/api/v1/exports/jobs/${empJob.id}/download`)
check("tenant B downloading tenant A's job → 404 (isolation)", crossDl.statusCode === 404, `status=${crossDl.statusCode} (A=${Boolean(tenantId)} B=${Boolean(tenantB)})`)

// ── Cleanup ─────────────────────────────────────────────────────────────────────────────
await rm(`storage/resumes/${tenantId}`, { recursive: true, force: true }).catch(() => {})
await rm(`storage/exports/${empJob.id}.xlsx`, { force: true }).catch(() => {})
await rm(`storage/exports/${ledJob.id}.xlsx`, { force: true }).catch(() => {})
await prisma.$executeRawUnsafe(`DELETE FROM "Member" WHERE "tenantId" IN ('${tenantId}','${tenantB}')`)
await prisma.$executeRawUnsafe(`DELETE FROM "ExportJob" WHERE "tenantId" IN ('${tenantId}','${tenantB}')`)
await prisma.$executeRawUnsafe(`DELETE FROM "Candidate" WHERE "tenantId" IN ('${tenantId}','${tenantB}')`)
await prisma.$executeRawUnsafe(`DELETE FROM "PayableInvoice" WHERE "tenantId" IN ('${tenantId}','${tenantB}')`)
await prisma.payrollRun.deleteMany({ where: { tenantId: { in: [tenantId, tenantB] } } }).catch(() => {})
await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, tenantB] } } }).catch(() => {})
await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, memberEmail, ownerBEmail] } } }).catch(() => {})
await app.close()
await prisma.$disconnect()

console.log('\n────────────────────────────')
const passed = results.filter(r => r.ok).length
console.log(`${passed}/${results.length} export runtime checks passed`)
process.exit(passed === results.length ? 0 : 1)
