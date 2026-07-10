import pg from 'pg'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const { Pool } = pg
export const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null

export async function migrate() {
  if (!pool) return
  const sql = await readFile(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8')
  await pool.query(sql)
}

export async function listServices() {
  if (!pool) return null
  const { rows } = await pool.query('select * from services order by updated_at desc')
  return rows
}

export async function upsertService(service: Record<string, unknown>) {
  if (!pool) return service
  const values = [service.name, service.description, service.owner, service.system, service.lifecycle, service.language, service.repository, service.metadata, service.score, service.installationId]
  const { rows } = await pool.query(`
    insert into services (name, description, owner, system, lifecycle, language, repository, metadata, score, installation_id)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    on conflict (name) do update set description=excluded.description, owner=excluded.owner,
      system=excluded.system, lifecycle=excluded.lifecycle, language=excluded.language,
      repository=excluded.repository, metadata=excluded.metadata, score=excluded.score,
      installation_id=excluded.installation_id, updated_at=now()
    returning *`, values)
  return rows[0]
}
