import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.waitReady
  await db.exec([
    "CREATE TYPE \"CandidateStage\" AS ENUM ('APPLIED', 'SCREENING', 'TECH_INTERVIEW', 'FINAL_INTERVIEW', 'OFFER_SENT', 'HIRED', 'REJECTED');",
    "CREATE TABLE \"Candidate\" (\"id\" text PRIMARY KEY, \"tenantId\" text NOT NULL, \"stage\" \"CandidateStage\" NOT NULL DEFAULT 'APPLIED', \"updatedAt\" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);",
    "CREATE TABLE \"CandidateActivity\" (\"id\" text PRIMARY KEY, \"candidateId\" text NOT NULL, \"action\" text NOT NULL, \"description\" text, \"createdAt\" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP);",
    "INSERT INTO \"Candidate\" (\"id\", \"tenantId\", \"stage\", \"updatedAt\") VALUES ('legacy_applied', 'tenant_1', 'APPLIED', '2026-08-01 00:00:00'), ('legacy_hired', 'tenant_1', 'HIRED', '2026-08-10 00:00:00');",
    "INSERT INTO \"CandidateActivity\" (\"id\", \"candidateId\", \"action\") VALUES ('activity_1', 'legacy_hired', 'created');",
  ].join('\n'))
  const migration = readFileSync(new URL('../prisma/migrations/20261007180000_candidate_pipeline_metrics/migration.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  const interviewMigration = readFileSync(new URL('../prisma/migrations/20261007220000_candidate_interviews/migration.sql', import.meta.url), 'utf8')
  await db.exec(interviewMigration)
}, 30_000)

afterAll(async () => { await db?.close() })

describe('recruitment pipeline migration', () => {
  it('backfills stage entry time and supports typed stage-change history', async () => {
    const rows = await db.query<{ id: string; stageEnteredAt: string }>('SELECT "id", "stageEnteredAt"::text AS "stageEnteredAt" FROM "Candidate" ORDER BY "id"')
    expect(rows.rows).toEqual([
      { id: 'legacy_applied', stageEnteredAt: '2026-08-01 00:00:00' },
      { id: 'legacy_hired', stageEnteredAt: '2026-08-10 00:00:00' },
    ])
    await db.query(
      'INSERT INTO "CandidateActivity" ("id", "candidateId", "action", "fromStage", "toStage") VALUES ($1, $2, $3, $4, $5)',
      ['activity_2', 'legacy_hired', 'stage.changed', 'OFFER_SENT', 'HIRED'],
    )
    const activity = await db.query<{ fromStage: string; toStage: string }>('SELECT "fromStage"::text AS "fromStage", "toStage"::text AS "toStage" FROM "CandidateActivity" WHERE "id" = $1', ['activity_2'])
    expect(activity.rows[0]).toEqual({ fromStage: 'OFFER_SENT', toStage: 'HIRED' })
  })

  it('creates candidate interviews with a checked duration, typed stage and cascading candidate link', async () => {
    const interview = await db.query(
      'INSERT INTO "CandidateInterview" ("id", "candidateId", "startsAt", "stage", "updatedAt") VALUES ($1, $2, $3, $4, $5) RETURNING "status"::text AS status, "durationMin", "stage"::text AS stage',
      ['interview_1', 'legacy_applied', '2026-10-10 10:00:00', 'TECH_INTERVIEW', '2026-10-01 00:00:00'],
    )
    expect(interview.rows[0]).toEqual({ status: 'SCHEDULED', durationMin: 60, stage: 'TECH_INTERVIEW' })
    await expect(db.query(
      'INSERT INTO "CandidateInterview" ("id", "candidateId", "startsAt", "durationMin", "stage", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6)',
      ['interview_bad', 'legacy_applied', '2026-10-10 10:00:00', 10, 'SCREENING', '2026-10-01 00:00:00'],
    )).rejects.toThrow()
    await db.query('DELETE FROM "Candidate" WHERE "id" = $1', ['legacy_applied'])
    const remaining = await db.query('SELECT count(*)::int AS count FROM "CandidateInterview" WHERE "id" = $1', ['interview_1'])
    expect(remaining.rows[0]?.count).toBe(0)
  })
})
