import { Client } from 'pg'

const client = new Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const tables = await client.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' ORDER BY table_name
`)
console.log(`Total tables: ${tables.rows.length}`)

for (const name of ['Tenant', 'User', 'Member', 'Session', 'Account', 'Employee', 'AuditLog', '_prisma_migrations']) {
  try {
    const result = await client.query(`SELECT COUNT(*) FROM "${name}"`)
    console.log(`${name}: ${result.rows[0].count} rows`)
  } catch (error) {
    console.log(`${name}: (error: ${error.message})`)
  }
}

const migrations = await client.query(`
  SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at
`).catch(() => null)
if (migrations) {
  console.log('Applied migrations:')
  for (const row of migrations.rows) console.log(`  - ${row.migration_name} (finished: ${row.finished_at !== null})`)
}

await client.end()
