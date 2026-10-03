/**
 * Runtime verification for the live API (not a unit test — it drives the real server over
 * HTTP against the real Neon database). Verifies, with real httpOnly session cookies:
 *
 *   1. Auth sign-up sets an HttpOnly cookie (no token in the JSON body) — Phase 1 §4.
 *   2. Organization creation resolves the session's activeOrganizationId (tenantId).
 *   3. A MEMBER can read (200) but is blocked with 403 on an ADMIN-gated write — the RBAC
 *      guard the plan's "MEMBER gets 403 on payroll.approve" targets. (The payroll routes were
 *      never ported to the TS tree, so this exercises the identical guard on a real ADMIN-only
 *      route: POST /hr/employees → 'employee.write'.)
 *   4. The SSE channel (`GET /api/v1/events`) pushes an `invalidate` frame to every subscriber
 *      when a write mutation succeeds — Phase 7.
 *
 * Run from apps/api with the server already listening on :4000:
 *   node scripts/verify-runtime.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import http from 'node:http'
import { PrismaClient } from '@prisma/client'

const BASE = 'http://127.0.0.1:4000'
const ORIGIN = 'http://localhost:5174'
const prisma = new PrismaClient()

const stamp = (Math.random() + 1).toString(36).slice(2, 10)
const results = []
function check(label, ok, detail = '') {
  results.push({ label, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

/** Tiny cookie jar: name -> raw cookie value. */
function makeJar() {
  const jar = new Map()
  return {
    cookies() {
      return [...jar.entries()].map(([n, v]) => `${n}=${v}`).join('; ')
    },
    absorb(res) {
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(';')
        const eq = pair.indexOf('=')
        if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
      }
    },
    names() {
      return [...jar.keys()]
    },
  }
}

