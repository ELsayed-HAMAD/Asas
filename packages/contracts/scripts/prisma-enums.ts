/**
 * Prisma → Zod enum codegen.
 *
 * Enums are the one part of the contract that has an unambiguous upstream owner: the database
 * decides which values a column may hold, so a hand-written Zod copy can only ever drift from
 * it. This module parses `schema.prisma` and renders the Zod module; `generate-enums.ts` writes
 * it, and `src/enums.generated.test.ts` re-renders it in memory and fails if the checked-in
 * file disagrees. That test is the divergence alarm the plan calls for — CI catches a Prisma
 * enum change that nobody mirrored, instead of a 422 in production.
 *
 * Kept to plain string parsing on purpose: importing `@prisma/internals` to read a schema would
 * pull the entire Prisma toolchain into the contracts package for one list of identifiers.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface PrismaEnum {
  readonly name: string
  readonly values: readonly string[]
}

const HERE = dirname(fileURLToPath(import.meta.url))

/** Where the generated module lands. */
export const GENERATED_FILE = resolve(HERE, '../src/enums.generated.ts')

/**
 * Candidate schema locations, in priority order.
 *
 * The API schema is kept in the active monorepo location.
 */
const SCHEMA_CANDIDATES = [
  resolve(HERE, '../../../apps/api/prisma/schema.prisma'),
]

export function locateSchema(candidates: readonly string[] = SCHEMA_CANDIDATES): string {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(
    `Could not find schema.prisma. Looked in:\n${candidates.map(c => `  - ${c}`).join('\n')}`,
  )
}

// `enum Name {` … `}`. Prisma enum values are bare identifiers, optionally carrying an
// `@map("...")` attribute; the identifier is what the client sends and receives, so the map
// target is deliberately ignored.
const ENUM_BLOCK = /^enum\s+(\w+)\s*\{([^}]*)\}/gm
const ENUM_VALUE = /^\s*(\w+)/

export function parsePrismaEnums(schemaSource: string): PrismaEnum[] {
  const enums: PrismaEnum[] = []

  for (const match of schemaSource.matchAll(ENUM_BLOCK)) {
    const name = match[1] as string
    const body = match[2] as string

    const values: string[] = []
    for (const rawLine of body.split('\n')) {
      const line = rawLine.replace(/\/\/.*$/, '').trim()
      if (line === '' || line.startsWith('@@')) continue
      const value = ENUM_VALUE.exec(line)?.[1]
      if (value !== undefined) values.push(value)
    }

    if (values.length === 0) {
      throw new Error(`Prisma enum ${name} parsed to zero values — the parser is wrong`)
    }
    enums.push({ name, values })
  }

  if (enums.length === 0) throw new Error('No enums found in schema.prisma — the parser is wrong')

  return enums.sort((a, b) => a.name.localeCompare(b.name))
}

/** `UserRole` → `userRoleSchema`. */
function schemaConstName(enumName: string): string {
  return `${enumName.charAt(0).toLowerCase()}${enumName.slice(1)}Schema`
}

export function renderEnumsModule(enums: readonly PrismaEnum[]): string {
  const header = [
    '// AUTO-GENERATED — DO NOT EDIT.',
    '//',
    '// Source: apps/api/prisma/schema.prisma (see scripts/prisma-enums.ts).',
    '// Regenerate with `pnpm --filter @asas/contracts generate:enums`.',
    '//',
    '// `enums.generated.test.ts` fails if this file no longer matches the Prisma schema, so a',
    '// database enum change cannot silently diverge from the API contract.',
    '',
    "import { z } from 'zod'",
    '',
  ].join('\n')

  const blocks = enums.map(({ name, values }) => {
    const constName = schemaConstName(name)
    const literals = values.map(value => `  '${value}',`).join('\n')
    return [
      `export const ${name}Values = [`,
      literals,
      `] as const satisfies readonly string[]`,
      '',
      `export const ${constName} = z.enum(${name}Values)`,
      '',
      `export type ${name} = z.infer<typeof ${constName}>`,
    ].join('\n')
  })

  const registry = [
    '/**',
    ' * Every generated enum, keyed by its Prisma name. Used by the contract test and by any',
    ' * caller that needs to enumerate enums generically (e.g. rendering a filter dropdown).',
    ' */',
    'export const prismaEnums = {',
    ...enums.map(({ name }) => `  ${name}: ${name}Values,`),
    '} as const',
  ].join('\n')

  return `${header}\n${blocks.join('\n\n')}\n\n${registry}\n`
}

export function generateEnumsModule(schemaPath: string = locateSchema()): string {
  return renderEnumsModule(parsePrismaEnums(readFileSync(schemaPath, 'utf8')))
}

/** Convenience for the test, which needs the same path resolution the generator used. */
export function readGeneratedFile(path: string = GENERATED_FILE): string {
  return readFileSync(path, 'utf8')
}

export const SCHEMA_SEARCH_PATHS = SCHEMA_CANDIDATES
export const PACKAGE_ROOT = join(HERE, '..')
