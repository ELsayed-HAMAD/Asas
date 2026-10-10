/**
 * CLI entry: write `src/enums.generated.ts` from `schema.prisma`.
 *
 * Run with `pnpm --filter @asas/contracts generate:enums`. Node executes this TypeScript
 * directly (native type stripping), so there is no build step between editing the schema and
 * regenerating the contract.
 */
import { writeFileSync } from 'node:fs'
import { relative } from 'node:path'
import {
  GENERATED_FILE,
  generateEnumsModule,
  locateSchema,
  PACKAGE_ROOT,
  parsePrismaEnums,
} from './prisma-enums.ts'
import { readFileSync } from 'node:fs'

const schemaPath = locateSchema()
const source = readFileSync(schemaPath, 'utf8')
const enums = parsePrismaEnums(source)
const rendered = generateEnumsModule(schemaPath)

writeFileSync(GENERATED_FILE, rendered, 'utf8')

const values = enums.reduce((total, current) => total + current.values.length, 0)
process.stdout.write(
  `Generated ${enums.length} enums (${values} values) from ${relative(PACKAGE_ROOT, schemaPath)}\n` +
    `  → ${relative(PACKAGE_ROOT, GENERATED_FILE)}\n`,
)
