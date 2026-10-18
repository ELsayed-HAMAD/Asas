#!/usr/bin/env node
/**
 * Tenant-filter tripwire (REVIEW.md finding F2).
 *
 * Tenant isolation in this API is convention-based: every query must hand-carry `tenantId`,
 * and raw SQL is no exception. This check scans every `$queryRaw`/`$executeRaw` call site
 * under src/ and fails when the raw SQL template contains neither a `tenantId` reference
 * nor an explicit opt-out marker:
 *
 *   - `tenant-scope: all`  — the query legitimately spans every tenant (maintenance sweeps,
 *                            the `SELECT 1` health probe).
 *   - `tenant-filter: <x>` — the tenant filter is delegated to a composed `Prisma.sql`
 *                            fragment (e.g. a shared `buildProductWhere` helper).
 *
 * A new raw query that forgets the filter now fails `pnpm lint` (and therefore CI) instead
 * of silently leaking another tenant's rows at runtime. The durable fix (Prisma client
 * extension or Postgres RLS) is still tracked in REVIEW.md; this is the cheap backstop.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const srcDir = join(root, 'src')

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (entry.endsWith('.ts')) yield full
  }
}

const RAW_CALL = /\$(queryRaw|executeRaw)(Unsafe)?\s*[<(`]/
const failures = []
let checked = 0

for (const file of walk(srcDir)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim()
    // Prose mentions of `$queryRaw` in doc comments are not call sites.
    if (!RAW_CALL.test(trimmed)) continue
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue
    checked += 1
    // Accumulate the template literal: the call line opens it; keep collecting until the
    // backticks balance (an even count of at least two).
    let block = lines[i]
    let j = i
    for (;;) {
      const backticks = (block.match(/`/g) ?? []).length
      if (backticks >= 2 && backticks % 2 === 0) break
      j += 1
      if (j >= lines.length) break
      block += `\n${lines[j]}`
    }
    if (/tenantId/.test(block)) continue
    if (/tenant-scope:\s*all/.test(block)) continue
    if (/tenant-filter:\s*\S/.test(block)) continue
    failures.push(`${relative(root, file).replaceAll('\\', '/')}:${i + 1}`)
  }
}

if (failures.length > 0) {
  console.error(`check-tenant-filters: ${failures.length} raw SQL call site(s) without a visible tenant filter:`)
  for (const failure of failures) console.error(`  ${failure}`)
  console.error('Add a `tenantId` filter to the query, or an explicit `tenant-scope: all` / `tenant-filter: <helper>` marker if it is intentionally tenant-wide.')
  process.exit(1)
}
console.log(`check-tenant-filters: ${checked} raw SQL call site(s) checked, all tenant-filtered or explicitly opted out`)