async function req(jar, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      referer: `${ORIGIN}/`,
      ...(jar.cookies() ? { cookie: jar.cookies() } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  jar.absorb(res)
  let json = null
  try {
    json = await res.json()
  } catch {
    /* non-JSON body (e.g. the SSE stream) */
  }
  return { res, json }
}

// ── 1. Sign up the owner; assert HttpOnly cookie, no token in body ─────────────────────
const ownerJar = makeJar()
const ownerEmail = `owner.${stamp}@example.com`
const su = await req(ownerJar, 'POST', '/api/auth/sign-up/email', {
  name: 'Owner',
  email: ownerEmail,
  password: 'S3cure!pass',
})
const setCookies = su.res.headers.getSetCookie?.() ?? []
const cookieLine = setCookies.find(c => /session/i.test(c)) ?? setCookies[0] ?? ''
check(
  'sign-up returns an HttpOnly session cookie',
  /httponly/i.test(cookieLine),
  cookieLine ? cookieLine.split(';')[0].split('=')[0] : 'no cookie',
)
// The plan's invariant: no *auth token* ever lands in localStorage (XSS would exfiltrate it) —
// sessions live only in the HttpOnly cookie. Vendor libraries legitimately use the Web Storage
// APIs for non-auth purposes (react-router persists scroll position in sessionStorage;
// better-auth keeps a cross-tab message bus in localStorage), so the check targets what the
// plan actually forbids: a storage *write* whose key is token-shaped.
const webDist = new URL('../../web/dist/assets/', import.meta.url)
const bundleHits = []
for (const file of readdirSync(webDist)) {
  if (!file.endsWith('.js')) continue
  const src = readFileSync(new URL(file, webDist), 'utf8')
  for (const m of src.matchAll(/(localStorage|sessionStorage)\.setItem\(([^)]{0,120})/g)) {
    if (/token|auth|jwt|session/i.test(m[2] ?? '')) bundleHits.push(`${file}: ${m[0].slice(0, 80)}`)
  }
}
check(
  'production web bundle never writes a token-shaped key to Web Storage (cookie-only auth)',
  bundleHits.length === 0,
  bundleHits.length === 0
    ? `${readdirSync(webDist).length} chunks scanned`
    : bundleHits.slice(0, 3).join('; '),
)

// ── 2. Create the organization; session must now carry activeOrganizationId ─────────────
const oc = await req(ownerJar, 'POST', '/api/auth/organization/create', {
  name: `Org ${stamp}`,
  slug: `org-${stamp}`,
})
const tenantId = oc.json?.id ?? oc.json?.organization?.id ?? oc.json?.data?.organization?.id
check('organization created', Boolean(tenantId), tenantId ? `tenantId=${tenantId}` : JSON.stringify(oc.json).slice(0, 120))

const os = await req(ownerJar, 'GET', '/api/auth/get-session')
const ownerSession = os.json?.session ?? os.json?.data?.session ?? os.json
const ownerActiveOrg = ownerSession?.activeOrganizationId
check('owner session activeOrganizationId matches the tenant', ownerActiveOrg === tenantId, `active=${ownerActiveOrg}`)

// ── 3. Sign up a second user and make them a MEMBER of the tenant ───────────────────────
const memberJar = makeJar()
const memberEmail = `member.${stamp}@example.com`
await req(memberJar, 'POST', '/api/auth/sign-up/email', {
  name: 'Member',
  email: memberEmail,
  password: 'S3cure!pass',
})
const ms = await req(memberJar, 'GET', '/api/auth/get-session')
const memberUserId = ms.json?.user?.id ?? ms.json?.data?.user?.id

// Try the real built-in invite → accept flow first; fall back to a direct Member row (the
// org plugin's lowercase/uppercase role gap is a known, documented limitation — see auth.ts).
let memberSeeded = 'invite'
const invite = await req(ownerJar, 'POST', '/api/auth/organization/invite', {
  email: memberEmail,
  role: 'MEMBER',
})
const invitationId = invite.json?.invitation?.id ?? invite.json?.data?.invitation?.id
let accepted = false
if (invitationId) {
  const acc = await req(memberJar, 'POST', '/api/auth/organization/accept-invitation', {
    invitationId,
    organizationId: tenantId,
  })
  accepted = acc.res.status < 300
}
if (!accepted) {
  memberSeeded = 'prisma-direct'
  await prisma.member.upsert({
    where: { tenantId_userId: { tenantId, userId: memberUserId } },
    update: { role: 'MEMBER' },
    create: { tenantId, userId: memberUserId, role: 'MEMBER' },
  })
  const sess = await prisma.session.findFirst({ where: { userId: memberUserId }, orderBy: { createdAt: 'desc' } })
  if (sess) await prisma.session.update({ where: { id: sess.id }, data: { activeOrganizationId: tenantId } })
}

const mres = await req(memberJar, 'GET', '/api/auth/get-session')
const memberSession = mres.json?.session ?? mres.json?.data?.session ?? mres.json
check(
  `member is a MEMBER with active org (seeded via ${memberSeeded})`,
  memberSession?.activeOrganizationId === tenantId,
  `active=${memberSession?.activeOrganizationId}`,
)
const memberRow = await prisma.member.findUnique({
  where: { tenantId_userId: { tenantId, userId: memberUserId } },
})
check('member row role is MEMBER', memberRow?.role === 'MEMBER', `role=${memberRow?.role}`)

// ── 4. MEMBER can READ (200) but is blocked (403) on an ADMIN-gated WRITE ────────────────
const read = await req(memberJar, 'GET', '/api/v1/hr/employees?limit=1')
check('MEMBER reads /hr/employees → 200', read.res.status === 200, `status=${read.res.status}`)

const memberWrite = await req(memberJar, 'POST', '/api/v1/hr/employees', {
  name: 'Test Member',
  title: 'Analyst',
})
check(
  'MEMBER writes /hr/employees → 403 (RBAC: needs employee.write → ADMIN)',
  memberWrite.res.status === 403,
  `status=${memberWrite.res.status}`,
)

const memberInvWrite = await req(memberJar, 'POST', '/api/v1/inventory/products', {
  name: 'X',
  sku: `SKU${stamp}`,
})
check('MEMBER writes /inventory/products → 403 (RBAC: needs inventory.write → ADMIN)', memberInvWrite.res.status === 403, `status=${memberInvWrite.res.status}`)

// Unauthenticated reads must be 401.
const anon = await req(makeJar(), 'GET', '/api/v1/hr/employees')
check('unauthenticated /hr/employees → 401', anon.res.status === 401, `status=${anon.res.status}`)

// ── 5. OWNER can do the same write (guard lets the right role through) ───────────────────
const ownerWrite = await req(ownerJar, 'POST', '/api/v1/hr/employees', {
  name: `New Employee ${stamp}`,
  title: 'Engineer',
})
check('OWNER writes /hr/employees → 201 (guard passes for OWNER)', ownerWrite.res.status === 201, `status=${ownerWrite.res.status}`)

// ── 5b. Tenant isolation: a brand-new tenant must NOT see tenant A's rows ─────────────────
// Tenant A (ownerJar) now holds the employee created above. Tenant B (ownerB) is a separate
// organization with its own tenantId — its employee list must be empty, proving `tenantId` is
// read from the session and never leaks rows across tenants.
const ownerBJar = makeJar()
const ownerBEmail = `ownerb.${stamp}@example.com`
await req(ownerBJar, 'POST', '/api/auth/sign-up/email', {
  name: 'Owner B',
  email: ownerBEmail,
  password: 'S3cure!pass',
})
const ocb = await req(ownerBJar, 'POST', '/api/auth/organization/create', {
  name: `Org B ${stamp}`,
  slug: `orgb-${stamp}`,
})
const tenantB = ocb.json?.id ?? ocb.json?.organization?.id
const bList = await req(ownerBJar, 'GET', '/api/v1/hr/employees?limit=100')
const bItems = bList.json?.data?.items ?? []
const sessionB = await req(ownerBJar, 'GET', '/api/auth/get-session')
const bActiveOrg = (sessionB.json?.session ?? sessionB.json?.data?.session ?? sessionB.json)?.activeOrganizationId
check('tenant B is a distinct organization', Boolean(tenantB) && tenantB !== tenantId, `A=${tenantId} B=${tenantB}`)
check(
  'tenant isolation: OWNER B sees ZERO of tenant A\'s employees',
  bList.res.status === 200 && bItems.length === 0,
  `B active=${bActiveOrg === tenantB}, B employee count=${bItems.length} (A had ≥1)`,
)

// ── 6. SSE push: two subscribers both receive the invalidation on a write ─────────────────
// Open a raw `node:http` GET (the canonical way to read `text/event-stream` — fetch's `res.body`
// is unreliable for a hijacked stream in this Node build). Returns { buf, done, destroy }.
function openSse(jar) {
  const reqObj = http.get(
    {
      host: '127.0.0.1',
      port: 4000,
      path: '/api/v1/events',
      headers: { origin: ORIGIN, cookie: jar.cookies(), accept: 'text/event-stream' },
    },
    () => {}, // response headers; frames arrive on 'data'
  )
  const state = { buf: '', done: false, res: null, req: reqObj }
  reqObj.on('response', res => {
    state.res = res
    res.on('data', chunk => {
      state.buf += chunk.toString()
      if (state.buf.includes('"invalidate"')) state.done = true
    })
  })
  reqObj.on('error', () => {
    state.done = true
  })
  return state
}

const sseA = openSse(ownerJar)
const sseB = openSse(memberJar)
await new Promise(r => setTimeout(r, 700)) // let both subscribe

// Trigger a write on the tenant: owner creates a department (hr module → keys ['asas,hr']).
const dept = await req(ownerJar, 'POST', '/api/v1/hr/departments', { name: `Dept ${stamp}` })
check('OWNER writes /hr/departments → 201 (triggers SSE publish)', dept.res.status === 201, `status=${dept.res.status}`)

// Wait until both sockets have seen an `invalidate` frame (or a 4 s deadline).
const waitDone = async (state, ms) => {
  const start = Date.now()
  while (!state.done && Date.now() - start < ms) {
    await new Promise(r => setTimeout(r, 50))
  }
}
await Promise.all([waitDone(sseA, 4000), waitDone(sseB, 4000)])
sseA.req.destroy()
sseB.req.destroy()

const evtA = sseA.buf
const evtB = sseB.buf
const keysA = evtA.match(/"asas,hr"/g)
check(
  'subscriber A (owner) received SSE invalidate with keys ["asas,hr"]',
  Boolean(keysA),
  keysA ? `${keysA.length} match` : evtA.slice(0, 80),
)
check(
  'subscriber B (member) also received the SSE invalidate (cross-window)',
  evtB.includes('"invalidate"') && evtB.includes('"asas,hr"'),
)
check('SSE stream sent a `: connected` acknowledgment frame', evtA.includes(': connected'), evtA.slice(0, 40))

// ── Cleanup: remove the seeded rows so repeated runs stay idempotent ─────────────────────
await prisma.$executeRawUnsafe(
  `DELETE FROM "Member" WHERE "tenantId" IN ('${tenantId}', '${tenantB}')`,
)
await prisma.tenant
  .deleteMany({ where: { id: { in: [tenantId, tenantB] } } })
  .catch(() => {})
await prisma.user
  .deleteMany({ where: { email: { in: [ownerEmail, memberEmail, ownerBEmail] } } })
  .catch(() => {})
await prisma.$disconnect()

console.log('\n────────────────────────────')
const passed = results.filter(r => r.ok).length
console.log(`${passed}/${results.length} runtime checks passed`)
process.exit(passed === results.length ? 0 : 1)
