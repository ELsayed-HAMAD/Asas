import { Client } from 'pg'

const client = new Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const existing = await client.query(`SELECT 1 FROM pg_database WHERE datname = 'asas_dev'`)
if (existing.rows.length > 0) {
  console.log('Database asas_dev already exists \u2014 leaving it as is.')
} else {
  await client.query('CREATE DATABASE asas_dev')
  console.log('Created database asas_dev')
}

await client.end()
